import { defineConfig, devices } from '@playwright/test'
import { loadEnv } from 'vite'

const localEnv = loadEnv('production', process.cwd(), 'VITE_SUPABASE_')
if (!process.env.VITE_SUPABASE_URL && localEnv.VITE_SUPABASE_URL) {
  process.env.VITE_SUPABASE_URL = localEnv.VITE_SUPABASE_URL
}
if (
  !process.env.VITE_SUPABASE_PUBLISHABLE_KEY &&
  localEnv.VITE_SUPABASE_PUBLISHABLE_KEY
) {
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY =
    localEnv.VITE_SUPABASE_PUBLISHABLE_KEY
}

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      testMatch: 'multiplayer.spec.js',
      use: { ...devices['Desktop Firefox'] },
    },
  ],
  webServer: {
    command:
      'npm run build && npm run preview -- --host 127.0.0.1 --port 4173 --strictPort',
    env: { ...process.env, VITE_E2E_LEGACY: 'true' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
