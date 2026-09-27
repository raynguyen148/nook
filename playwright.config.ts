import { defineConfig, devices } from '@playwright/test'

const port = Number(process.env.NOOK_E2E_PORT || 4187)
const baseURL = `http://127.0.0.1:${port}`

export default defineConfig({
  testDir: './app/e2e',
  workers: 1,
  timeout: 45_000,
  use: {
    baseURL,
    ...devices['Desktop Chrome'],
    launchOptions: process.env.NOOK_E2E_CHROME_PATH ? { executablePath: process.env.NOOK_E2E_CHROME_PATH } : undefined,
    serviceWorkers: 'allow',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run preview -- --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
  },
  reporter: [['list']],
})
