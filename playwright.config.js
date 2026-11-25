// Browser tests. The site must be built for localhost first:
//   SITE_URL=http://localhost:4173 npm run build && npx playwright test
import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'test/e2e',
  timeout: 90_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  workers: CI ? 2 : undefined,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  globalSetup: './test/e2e/global-setup.js',
  use: {
    baseURL: `http://localhost:${PORT}/`,
    acceptDownloads: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    port: PORT,
    reuseExistingServer: !CI,
    env: { SITE_URL: `http://localhost:${PORT}`, PORT: String(PORT) },
  },
  projects: [
    // Every test on desktop Chrome.
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // The everyday flows on a phone and in the other engines.
    { name: 'mobile', use: { ...devices['Pixel 7'] }, grep: /@smoke/ },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] }, grep: /@smoke/ },
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, grep: /@smoke/ },
  ],
});
