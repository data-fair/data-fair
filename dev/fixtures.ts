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
import FormData from 'form-data'

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

/** Create/replace a file dataset with a fixed id from an inline CSV string.
 * Optimistic: returns once the upload is accepted; finalization (indexing) runs
 * server-side and is done well before anyone browses the dev env. The `body`
 * part fixes the title/description and may pre-tag columns (e.g. geo concepts)
 * so no post-upload schema patch is needed. */
async function uploadCsv (id: string, filename: string, body: Record<string, any>, csv: string) {
  const form = new FormData()
  form.append('file', Buffer.from(csv, 'utf8'), { filename, contentType: 'text/csv' })
  form.append('body', JSON.stringify(body))
  await dfAx.put(`/api/v1/datasets/${id}`, form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  })
}

/** CSV file dataset: tabular reference data (product catalog). */
async function seedProduits () {
  const id = 'fixtures-produits'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  const csv = [
    'reference,libelle,categorie,prix,stock',
    'REF-001,Chaise de bureau,Mobilier,79.90,120',
    'REF-002,Bureau réglable,Mobilier,249.00,35',
    'REF-003,Lampe LED,Éclairage,24.50,300',
    'REF-004,Clavier sans fil,Informatique,39.99,210',
    'REF-005,Souris ergonomique,Informatique,29.99,180',
    'REF-006,Écran 27 pouces,Informatique,189.00,60',
    'REF-007,Casque audio,Informatique,59.90,95',
    'REF-008,Tapis de sol,Mobilier,15.00,400'
  ].join('\n') + '\n'
  await uploadCsv(id, 'produits.csv', {
    title: 'Catalogue de produits',
    description: 'Données de référence tabulaires importées depuis un fichier CSV (exemple).'
  }, csv)
  console.log(`${id}: seeded (CSV file)`)
}

/** Geo dataset: points on a map (public facilities). The lat/lon columns are
 * tagged with geo concepts in the upload body, so the map view works as soon as
 * indexing completes — no post-upload schema patch needed. */
async function seedEquipements () {
  const id = 'fixtures-equipements'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  const csv = [
    'nom,type,commune,lat,lon',
    'Mairie de Rennes,Administration,Rennes,48.1113,-1.6800',
    'Bibliothèque Champs Libres,Culture,Rennes,48.1045,-1.6759',
    'Hôtel de Ville de Nantes,Administration,Nantes,47.2173,-1.5534',
    'Gare de Brest,Transport,Brest,48.3876,-4.4783',
    'Université de Vannes,Éducation,Vannes,47.6587,-2.7603',
    'Port de Lorient,Transport,Lorient,47.7270,-3.3700'
  ].join('\n') + '\n'
  await uploadCsv(id, 'equipements.csv', {
    title: 'Équipements publics',
    description: 'Points géolocalisés affichables sur une carte (exemple géographique).',
    schema: [
      { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
      { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }
    ]
  }, csv)
  console.log(`${id}: seeded (geo)`)
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
  console.log(`${id}: seeded (${lines.length} lines)`)
}

/** REST dataset illustrating the keyword `ignore_above:200` truncation handling
 * (see docs/architecture/load-management.md). It carries TWO long-valued string
 * columns so a single dataset shows both sides of the fix:
 *
 *   - `note_libre`     : a plain string column (keyword, ignore_above:200, NO
 *                        wildcard). Rows whose value exceeds 200 chars are dropped
 *                        from the keyword index, so this column is the "problem"
 *                        case → it raises the `IgnoredKeywordValues` diagnose
 *                        warning, a `ignored-keyword-values` journal event at
 *                        finalize, and per-request advisories.
 *   - `chemin_fichier` : the SAME long values, but the column opts into the
 *                        `wildcard` capability → filters are transparently routed
 *                        to the no-limit `.wildcard` sub-field and stay correct.
 *
 * Things to try once it is finalized (browse / call the API):
 *   - GET .../datasets/fixtures-ignore-above/_diagnose
 *       → warnings[] contains IgnoredKeywordValues naming `note_libre` only
 *         (chemin_fichier has a wildcard alternative, so it is not flagged).
 *   - GET .../datasets/fixtures-ignore-above/journal
 *       → an `ignored-keyword-values` warning event (journal-only, no notification).
 *   - lines?note_libre_eq=<a >200-char value>      → 400 (impossible on keyword).
 *   - lines?chemin_fichier_eq=<the same value>     → 1 hit (routed to .wildcard).
 *   - lines?note_libre_exists=true                 → finds the long-valued rows too
 *                                                    (union with .text_standard).
 *   - lines?note_libre_starts=Note&hint=true       → may be incomplete; response
 *                                                    carries a `hint` advisory.
 *   - lines?chemin_fichier_starts=/var/exports&hint=true → correct, no hint.
 */
async function seedIgnoreAbove () {
  const id = 'fixtures-ignore-above'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  // pad well past the 200-char ignore_above limit (27 chars * 10 = 270, + prefix)
  const longText = (prefix: string) => `${prefix} ${'lorem ipsum dolor sit amet '.repeat(10)}`.trim()
  await dfAx.post(`/api/v1/datasets/${id}`, {
    isRest: true,
    title: 'Démonstration ignore_above (valeurs longues)',
    description: 'Illustre la gestion des valeurs de plus de 200 caractères sur les colonnes "keyword" Elasticsearch : la colonne "note_libre" (sans wildcard) pose problème, la colonne "chemin_fichier" (avec wildcard) reste filtrable. Voir docs/architecture/load-management.md.',
    schema: [
      { key: 'ref', type: 'string', title: 'Référence' },
      // plain keyword column: long values are dropped from the index (the problem case)
      { key: 'note_libre', type: 'string', title: 'Note libre (sans wildcard)' },
      // same long values, but opted into the wildcard capability (the fixed case)
      { key: 'chemin_fichier', type: 'string', title: 'Chemin de fichier (avec wildcard)', 'x-capabilities': { wildcard: true } }
    ]
  })
  const lines = [
    // short values: behave normally on both columns
    { ref: 'COURT-1', note_libre: 'Note courte A', chemin_fichier: '/var/exports/court-a.csv' },
    { ref: 'COURT-2', note_libre: 'Note courte B', chemin_fichier: '/var/exports/court-b.csv' },
    // long values (> 200 chars): dropped from `note_libre`'s keyword index,
    // but indexed in `chemin_fichier`'s wildcard sub-field
    { ref: 'LONG-1', note_libre: longText('Note détaillée concernant le dossier 1'), chemin_fichier: longText('/var/exports/2026/dossier-1') },
    { ref: 'LONG-2', note_libre: longText('Note détaillée concernant le dossier 2'), chemin_fichier: longText('/var/exports/2026/dossier-2') }
  ]
  await dfAx.post(`/api/v1/datasets/${id}/_bulk_lines`, lines)
  console.log(`${id}: seeded (${lines.length} lines, incl. 2 with >200-char values)`)
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

  // activate the AI assistant on the data-fair org settings (the agentChat flag
  // gates the assistant UI). PATCH merges, so it preserves any other settings.
  await dfAx.patch('/api/v1/settings/organization/dev_fixtures', { agentChat: true })
  console.log('agent chat activated on organization/dev_fixtures settings')

  await seedSuiviDemandes()
  await seedProduits()
  await seedEquipements()
  await seedIgnoreAbove()

  console.log('\nDone. Browse the seeded data at:')
  for (const id of ['fixtures-suivi-demandes', 'fixtures-produits', 'fixtures-equipements', 'fixtures-ignore-above']) {
    console.log(`  dataset:         ${dfBaseURL}/dataset/${id}`)
  }
  console.log(`  agents config:   ${dfBaseURL}/admin/agents`)
  console.log(`  agents activity: ${dfBaseURL}/agents-activity`)
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
