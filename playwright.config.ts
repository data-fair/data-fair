import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'
import 'dotenv/config'

// Unit tests import api modules that load node-config (the `config` package) at module-evaluation
// time; it resolves its files relative to cwd, which when running the test suite is the repo root.
// Point it at api/config so those imports don't blow up on an empty config. (Only affects the test
// runner / its worker processes — the dev API runs with cwd=api/ and finds ./config on its own.)
process.env.NODE_CONFIG_DIR ??= fileURLToPath(new URL('./api/config', import.meta.url))

export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'dot',
  timeout: 30_000,
  expect: { timeout: 5_000 },

  use: {
    baseURL: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair`,
    actionTimeout: 5_000,
    navigationTimeout: 5_000,
  },

  projects: [
    {
      name: 'state-setup',
      testMatch: /state-setup\.ts/,
      teardown: 'state-teardown'
    },
    {
      name: 'state-teardown',
      testMatch: /state-teardown\.ts/,
    },
    {
      name: 'unit',
      testMatch: /.*\.unit\.spec\.ts/,
    },
    {
      name: 'api',
      testMatch: /.*\.api\.spec\.ts/,
      dependencies: ['state-setup'],
    },
    {
      name: 'e2e',
      testMatch: /.*\.e2e\.spec\.ts/,
      dependencies: ['state-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
