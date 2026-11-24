import { test, expect } from '@playwright/test'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY

test('TV, host, and players share a game and recover their state', async ({
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
    const privateTable = await createClient(url, key)
      .from('game_players')
      .select('*')
    expect(privateTable.error).not.toBeNull()
    const tv = await open()
    await tv.getByRole('button', { name: 'TV', exact: true }).click()
    await tv.getByRole('button', { name: 'Create game' }).click()
    await expect(tv.getByText(/Room code:/)).toBeVisible({ timeout: 15_000 })
    session = await tv.evaluate(() =>
      JSON.parse(localStorage.getItem('traitors-v2-session')),
    )
    const host = await open()
    await host.getByRole('button', { name: 'Host', exact: true }).click()
    await host.getByLabel('Room code').fill(session.code)
    await host.getByRole('button', { name: 'Join game' }).click()
    await expect(host.getByText('Phase: lobby')).toBeVisible({
      timeout: 15_000,
    })
    await expect(host.getByText(/Room code:/)).toHaveCount(0)
    const players = []
    for (const name of ['Alice', 'Bob', 'Charlie', 'Dana']) {
      const page = await open()
      await page.getByRole('button', { name: 'Player', exact: true }).click()
      await page.getByLabel('Room code').fill(session.code)
      await page.getByLabel('Your name').fill(name)
      await page.getByRole('button', { name: 'Join game' }).click()
      await expect(
        page.getByText('Wait for the host to start the game.'),
      ).toBeVisible({ timeout: 15_000 })
      players.push({ name, page })
    }
    await expect(host.locator('.home-player')).toHaveCount(4, {
      timeout: 15_000,
    })
    await expect(
      tv.locator('.home-player').filter({ hasText: 'Alice' }),
    ).toContainText('Connected')
    await host.getByRole('button', { name: 'Assign roles' }).click()
    await expect(host.getByText('Phase: day')).toBeVisible({ timeout: 15_000 })
    const traitors = []
    const faithfuls = []
    for (const player of players) {
      await expect(player.page.getByText(/Your role:/)).toBeVisible({
        timeout: 15_000,
      })
      const role = await player.page.getByText(/Your role:/).textContent()
      ;(role.includes('Traitor') ? traitors : faithfuls).push(player)
    }
    expect(traitors).toHaveLength(2)
    expect(faithfuls).toHaveLength(2)
    await expect(host.getByText(/Your role:/)).toHaveCount(0)
    await traitors[0].page.reload()
    await expect(traitors[0].page.getByText('Your role: Traitor')).toBeVisible({
      timeout: 15_000,
    })
    await traitors[0].page.context().setOffline(true)
    await expect(traitors[0].page.getByText('Reconnecting...')).toBeVisible({
      timeout: 15_000,
    })
    await traitors[0].page.context().setOffline(false)
    await expect(
      traitors[0].page.getByText('Connected', { exact: true }),
    ).toBeVisible({ timeout: 15_000 })
    await expect(traitors[0].page.getByText('Your role: Traitor')).toBeVisible()
    await host.getByRole('button', { name: 'Start night' }).click()
    await expect(
      faithfuls[0].page.getByText('Night falls. Sleep tight.'),
    ).toBeVisible({ timeout: 15_000 })
    for (const [index, traitor] of traitors.entries()) {
      await traitor.page
        .getByRole('button', { name: faithfuls[index].name, exact: true })
        .click({ timeout: 15_000 })
    }
    await expect(
      host.getByText('Night vote tied. Choose a victim:'),
    ).toBeVisible({ timeout: 15_000 })
    await host
      .getByRole('button', { name: faithfuls[0].name, exact: true })
      .click()
    await expect(
      faithfuls[0].page.getByText('You have been killed.'),
    ).toBeVisible({ timeout: 15_000 })
    await expect(
      tv.locator('.home-player').filter({ hasText: faithfuls[0].name }),
    ).toContainText('Killed', { timeout: 15_000 })
    const recovered = await open()
    await recovered.getByRole('button', { name: 'Player', exact: true }).click()
    await recovered.getByLabel('Room code').fill(session.code)
    await recovered.getByLabel('Your name').fill(faithfuls[0].name)
    await recovered.getByRole('button', { name: 'Join game' }).click()
    await expect(recovered.getByText('You have been killed.')).toBeVisible({
      timeout: 15_000,
    })
    await host.getByRole('button', { name: 'Start vote' }).click()
    const alive = [...traitors, faithfuls[1]]
    for (let i = 0; i < alive.length; i++) {
      await alive[i].page
        .getByRole('button', {
          name: alive[(i + 1) % alive.length].name,
          exact: true,
        })
        .click({ timeout: 15_000 })
    }
    await expect(host.getByText(/Vote results:/)).toBeVisible({
      timeout: 15_000,
    })
    await host.getByRole('button', { name: 'Mission', exact: true }).click()
    await expect(
      faithfuls[1].page.getByText('Look at the TV for mission instructions.'),
    ).toBeVisible({ timeout: 15_000 })
    await faithfuls[1].page.close()
    await expect(
      host.locator('.home-player').filter({ hasText: faithfuls[1].name }),
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
