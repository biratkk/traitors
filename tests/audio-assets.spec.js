import { test, expect } from '@playwright/test'

test('night audio files decode in the browser', async ({ page }) => {
  await page.goto('/')
  const assets = ['2658.wav', '667.wav', '492.wav', '2152.mp3', '2472.wav']
  const durations = await page.evaluate(async (names) => {
    const context = new AudioContext()
    try {
      return await Promise.all(names.map(async (name) => {
        const response = await fetch(`/sounds/${name}`)
        if (!response.ok) throw new Error(`Could not fetch ${name}`)
        const decoded = await context.decodeAudioData(await response.arrayBuffer())
        return decoded.duration
      }))
    } finally {
      await context.close()
    }
  }, assets)
  expect(durations).toHaveLength(assets.length)
  for (const duration of durations) expect(duration).toBeGreaterThan(0)
})
