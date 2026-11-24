import { test, expect } from '@playwright/test'

async function addPlayer(page, name) {
  await page.getByRole('button', { name: 'Add player' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByLabel('Player name').fill(name)
  await dialog.getByRole('button', { name: 'Add player' }).click()
}

test.beforeEach(async ({ page }) => {
  // Keep the real browser audio implementation and expose created elements for assertions.
  await page.addInitScript(() => {
    const NativeAudio = window.Audio
    window.testAudio = []
    window.Audio = function (...args) {
      const audio = new NativeAudio(...args)
      window.testAudio.push(audio)
      return audio
    }
  })
  await page.goto('/')
})

test('adds players and rejects duplicate names', async ({ page }) => {
  await expect(page.locator('.home-player')).toHaveCount(0)
  await addPlayer(page, 'Alice')
  await expect(page.locator('.home-player')).toContainText('Alice')
  await expect(page.locator('.home-player')).toContainText('Alive')
  await page.getByRole('button', { name: 'Add player' }).click()
  await page.getByLabel('Player name').fill('  alice  ')
  await page.getByRole('dialog').getByRole('button', { name: 'Add player' }).click()
  await expect(page.getByRole('button', { name: /Enter a unique player name/ })).toBeVisible()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Close' }).click()
  await expect(page.locator('.home-player')).toHaveCount(1)
})

test('kills and banishes players, and disables players who are out', async ({ page }) => {
  await addPlayer(page, 'Alice')
  await addPlayer(page, 'Bob')
  await page.getByRole('button', { name: 'Kill', exact: true }).click()
  await page.getByRole('button', { name: 'Alice' }).click()
  await expect(page.getByRole('button', { name: 'Alice Killed' })).toBeDisabled()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('.home-player').filter({ hasText: 'Alice' })).toContainText('Killed')
  await page.getByRole('button', { name: 'Banish', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Alice Killed' })).toBeDisabled()
  await page.getByRole('button', { name: 'Bob' }).click()
  await expect(page.getByRole('button', { name: 'Bob Banished' })).toBeDisabled()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.locator('.home-player').filter({ hasText: 'Bob' })).toContainText('Banished')
})

test('opens missions and returns home', async ({ page }) => {
  await page.getByRole('button', { name: 'Missions' }).click()
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
  await page.getByRole('button', { name: 'Back' }).click()
  await expect(page.getByRole('button', { name: 'Missions' })).toBeVisible()
})

test('plays multiple effects, shows progress, fades an effect, and stops all', async ({ page }) => {
  await page.getByRole('button', { name: 'Sounds' }).click()
  const thunder = page.getByRole('button', { name: 'Thunder', exact: true })
  const wind = page.getByRole('button', { name: 'Wind howling', exact: true })
  await thunder.click()
  await wind.click()
  await expect(thunder).toHaveAttribute('aria-pressed', 'true')
  await expect(wind).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.evaluate(() => window.testAudio.filter(a => !a.paused).length)).toBe(2)
  await expect.poll(() => page.evaluate(() => window.testAudio[0].currentTime)).toBeGreaterThan(0)
  await expect(thunder.locator('.playback-progress')).toBeVisible()
  await thunder.click()
  await expect(thunder).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => page.evaluate(() => window.testAudio[0].paused)).toBe(true)
  await expect(wind).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Stop all' }).click()
  await expect(wind).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => page.evaluate(() => window.testAudio.every(a => a.paused))).toBe(true)
})

test('holds an effect to loop and taps it to stop', async ({ page }) => {
  await page.getByRole('button', { name: 'Sounds' }).click()
  const effect = page.getByRole('button', { name: 'Gong', exact: true })
  const box = await effect.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await expect(effect.locator('.hold-progress')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Gong, looping' })).toHaveAttribute('aria-pressed', 'true')
  await page.mouse.up()
  const looping = page.getByRole('button', { name: 'Gong, looping' })
  await expect.poll(() => page.evaluate(() => window.testAudio[0]?.loop)).toBe(true)
  await looping.click()
  await expect(effect).toHaveAttribute('aria-pressed', 'false')
  await expect.poll(() => page.evaluate(() => window.testAudio[0].paused)).toBe(true)
})

test('plays and stops the day transitions', async ({ page }) => {
  await page.getByRole('button', { name: 'Sounds' }).click()
  for (const name of ['Start of day', 'Night falls']) {
    const button = page.getByRole('button', { name, exact: true })
    await button.click()
    await expect(button).toHaveAttribute('aria-pressed', 'true')
    await expect(button.locator('.playback-progress')).toBeVisible()
  }
  await page.getByRole('button', { name: 'Stop all' }).click()
  await expect.poll(() => page.evaluate(() => window.testAudio.every(a => a.paused))).toBe(true)
})

test('serves an installable manifest and sound files', async ({ page, request }) => {
  const manifestUrl = await page.locator('link[rel="manifest"]').getAttribute('href')
  const manifest = await (await request.get(manifestUrl)).json()
  expect(manifest.name).toBe('The Traitors Dashboard')
  expect(manifest.display).toBe('standalone')
  for (const icon of manifest.icons) expect((await request.get(icon.src)).ok()).toBeTruthy()
  const sounds = (await import('../src/sounds.json', { with: { type: 'json' } })).default
  for (const url of Object.values(sounds)) {
    const response = await request.head(url)
    expect(response.ok(), url).toBeTruthy()
  }
})
