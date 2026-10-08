import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    ...(process.env.PLAYBACK_MATRIX ? [
      { name: 'firefox', testMatch: 'playback.spec.js', use: { ...devices['Desktop Firefox'] } },
      { name: 'webkit', testMatch: 'playback.spec.js', use: { ...devices['Desktop Safari'] } },
    ] : []),
  ],
  webServer: {
    command: 'bun run start --host 127.0.0.1',
    url: 'http://127.0.0.1:3000',
    reuseExistingServer: !process.env.CI,
  },
});
