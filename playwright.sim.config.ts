/**
 * Simulations run from their own config, never from playwright.config.ts.
 * A bare `playwright test` runs every project in its config, so a simulation
 * project there would make `npm test` spend Claude plan quota.
 */
import { defineConfig, devices } from '@playwright/test'
import 'dotenv/config'

export default defineConfig({
  testDir: './simulations',
  testMatch: /.*\.sim\.spec\.ts/,
  workers: 1,
  fullyParallel: false,
  // A judged scenario is many model turns, each of which can be a slow first
  // token. The app's own watchdog is a 90s idle timer that re-arms per stream
  // part, so a legitimate turn has no fixed ceiling.
  timeout: 15 * 60 * 1000,
  reporter: 'list',

  use: {
    baseURL: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair`,
    trace: 'retain-on-failure',
  },

  projects: [
    // Reused unmodified from the default suite: an API readiness poll and log
    // tailing. testDir points back at ./tests because this config's own testDir
    // is ./simulations.
    {
      name: 'state-setup',
      testDir: './tests',
      testMatch: /state-setup\.ts/,
      teardown: 'state-teardown',
    },
    {
      name: 'state-teardown',
      testDir: './tests',
      testMatch: /state-teardown\.ts/,
    },
    {
      name: 'simulate',
      dependencies: ['state-setup'],
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
