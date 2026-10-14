import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

const ci = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  // api and e2e tests share the dev env state (one clean() wipes every test owner): one worker
  workers: 1,
  fullyParallel: false,
  forbidOnly: ci,
  // a flake must not cost a full re-run; a real regression shows up as several failures anyway
  retries: ci ? Number(process.env.TEST_RETRIES || 1) : 0,
  // the json report keeps the per-test durations of the last run, used to size the smoke set and the CI jobs
  // on a failure: npx playwright show-trace test-results/<test>/trace.zip (diagnostics attached there)
  reporter: [['dot'], ['json', { outputFile: 'dev/logs/test-timings.json' }]],
  // per test, HOOKS INCLUDED: heavy specs call test.slow() (x3) instead of raising this
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT}/data-fair`,
    actionTimeout: 5_000,
    navigationTimeout: 10_000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },

  projects: [
    {
      name: 'unit',
      testMatch: /.*\.unit\.spec\.ts/,
    },
    {
      name: 'state-setup',
      testMatch: /state-setup\.ts/,
    },
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      dependencies: ['state-setup'],
    },
    {
      // pays the dev UI's first-hit transforms once, with a long timeout, before the e2e tests
      name: 'e2e-warmup',
      testMatch: /e2e-warmup\.ts/,
      dependencies: ['state-setup'],
      timeout: 120_000,
      expect: { timeout: 60_000 },
      use: { ...devices['Desktop Chrome'], navigationTimeout: 60_000 },
    },
    {
      name: 'e2e',
      testMatch: /.*\.e2e\.spec\.ts/,
      dependencies: ['e2e-warmup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
