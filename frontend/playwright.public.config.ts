import { defineConfig, devices } from '@playwright/test';

// Smoke checks against a deployed HTTPS stand. It has no /__mock__ controls, so tests only use
// public flows and fresh accounts. The selected auth mode determines real inbox or local demo delivery.
export default defineConfig({
  testDir: './e2e/public',
  outputDir: 'test-results/public',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['json', { outputFile: 'test-results/public-results.json' }]],
  use: {
    baseURL: process.env.FSP_PUBLIC_URL,
    actionTimeout: 20_000,
    navigationTimeout: 30_000,
    locale: 'ru-RU',
    timezoneId: 'Europe/Moscow',
    // Real OTPs and authenticated cookies must not enter CI artifacts.
    trace: 'off',
    screenshot: 'off',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
});
