import { seedSdFixtures, sdTestEnvUrl } from './support/sd-fixtures.ts'

/**
 * Seed the test accounts in simple-directory before the spec files are loaded: many of them log in
 * at import time, which playwright does before running any project (state-setup included).
 *
 * The unit tests run without the dev stack (CI): when simple-directory does not answer at all, the
 * seed is skipped and the api and e2e projects fail in state-setup, which explains what is missing.
 */
export default async function globalSetup () {
  try {
    await fetch(`${sdTestEnvUrl()}/ping`)
  } catch {
    console.log(`simple-directory is not reachable at ${sdTestEnvUrl()}, test accounts not seeded`)
    return
  }
  await seedSdFixtures()
}
