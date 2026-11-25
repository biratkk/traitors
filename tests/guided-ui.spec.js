import { test, expect } from '@playwright/test'

test.use({ serviceWorkers: 'block' })

const players = [
  { id: 'a', name: 'Alice', status: 'alive', connected: true },
  { id: 'b', name: 'Bob', status: 'alive', connected: true },
  { id: 'c', name: 'Charlie', status: 'alive', connected: true },
  { id: 'd', name: 'Dana', status: 'alive', connected: true },
]

async function mockGame(page, kind, state, onCommand = () => {}) {
  await page.addInitScript(
    (session) => {
      localStorage.setItem('traitors-v2-session', JSON.stringify(session))
    },
    {
      kind,
      code: 'ABC123',
      token: 'test-token',
      name: kind === 'player' ? 'Charlie' : undefined,
    },
  )
  await page.route('**/rest/v1/rpc/**', async (route) => {
    const method = route.request().url().split('/').pop()
    const body = route.request().postDataJSON()
    if (method === 'game2_state') {
      await route.fulfill({
        json: { ...state, serverTime: new Date().toISOString() },
      })
    } else {
      onCommand(method, body)
      await route.fulfill({ json: null })
    }
  })
  await page.goto('/')
}

function baseState(phase) {
  return {
    phase,
    players,
    candidates: [],
    eligible: 2,
    received: 0,
    phaseEndsAt: null,
    selectedPlayer: null,
    revealedRole: null,
    self: { id: 'c', name: 'Charlie', status: 'alive', role: 'traitor' },
    fellowTraitors: ['Dana'],
    voted: false,
    nightChoices: [],
    nightLocked: false,
  }
}

test('TV displays the current prompt and player status without controls', async ({
  page,
}) => {
  const state = baseState('defense')
  state.defender = 'Alice'
  state.phaseEndsAt = new Date(Date.now() + 60_000).toISOString()
  await mockGame(page, 'tv', state)
  await expect(
    page.getByRole('heading', { name: 'Alice, defend yourself' }),
  ).toBeVisible()
  await expect(page.locator('.game-timer')).toBeVisible()
  await expect(page.getByRole('button')).toHaveCount(0)
  await expect(page.getByText('Room code:')).toBeVisible()
  await expect(page.locator('.status-card')).toHaveCount(4)
  const sizes = await page.evaluate(() => ({
    prompt: document.querySelector('.tv-prompt').getBoundingClientRect().width,
    screen: document.querySelector('.tv-view').getBoundingClientRect().width,
  }))
  expect(sizes.prompt / sizes.screen).toBeCloseTo(0.8, 1)
  state.phase = 'banishment'
  state.selectedPlayer = 'Alice'
  state.phaseEndsAt = null
  await expect(
    page.getByRole('heading', { name: 'Alice, please stand' }),
  ).toBeVisible({ timeout: 10_000 })
  await expect(page.getByText(/was a Faithful/)).toHaveCount(0)
  state.phase = 'revealed'
  state.revealedRole = 'faithful'
  await expect(
    page.getByRole('heading', { name: 'Alice was a Faithful' }),
  ).toBeVisible({ timeout: 10_000 })
  state.phase = 'morning'
  state.selectedPlayer = 'Bob'
  await expect(page.getByText(/Bob was murdered/)).toBeVisible({
    timeout: 10_000,
  })
})

test('a revote offers only tied players and the selected player reveals privately', async ({
  page,
}) => {
  const state = baseState('revote')
  state.candidates = [players[0], players[1]]
  await mockGame(page, 'player', state, (method, body) => {
    if (method === 'game2_vote') {
      expect(body.target_input).toBe('a')
      state.phase = 'banishment'
      state.isSelected = true
      state.selectedPlayer = 'Charlie'
    }
    if (method === 'game2_reveal') {
      state.phase = 'revealed'
      state.isSelected = false
      state.self = { ...state.self, status: 'banished' }
    }
  })
  await expect(
    page.getByRole('button', { name: 'Alice', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Bob', exact: true }),
  ).toBeVisible()
  await expect(
    page.getByRole('button', { name: 'Dana', exact: true }),
  ).toHaveCount(0)
  await page.getByRole('button', { name: 'Alice', exact: true }).click()
  await expect(
    page.getByText('Private prompt. Do not read this aloud.'),
  ).toBeVisible({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Reveal my role' }).click()
  await expect(page.getByText('You have been banished.')).toBeVisible({
    timeout: 10_000,
  })
})

test('traitors see each other’s choices and lock only after agreement', async ({
  page,
}) => {
  const state = baseState('night')
  state.nightChoices = [
    { name: 'Dana', targetId: 'a', targetName: 'Alice', locked: false },
  ]
  await mockGame(page, 'player', state, (method, body) => {
    if (method === 'game2_night_choice') {
      state.nightChoices = [
        state.nightChoices[0],
        {
          name: 'Charlie',
          targetId: body.target_input,
          targetName: players.find((p) => p.id === body.target_input).name,
          locked: false,
        },
      ]
    }
    if (method === 'game2_night_lock') state.phase = 'blindfold'
  })
  await expect(page.getByText('Dana: Alice')).toBeVisible()
  await page.getByRole('button', { name: 'Bob', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lock in' })).toBeDisabled()
  await page.getByRole('button', { name: 'Alice', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Lock in' })).toBeEnabled({
    timeout: 10_000,
  })
  await page.getByRole('button', { name: 'Lock in' }).click()
  await expect(page.getByText(/put your blindfolds back on/i)).toBeVisible({
    timeout: 10_000,
  })
})

test('host starts a night mix, plays the knife, fades it, and plays birds', async ({
  page,
}) => {
  const state = baseState('revealed')
  state.selectedPlayer = 'Alice'
  state.revealedRole = 'faithful'
  await page.addInitScript(() => {
    window.audioEvents = []
    class FakeAudioContext {
      state = 'running'
      currentTime = 100
      destination = {}
      resume() {
        return Promise.resolve()
      }
      close() {
        return Promise.resolve()
      }
      decodeAudioData() {
        return Promise.resolve({})
      }
      createBufferSource() {
        return {
          connect() {},
          disconnect() {},
          start() {
            window.audioEvents.push('start')
          },
          stop() {
            window.audioEvents.push('stop')
          },
        }
      }
      createGain() {
        return {
          connect() {},
          disconnect() {},
          gain: {
            value: 1,
            cancelScheduledValues() {},
            setValueAtTime(value, time) {
              window.audioEvents.push(['set', value, time])
            },
            linearRampToValueAtTime(value, time) {
              window.audioEvents.push(['ramp', value, time])
            },
          },
        }
      }
    }
    window.AudioContext = FakeAudioContext
  })
  const requested = []
  await page.route('**/sounds/**', async (route) => {
    requested.push(route.request().url())
    await route.fulfill({ status: 200, body: 'audio' })
  })
  await mockGame(page, 'host', state, (method, body) => {
    if (method === 'game2_command' && body.command_input === 'start_night')
      state.phase = 'night'
  })
  await expect(
    page.getByRole('button', { name: 'Let the night begin' }),
  ).toBeVisible()
  await page.getByRole('button', { name: 'Let the night begin' }).click()
  await expect(
    page.getByRole('heading', { name: 'Night has fallen' }),
  ).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(() =>
      page.evaluate(
        () => window.audioEvents.filter((event) => event === 'start').length,
      ),
    )
    .toBe(3)
  expect(requested.some((url) => url.includes('2658.wav'))).toBeTruthy()
  expect(requested.some((url) => url.includes('2152.mp3'))).toBeTruthy()
  state.phase = 'blindfold'
  state.phaseEndsAt = new Date(Date.now() + 40_000).toISOString()
  await expect(
    page.getByRole('heading', { name: 'Traitors, cover your eyes' }),
  ).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(() =>
      page.evaluate(
        () => window.audioEvents.filter((event) => event === 'start').length,
      ),
    )
    .toBe(4)
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          window.audioEvents.filter(
            (event) => Array.isArray(event) && event[0] === 'ramp',
          ).length,
      ),
    )
    .toBe(3)
  state.phase = 'morning'
  state.phaseEndsAt = null
  state.selectedPlayer = 'Bob'
  await expect(
    page.getByRole('heading', { name: 'An empty seat at breakfast' }),
  ).toBeVisible({ timeout: 10_000 })
  await expect
    .poll(() =>
      page.evaluate(
        () => window.audioEvents.filter((event) => event === 'start').length,
      ),
    )
    .toBe(5)
})

test('host starts the round table after the mission', async ({ page }) => {
  const state = baseState('mission_complete')
  await mockGame(page, 'host', state, (method, body) => {
    if (
      method === 'game2_command' &&
      body.command_input === 'start_discussion'
    ) {
      state.phase = 'discussion'
      state.phaseEndsAt = new Date(Date.now() + 300_000).toISOString()
    }
  })
  await expect(
    page.getByRole('heading', { name: 'Mission complete' }),
  ).toBeVisible()
  await expect(page.locator('.game-timer')).toHaveCount(0)
  await expect(page.getByRole('button')).toHaveCount(1)
  await page.getByRole('button', { name: 'Start round table' }).click()
  await expect(
    page.getByRole('heading', { name: 'The round table' }),
  ).toBeVisible()
  await expect(page.locator('.game-timer')).toBeVisible()
})
