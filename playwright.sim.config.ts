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
  // part, so a legitimate turn has no fixed ceiling on its own — but the test
  // as a whole must still end well before this fires: the budget must exceed
  // maxTurns × the per-turn timeout (see simulate.sim.spec.ts's waitForTurn
  // call), so the driver's own diagnosable timeout always fires first. A test
  // timeout here is the bad order — it aborts the body without running the
  // catch, so the run's evidence is never written (see the pessimistic
  // sidecar in simulate.sim.spec.ts).
  timeout: 45 * 60 * 1000,
  reporter: 'list',

  use: {
    baseURL: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}/data-fair`,
    // Headed by default, unlike every other project here: simulations never run
    // in CI and are always started by a maintainer, and watching a simulated
    // person use the product is most of the value. Since 0.4.0 the persona has
    // its own look/click/type tools, so what you see is it moving around the
    // page on its own — a run you cannot see is far harder to diagnose than one
    // you can. SIM_HEADLESS=1 opts out.
    headless: !!process.env.SIM_HEADLESS,
    // 'on', not 'retain-on-failure': most of a simulation is a model thinking,
    // so the trace's per-action DOM snapshots are a better record than watching
    // live, and a satisfied-but-odd run is exactly the one worth replaying. A
    // suite that runs a handful of times a day can afford to keep every trace.
    trace: 'on',
    // A missing element should fail in seconds with a diagnosis, not hang for
    // the whole test timeout. 30s rather than the default suite's 5s/10s: the
    // dev stack is doing real work during a simulation and the drawer's
    // iframe boots an entire SPA.
    actionTimeout: 30_000,
    navigationTimeout: 30_000,
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
      use: {
        ...devices['Desktop Chrome'],
        // 1920×1080, not Desktop Chrome's 1280×720. ui/src/layouts/default.vue
        // keeps the chat drawer `temporary` below Vuetify's xl breakpoint
        // (1920px), and a temporary drawer lays a scrim over the whole app — so
        // at 1280 the persona could not click anything behind the chat, and
        // Playwright reported "v-navigation-drawer__scrim intercepts pointer
        // events" on every attempt. That is the product's real behaviour at that
        // width, correctly refused rather than forced, but it is not the layout
        // the assistant is designed around: its prompt assumes the user can see
        // and reach the app while the chat is open. Simulate the designed
        // experience; a narrow-viewport case would be a separate, deliberate one.
        viewport: { width: 1920, height: 1080 },
      },
    },
  ],
})
