import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

test('TV, host and players share a game and recover their state', async ({
  browser,
}) => {
  test.skip(!url || !key, 'Supabase test credentials are not configured')
  test.setTimeout(120_000)
  const contexts = []
  let session
  async function open() {
    const context = await browser.newContext({
      viewport: { width: 1024, height: 768 },
    })
    contexts.push(context)
    const page = await context.newPage()
    await page.goto('http://127.0.0.1:4173/')
    return page
  }
  try {
    const client = createClient(url, key)
    const privateTable = await client.from('game_players').select('*')
    expect(privateTable.error).not.toBeNull()
    const tv = await open()
    await tv.getByRole('button', { name: 'TV', exact: true }).click()
    await tv.getByRole('button', { name: 'Create game' }).click()
    await expect(tv.getByText(/Room code:/)).toBeVisible({ timeout: 15_000 })
    await expect(tv.getByRole('button')).toHaveCount(0)
    session = await tv.evaluate(() =>
      JSON.parse(localStorage.getItem('traitors-v2-session')),
    )
    const host = await open()
    await host.getByRole('button', { name: 'Host', exact: true }).click()
    await host.getByLabel('Room code').fill(session.code)
    await host.getByRole('button', { name: 'Join game' }).click()
    await expect(
      host.getByRole('button', { name: 'Assign roles' }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(host.getByText(/Room code:/)).toHaveCount(0)
    const hostSession = await host.evaluate(() =>
      JSON.parse(localStorage.getItem('traitors-v2-session')),
    )
    const legacyAction = await client.rpc('game_command', {
      code_input: session.code,
      token_input: hostSession.token,
      command_input: 'day',
      value_input: null,
    })
    expect(legacyAction.error).not.toBeNull()
    const tvAction = await client.rpc('game2_command', {
      code_input: session.code,
      token_input: session.token,
      command_input: 'assign',
      value_input: '2',
    })
    expect(tvAction.error).not.toBeNull()
    const players = []
    for (const name of ['Alice', 'Bob', 'Charlie', 'Dana']) {
      const page = await open()
      await page.getByRole('button', { name: 'Player', exact: true }).click()
      await page.getByLabel('Room code').fill(session.code)
      await page.getByLabel('Your name').fill(name)
      await page.getByRole('button', { name: 'Join game' }).click()
      await expect(
        page.getByText('Look at the TV and wait for the host.'),
      ).toBeVisible({ timeout: 15_000 })
      players.push({ name, page })
    }
    await expect(host.locator('.status-card')).toHaveCount(4, {
      timeout: 15_000,
    })
    await expect(
      tv.locator('.status-card').filter({ hasText: 'Alice' }),
    ).toContainText('Connected')
    await host.getByRole('button', { name: 'Assign roles' }).click()
    await expect(
      host.getByRole('button', { name: 'Start next mission' }),
    ).toBeVisible({ timeout: 15_000 })
    const prematureNight = await client.rpc('game2_command', {
      code_input: session.code,
      token_input: hostSession.token,
      command_input: 'start_night',
      value_input: null,
    })
    expect(prematureNight.error).not.toBeNull()
    const traitors = []
    for (const player of players) {
      await player.page
        .getByRole('button', { name: 'Show my role' })
        .click({ timeout: 15_000 })
      const role = await player.page.getByText(/Your role:/).textContent()
      if (role.includes('Traitor')) traitors.push(player)
    }
    expect(traitors).toHaveLength(2)
    await expect(host.getByText(/Your role:/)).toHaveCount(0)
    await traitors[0].page.getByRole('button', { name: 'Hide my role' }).click()
    await expect(traitors[0].page.getByText(/Your role:/)).toHaveCount(0)
    await traitors[0].page.reload()
    await traitors[0].page
      .getByRole('button', { name: 'Show my role' })
      .click({ timeout: 15_000 })
    await expect(traitors[0].page.getByText('Your role: Traitor')).toBeVisible()
    await traitors[0].page.context().setOffline(true)
    await expect(traitors[0].page.getByText('Reconnecting...')).toBeVisible({
      timeout: 15_000,
    })
    await traitors[0].page.context().setOffline(false)
    await expect(
      traitors[0].page.getByText('Connected', { exact: true }),
    ).toBeVisible({ timeout: 15_000 })
    const recovered = await open()
    await recovered.getByRole('button', { name: 'Player', exact: true }).click()
    await recovered.getByLabel('Room code').fill(session.code)
    await recovered.getByLabel('Your name').fill(traitors[0].name)
    await recovered.getByRole('button', { name: 'Join game' }).click()
    await recovered
      .getByRole('button', { name: 'Show my role' })
      .click({ timeout: 15_000 })
    await expect(recovered.getByText('Your role: Traitor')).toBeVisible()
    await host.getByRole('button', { name: 'Start next mission' }).click()
    await expect(
      tv.getByRole('heading', { name: 'Mission in progress' }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(tv.locator('.game-timer')).toBeVisible()
    await host.getByRole('button', { name: 'Skip mission' }).click()
    await expect(
      tv.getByRole('heading', { name: 'Mission complete' }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(tv.locator('.game-timer')).toHaveCount(0)
    await expect(
      players[0].page.getByText(
        'The mission is complete. Wait for the host to start the round table.',
      ),
    ).toBeVisible({ timeout: 15_000 })
    await host.getByRole('button', { name: 'Start round table' }).click()
    await expect(
      tv.getByRole('heading', { name: 'The round table' }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(tv.locator('.game-timer')).toBeVisible()
    await expect(host.getByRole('button')).toHaveCount(0)
    await expect(tv.getByRole('button')).toHaveCount(0)
    const disconnectedPlayer = players.find(
      (player) => player.name !== traitors[0].name,
    )
    await disconnectedPlayer.page.close()
    await expect(
      host.locator('.status-card').filter({ hasText: disconnectedPlayer.name }),
    ).toContainText('Disconnected', { timeout: 45_000 })
  } finally {
    const cleanup = session
      ? createClient(url, key)
          .rpc('game_close', {
            code_input: session.code,
            token_input: session.token,
          })
          .then(({ error }) => {
            if (error) throw error
          })
      : Promise.resolve()
    await Promise.all([cleanup, ...contexts.map((context) => context.close())])
  }
})
