/**
 * Dev fixtures: seed the RUNNING dev environment with a few example datasets
 * (REST, CSV file, geo) and configure the AI agents integration with a mock
 * provider. Everything is owned by the dedicated `dev_fixtures` org, which is
 * excluded from the test-suite cleanup (owner ids matching /^test_/ only).
 *
 * Run it (dev env must be up — `bash dev/status.sh`):
 *   npm run dev-fixtures
 *
 * Idempotent: datasets that already exist are skipped; settings are upserted.
 * It never deletes anything. Requires the `dev_fixtures` org to exist in
 * simple-directory (see dev/resources/organizations.json) — restart `sd` after
 * adding it.
 */
import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'

const root = `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT1}`
const directoryUrl = `${root}/simple-directory`
const dfBaseURL = `${root}/data-fair`
const creds = { email: 'alban.mouton@koumoul.com', password: 'passwd', directoryUrl }

// Filled in main() so the org-missing hint can wrap their creation.
let dfAx: any
let agentsAx: any

/** True if a dataset with this id already exists (200), false on 404. */
const datasetExists = async (id: string): Promise<boolean> => {
  try {
    await dfAx.get(`/api/v1/datasets/${id}`)
    return true
  } catch (err: any) {
    if (err.response?.status === 404) return false
    throw err
  }
}

/** Poll a dataset until it is finalized (no WS dependency). */
const pollFinalized = async (id: string, timeout = 30000): Promise<any> => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const ds = (await dfAx.get(`/api/v1/datasets/${id}`)).data
    if (ds.status === 'finalized') return ds
    if (ds.status === 'error') throw new Error(`dataset ${id} entered error status`)
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`dataset ${id} did not finalize within ${timeout}ms`)
}

async function main () {
  try {
    dfAx = await axiosAuth({ ...creds, org: 'dev_fixtures', axiosOpts: { baseURL: dfBaseURL } })
  } catch (err) {
    console.error('\nCould not authenticate into org "dev_fixtures".')
    console.error('If you just added it to dev/resources/organizations.json, restart the')
    console.error('simple-directory container (e.g. `docker compose restart sd`) and re-run.\n')
    throw err
  }
  // admin-mode global-admin session writes any owner's agent settings; base is
  // the root origin so we can call the agents service under /agents/api/...
  agentsAx = await axiosAuth({ ...creds, adminMode: true, axiosOpts: { baseURL: root } })

  // (seeding calls are added in later tasks)

  console.log('\nDone.')
}

main().then(() => {
  // Force exit: authenticated axios clients keep keep-alive sockets open, which
  // would otherwise keep the event loop alive and hang the process.
  process.exit(0)
}).catch(err => {
  console.error('fixtures failed:', err?.response?.data ?? err?.message ?? err)
  process.exit(1)
})
