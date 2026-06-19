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

// Mock-provider settings: the mock model needs no API key, so the dev env can
// use the back-office AI assistant with zero external configuration.
const agentSettings = {
  providers: [
    { id: 'mock-provider', type: 'mock', name: 'Mock Provider', enabled: true }
  ],
  models: {
    assistant: {
      model: { id: 'mock-model', name: 'Mock Model', provider: { type: 'mock', name: 'Mock Provider', id: 'mock-provider' } },
      inputPricePerMillion: 0,
      outputPricePerMillion: 0
    }
  },
  quotas: {
    global: { unlimited: true, monthlyLimit: 0 },
    admin: { unlimited: true, monthlyLimit: 0 },
    contrib: { unlimited: false, monthlyLimit: 100 },
    user: { unlimited: false, monthlyLimit: 50 },
    external: { unlimited: false, monthlyLimit: 0 },
    anonymous: { unlimited: false, monthlyLimit: 0 }
  },
  storeTraces: true
}

// Filled in main() so the org-missing hint can wrap their creation.
let dfAx: any
let agentsAx: any

/** True if a dataset with this id already exists (200), false on 404.
 * Note: @data-fair/lib-node flattens axios errors — the HTTP status is on
 * `err.status`, not `err.response.status`. */
const datasetExists = async (id: string): Promise<boolean> => {
  try {
    await dfAx.get(`/api/v1/datasets/${id}`)
    return true
  } catch (err: any) {
    if (err.status === 404) return false
    throw err
  }
}

/** Poll a dataset until it is finalized (no WS dependency). When expectedCount
 * is given, also wait for dataset.count to reach it — a freshly created REST
 * dataset reports status 'finalized' with count 0 before its lines are indexed,
 * so a plain status check would return too early. */
const pollFinalized = async (id: string, expectedCount?: number, timeout = 30000): Promise<any> => {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    const ds = (await dfAx.get(`/api/v1/datasets/${id}`)).data
    if (ds.status === 'error') throw new Error(`dataset ${id} entered error status`)
    if (ds.status === 'finalized' && (expectedCount === undefined || ds.count === expectedCount)) return ds
    await new Promise(resolve => setTimeout(resolve, 500))
  }
  throw new Error(`dataset ${id} did not finalize within ${timeout}ms`)
}

/** REST editable dataset: a back-office worklist (request tracking). */
async function seedSuiviDemandes () {
  const id = 'fixtures-suivi-demandes'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  await dfAx.post(`/api/v1/datasets/${id}`, {
    isRest: true,
    title: 'Suivi des demandes',
    description: 'Liste de demandes internes à traiter (exemple éditable REST).',
    schema: [
      { key: 'objet', type: 'string', title: 'Objet' },
      { key: 'statut', type: 'string', title: 'Statut' },
      { key: 'priorite', type: 'string', title: 'Priorité' },
      { key: 'date', type: 'string', format: 'date', title: 'Date' }
    ]
  })
  const lines = [
    { objet: 'Mise à jour du catalogue', statut: 'nouveau', priorite: 'haute', date: '2026-06-10' },
    { objet: 'Correction d’une fiche produit', statut: 'en cours', priorite: 'moyenne', date: '2026-06-11' },
    { objet: 'Export mensuel des ventes', statut: 'résolu', priorite: 'basse', date: '2026-06-05' },
    { objet: 'Ajout d’un nouvel équipement', statut: 'nouveau', priorite: 'moyenne', date: '2026-06-12' },
    { objet: 'Vérification des coordonnées GPS', statut: 'en cours', priorite: 'haute', date: '2026-06-13' }
  ]
  // bulk insert in one request so a single finalize recomputes count (posting
  // lines one by one leaves dataset.count stale due to debounced finalizes)
  await dfAx.post(`/api/v1/datasets/${id}/_bulk_lines`, lines)
  await pollFinalized(id, lines.length)
  console.log(`${id}: seeded (${lines.length} lines)`)
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

  await agentsAx.put('/agents/api/settings/organization/dev_fixtures', agentSettings)
  console.log('agent settings written (mock provider) for organization/dev_fixtures')

  await seedSuiviDemandes()

  console.log('\nDone.')
}

main().then(() => {
  // Force exit: authenticated axios clients keep keep-alive sockets open, which
  // would otherwise keep the event loop alive and hang the process.
  process.exit(0)
}).catch(err => {
  // @data-fair/lib-node flattens axios errors: body is on err.data, and
  // err.message is already "<status> - <body>".
  console.error('fixtures failed:', err?.data ?? err?.message ?? err)
  process.exit(1)
})
