import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BASE_URL ?? 'http://localhost:8080';

// One shared Docker instance per run, so everything runs on a single worker and in this order:
//   setup (first-run, once) -> mobile + desktop (every spec except restart) -> restart (last).
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'setup', testMatch: /.*\.setup\.ts/, use: { ...devices['Pixel 7'] } },
    {
      name: 'mobile',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /restart\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Pixel 7'] },
    },
    {
      name: 'desktop',
      testMatch: /.*\.spec\.ts/,
      testIgnore: /restart\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // Restarts the shared app container, so it runs once, after both device projects are done.
      name: 'restart',
      testMatch: /restart\.spec\.ts/,
      dependencies: ['mobile', 'desktop'],
      use: { ...devices['Pixel 7'] },
    },
  ],
});
