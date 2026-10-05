import { defineConfig, devices } from '@playwright/test';

// Browser acceptance against the real HTTP mock through the Vite proxy. Tests share one stateful
// mock, so they run serially and reset the scenario they need.
export default defineConfig({
  testDir: './e2e',
  testIgnore: ['public/**'],
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/e2e-results.json' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: [
    {
      command: 'bun run --cwd ../mock-server start',
      url: 'http://127.0.0.1:4010/health',
      reuseExistingServer: true,
    },
    { command: 'bun --bun vite', url: 'http://127.0.0.1:5173/login', reuseExistingServer: true },
  ],
});
