/**
 * Dev fixtures: seed the RUNNING dev environment with a few example datasets
 * (REST, CSV file, geo, a date/timezone showcase) and configure the AI agents
 * integration with a mock provider. Everything is owned by the dedicated
 * `dev_fixtures` org, which is
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
import { publishMockApps } from '../tests/support/registry.ts'

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
let dfAdminAx: any
let agentsAx: any

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

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
async function uploadCsv (id: string, filename: string, body: Record<string, any>, csv: string, query = '') {
  const form = new FormData()
  form.append('file', Buffer.from(csv, 'utf8'), { filename, contentType: 'text/csv' })
  form.append('body', JSON.stringify(body))
  await dfAx.put(`/api/v1/datasets/${id}${query}`, form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  })
}

// ── Integrity helpers ──────────────────────────────────────────────────────
// These illustrate the data-integrity feature end-to-end against the real API
// (enable → WORM revisions → check), using the dev-only tamper endpoint to
// force a breach. Integrity must be active in config (dev: integrity.active=true).

/** Poll the dataset until it is finalized with a hashed original file — the
 * precondition for enabling integrity (file dataset with originalFile.md5). */
async function waitForFinalized (id: string, timeoutMs = 60000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const { data } = await dfAx.get(`/api/v1/datasets/${id}`)
    if (data.status === 'finalized' && data.originalFile?.md5) return
    await sleep(500)
  }
  throw new Error(`timeout waiting for ${id} to finalize`)
}

/** Current revision index recorded on the dataset (-1 if none yet). */
async function currentRevisionIndex (id: string): Promise<number> {
  const { data } = await dfAdminAx.get(`/api/v1/datasets/${id}/_integrity`)
  return typeof data.lastRevision?.i === 'number' ? data.lastRevision.i : -1
}

/** Wait until the relay worker writes a revision strictly newer than
 * `afterIndex`, returning the new index. Relative (not absolute) on purpose:
 * the relay keys revisions by max-index+1 within a per-dataset prefix and
 * dedupes by md5, so prior runs' still-WORM-locked revisions under the same
 * prefix would shift the index — a relative wait tolerates that. */
async function waitForNewRevision (id: string, afterIndex: number, timeoutMs = 90000): Promise<number> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const i = await currentRevisionIndex(id)
    if (i > afterIndex) return i
    await sleep(500)
  }
  throw new Error(`timeout waiting for ${id} revision after ${afterIndex}`)
}

/** Turn integrity on (admin mode); this flags the dataset for historizing, so
 * the worker writes the first anchor revision. */
async function enableIntegrity (id: string) {
  await dfAdminAx.put(`/api/v1/datasets/${id}/_integrity`, { active: true })
}

/** Run an on-demand integrity check; returns 'ok' | 'breach' | 'unknown'.
 * The breach path persists integrity.lastCheck before sending the breach
 * notification, so if that fire-and-forget send errors we still read the
 * already-stored verdict instead of failing the fixture. */
async function runCheck (id: string): Promise<string> {
  try {
    const { data } = await dfAdminAx.post(`/api/v1/datasets/${id}/_integrity/_check`)
    return data.status
  } catch (err: any) {
    const { data } = await dfAdminAx.get(`/api/v1/datasets/${id}/_integrity`)
    if (data.lastCheck?.status) return data.lastCheck.status
    throw err
  }
}

/** Overwrite the stored original file out-of-band (dev-only endpoint), so a
 * subsequent check diverges from the locked anchor and reports a breach. */
async function tamperFile (id: string) {
  await dfAx.post(`/api/v1/test-env/tamper-dataset-file/${id}`, { content: 'ligne falsifiée hors du circuit applicatif\n' })
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

/** Integrity demo — healthy: a file dataset with integrity on, a real version
 * history (anchor + one published update), and a passing check. */
async function seedIntegriteOk () {
  const id = 'fixtures-integrite-ok'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  const header = 'reference,date,objet,decision\n'
  const v1 = header + [
    'DEL-2026-001,2026-01-15,Budget primitif 2026,adopté',
    'DEL-2026-002,2026-02-12,Subvention associations,adopté',
    'DEL-2026-003,2026-03-19,Marché voirie,reporté'
  ].join('\n') + '\n'
  const body = {
    title: 'Registre des délibérations (certifié)',
    description: 'Jeu de données fichier avec intégrité activée : historique de révisions horodatées dans un stockage verrouillé (WORM) et contrôle conforme.'
  }
  await uploadCsv(id, 'deliberations.csv', body, v1)
  await waitForFinalized(id)
  // enable → first anchor revision over the v1 file
  await enableIntegrity(id)
  const anchor = await waitForNewRevision(id, -1)
  // a schema-compatible update with ?draft=compatible auto-validates the draft
  // (process-file.ts: validationMode !== 'never' ⇒ auto-publish), so the
  // published file changes and the relay historizes a second revision
  const v2 = v1 + 'DEL-2026-004,2026-04-23,Acquisition foncière,adopté\n'
  await uploadCsv(id, 'deliberations.csv', body, v2, '?draft=compatible')
  await waitForNewRevision(id, anchor)
  const status = await runCheck(id)
  console.log(`${id}: seeded (integrity active, 2 revisions, check=${status})`)
}

/** Integrity demo — breach: integrity on, then the stored file is tampered
 * out-of-band so the check detects an alteration and raises an alert. */
async function seedIntegriteBreach () {
  const id = 'fixtures-integrite-breach'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  const csv = 'ecriture,date,compte,montant\n' + [
    'ECR-001,2026-01-31,706000,12450.00',
    'ECR-002,2026-02-28,706000,9870.50',
    'ECR-003,2026-03-31,706000,15320.75'
  ].join('\n') + '\n'
  await uploadCsv(id, 'ecritures.csv', {
    title: 'Registre comptable (altéré)',
    description: 'Jeu de données fichier avec intégrité activée, dont le fichier stocké a été falsifié hors du circuit applicatif : le contrôle détecte une atteinte à l’intégrité.'
  }, csv)
  await waitForFinalized(id)
  await enableIntegrity(id)
  await waitForNewRevision(id, -1)
  await tamperFile(id)
  const status = await runCheck(id)
  console.log(`${id}: seeded (integrity active, file tampered, check=${status})`)
}

/** REST dataset highlighting date / date-time display behaviour:
 *  - `horodatage` is a date-time whose values keep their source offset (Tahiti,
 *    UTC-10, no DST). It is shown in that source timezone for every viewer (not
 *    converted to the browser tz), the column header captions "Heures en
 *    Pacific/Tahiti (UTC-10)", and hovering a cell reveals the UTC and viewer-
 *    local equivalents. The first row even crosses the date line vs UTC.
 *  - `horodatage_utc` holds the SAME instants stored as UTC ("...Z"): with no
 *    source timezone to honour these fall back to the viewer's timezone (no
 *    header caption); the tooltip still exposes the UTC value.
 *  - `jour` is a pure `date`: a timezone-less calendar date, identical for all.
 *  See docs/architecture/date-management.md. */
async function seedHorairesFuseaux () {
  const id = 'fixtures-horaires-fuseaux'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  await dfAx.post(`/api/v1/datasets/${id}`, {
    isRest: true,
    title: 'Relevés station (fuseaux horaires)',
    description: 'Démonstration de l’affichage des dates : un horodatage est montré dans le fuseau ' +
      'horaire de la donnée (ici Pacific/Tahiti, UTC-10) et non celui du navigateur. Survolez une ' +
      'cellule d’horodatage pour voir les équivalents UTC et heure locale.',
    schema: [
      { key: 'capteur', type: 'string', title: 'Capteur' },
      { key: 'horodatage', type: 'string', format: 'date-time', timeZone: 'Pacific/Tahiti', title: 'Horodatage (heure locale station)' },
      { key: 'horodatage_utc', type: 'string', format: 'date-time', title: 'Horodatage (stocké en UTC)' },
      { key: 'jour', type: 'string', format: 'date', title: 'Jour' }
    ]
  })
  // each row pairs the same instant as a Tahiti-local offset value and as a UTC
  // ("Z") value; `jour` is the local calendar day. Tahiti is UTC-10 year-round.
  const lines = [
    { capteur: 'Temp-01', horodatage: '2024-01-14T20:00:00-10:00', horodatage_utc: '2024-01-15T06:00:00Z', jour: '2024-01-14' },
    { capteur: 'Temp-01', horodatage: '2024-01-15T08:30:00-10:00', horodatage_utc: '2024-01-15T18:30:00Z', jour: '2024-01-15' },
    { capteur: 'Houle-A', horodatage: '2024-07-01T17:15:00-10:00', horodatage_utc: '2024-07-02T03:15:00Z', jour: '2024-07-01' },
    { capteur: 'Houle-A', horodatage: '2024-07-02T11:00:00-10:00', horodatage_utc: '2024-07-02T21:00:00Z', jour: '2024-07-02' }
  ]
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
 *   - `chemin_fichier` : the SAME long values, configured the way a long-valued
 *                        column should be — `wildcard` enabled (exact/existence
 *                        filters route to the no-limit `.wildcard` sub-field) AND
 *                        sortable/groupable disabled (sort & group can NOT be made
 *                        reliable past 200 chars, so the capability is removed
 *                        rather than left silently broken). It is therefore fully
 *                        mitigated → not flagged.
 *
 * Things to try once it is finalized (browse / call the API):
 *   - GET .../datasets/fixtures-ignore-above/_diagnose
 *       → warnings[] contains IgnoredKeywordValues naming `note_libre` only
 *         (chemin_fichier is fully mitigated, so it is not flagged).
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
    description: 'Illustre la gestion des valeurs de plus de 200 caractères sur les colonnes "keyword" Elasticsearch : la colonne "note_libre" (non configurée) pose problème, la colonne "chemin_fichier" est correctement configurée (wildcard activé, tri/regroupement désactivés). Voir docs/architecture/load-management.md.',
    schema: [
      { key: 'ref', type: 'string', title: 'Référence' },
      // plain keyword column: long values are dropped from the index (the problem case)
      { key: 'note_libre', type: 'string', title: 'Note libre (non configurée)' },
      // correctly configured for long values: wildcard for exact/existence filtering,
      // and sort/group (values) + case-insensitive sort (insensitive) disabled, since
      // those cannot be reliable past 200 chars (wildcard does not repair them).
      { key: 'chemin_fichier', type: 'string', title: 'Chemin de fichier (configuré)', 'x-capabilities': { wildcard: true, values: false, insensitive: false } }
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

/** REST dataset illustrating a dataset-wide UNIQUE CONSTRAINT (multi-column) on
 * editable data (see docs/architecture/dataset-validation.md § Dataset-wide
 * constraints). The constraint is `unique (siret, annee)`, enforced by a partial
 * compound unique index on the REST collection. The seed data is clean (no
 * duplicates) so the dataset finalizes normally; the point is to let a dev
 * trigger — and observe — the rejection interactively.
 *
 * Things to try once it is finalized (browse the "Modifier les lignes" table or
 * call the API):
 *   - POST a line reusing an existing (siret, annee) pair, e.g.
 *       POST .../datasets/fixtures-unicite-rest/lines
 *       { "siret": "12345678900011", "annee": 2024, "montant": 100, "objet": "x" }
 *     → 409 "Doublon détecté : le couple (SIRET + Année) doit être unique."
 *   - POST a line with the SAME siret but a NEW annee → accepted (201): the key
 *     is the pair, not siret alone.
 *   - PATCH the dataset to add a second constraint the existing data violates,
 *       { "constraints": [{ "type": "unique", "properties": ["siret", "annee"] },
 *                         { "type": "unique", "properties": ["montant"] }] }
 *     (two rows share a montant) → 400: existing data violates the new constraint.
 *   - In the UI, the "Contraintes" tab of the Structure section
 *     only offers real stored, groupable columns (no calculated/geo/object ones).
 */
async function seedUniciteRest () {
  const id = 'fixtures-unicite-rest'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  await dfAx.post(`/api/v1/datasets/${id}`, {
    isRest: true,
    title: 'Subventions (contrainte d’unicité REST)',
    description: 'Jeu de données éditable avec une contrainte d’unicité multi-colonnes sur (siret, année). Toute tentative d’insérer une ligne en double sur ce couple est rejetée (409). Voir docs/architecture/dataset-validation.md.',
    schema: [
      { key: 'siret', type: 'string', title: 'SIRET' },
      { key: 'annee', type: 'integer', title: 'Année' },
      { key: 'montant', type: 'number', title: 'Montant (€)' },
      { key: 'objet', type: 'string', title: 'Objet' }
    ],
    constraints: [{ type: 'unique', properties: ['siret', 'annee'] }]
  })
  const lines = [
    { siret: '12345678900011', annee: 2024, montant: 5000, objet: 'Rénovation de locaux' },
    { siret: '12345678900011', annee: 2025, montant: 7000, objet: 'Achat de matériel' },
    { siret: '98765432100022', annee: 2025, montant: 3000, objet: 'Formation' },
    { siret: '55555555500033', annee: 2024, montant: 3000, objet: 'Événement culturel' }
  ]
  await dfAx.post(`/api/v1/datasets/${id}/_bulk_lines`, lines)
  console.log(`${id}: seeded (${lines.length} lines, unique (siret, année))`)
}

/** File dataset deliberately left in ERROR to illustrate the UNIQUE-CONSTRAINT
 * rejection + diagnostic on file-backed data. The CSV carries a `unique (email)`
 * constraint and contains a duplicated email, so the file-dataset gate (a
 * post-index Elasticsearch composite aggregation, run before the index is
 * promoted) detects the duplicate, blocks finalization, and writes the offending
 * rows to the validation-diagnostic CSV — exactly like a schema-validation
 * failure. This is analogous to the intentionally-flagged `fixtures-ignore-above`
 * dataset: it is meant to be red.
 *
 * Things to try:
 *   - GET .../datasets/fixtures-unicite-fichier/journal
 *       → a `validation-error` event with `unicityErrorCount > 0` and
 *         `hasDiagnosticFile: true`.
 *   - GET .../datasets/fixtures-unicite-fichier/validation-diagnostic.csv
 *       → header `line,error_type,field,message,raw_value`; the duplicated email's
 *         rows appear with `error_type = unicity` (line = 1-based data-row index).
 *   - Fix it: re-upload the same file without the duplicate row (or drop the
 *     constraint) → the dataset finalizes and the diagnostic is cleared.
 */
async function seedUniciteFichier () {
  const id = 'fixtures-unicite-fichier'
  if (await datasetExists(id)) { console.log(`${id}: skipped (exists)`); return }
  const csv = [
    'email,nom,prenom',
    'alice@example.org,Martin,Alice',
    'bob@example.org,Durand,Bob',
    'alice@example.org,Martin,Alice', // duplicate of the first data row → unicity violation
    'carol@example.org,Petit,Carol'
  ].join('\n') + '\n'
  await uploadCsv(id, 'inscriptions.csv', {
    title: 'Inscriptions (doublons — démonstration)',
    description: 'Jeu de données fichier volontairement en erreur : une contrainte d’unicité sur "email" et un email en double. Le contrôle post-indexation bloque la finalisation et liste les lignes fautives dans le diagnostic de validation (error_type = unicity). Voir docs/architecture/dataset-validation.md.',
    schema: [
      { key: 'email', type: 'string', title: 'Email' },
      { key: 'nom', type: 'string', title: 'Nom' },
      { key: 'prenom', type: 'string', title: 'Prénom' }
    ],
    constraints: [{ type: 'unique', properties: ['email'] }]
  }, csv)
  console.log(`${id}: seeded (file with a duplicate email → error + unicity diagnostic)`)
}

/** File-new DRAFT dataset deliberately left in ERROR status. The draft carries a
 * geocoder extension whose remote service (the dev mock server) is set to answer
 * 500 while the draft reprocesses; with `errorRetryDelay: 0` the automatic retry
 * fails instantly too, leaving the draft in the terminal error state (no pending
 * errorRetry). The mock route is then healed (ndjson echo), so the error is
 * RECOVERABLE: the point is to observe the draft-in-error UI on the dataset page.
 *
 * Things to try:
 *   - browse the dataset page → red draft banner showing the extension error
 *     message and a "Relancer" button (no validate/cancel buttons: a file-new
 *     draft in error can only be retried or deleted).
 *   - click "Relancer" → the draft reprocesses (the mock geocoder now answers)
 *     and reaches the normal finalized draft state ("Valider le brouillon").
 *   - the button issues `PATCH /datasets/{id}?draft=true {}`: an empty patch on a
 *     dataset in error resumes processing at the failed step (errorStatus).
 *
 * Note: a test-suite run clears the dynamic mock routes; if a retry then fails
 * because the mock geocoder is gone, re-run `npm run dev-fixtures` to re-heal it
 * (the heal is applied even when the dataset already exists).
 */
async function seedBrouillonErreur () {
  const id = 'fixtures-brouillon-erreur'
  const mockRoutesUrl = `http://localhost:${process.env.MOCK_PORT}/_test/routes`
  const healGeocoderMock = () => dfAx.post(mockRoutesUrl, {
    path: '/geocoder/coords',
    ndjsonEcho: { fields: { lat: 48.11, lon: -1.68 } }
  })
  if (await datasetExists(id)) { await healGeocoderMock(); console.log(`${id}: skipped (exists, geocoder mock re-healed)`); return }

  const waitForDraftStatus = async (accepted: string[], timeoutMs = 30000) => {
    const deadline = Date.now() + timeoutMs
    let dataset: any
    while (Date.now() < deadline) {
      dataset = (await dfAx.get(`/api/v1/datasets/${id}`, { params: { draft: true } })).data
      if (accepted.includes(dataset.status) && !dataset.errorRetry) return dataset
      if (dataset.status === 'error' && !accepted.includes('error')) throw new Error(`draft of ${id} unexpectedly in error`)
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    throw new Error(`draft of ${id} did not reach status ${accepted.join('|')} within ${timeoutMs}ms (last: ${dataset?.status})`)
  }

  // create the dataset as a file-new draft, with the address concept pre-tagged
  const csv = [
    'etablissement,adr',
    'Siège Koumoul,19 rue de la voie lactée 56890 Saint-Avé',
    'Mairie de Rennes,Place de la Mairie 35000 Rennes',
    'Agence inconnue,adresse introuvable'
  ].join('\n') + '\n'
  const form = new FormData()
  form.append('file', Buffer.from(csv, 'utf8'), { filename: 'etablissements.csv', contentType: 'text/csv' })
  form.append('body', JSON.stringify({
    title: 'Brouillon en erreur (démonstration)',
    description: 'Brouillon de jeu de données fichier volontairement en erreur : une extension de géocodage a échoué (le service distant simulé répondait une erreur 500) pendant le traitement du brouillon. Le service répond de nouveau : le bouton "Relancer" du bandeau d’erreur reprend le traitement à l’étape échouée et le brouillon redevient exploitable.',
    schema: [{ key: 'adr', type: 'string', 'x-refersTo': 'http://schema.org/address' }]
  }))
  await dfAx.put(`/api/v1/datasets/${id}`, form, {
    headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
    params: { draft: true }
  })
  await waitForDraftStatus(['finalized'])

  // break the mock geocoder, then activate the extension on the draft
  await dfAx.post(mockRoutesUrl, { path: '/geocoder/coords', status: 500, body: 'some error', contentType: 'text/plain' })
  await dfAx.patch(`/api/v1/datasets/${id}`, {
    extensions: [{ active: true, type: 'remoteService', remoteService: 'geocoder-koumoul', action: 'postCoords' }]
  }, { params: { draft: true } })

  // wait for the terminal error state (automatic retry consumed, no errorRetry left)
  await waitForDraftStatus(['error'])

  // heal the mock so the "Relancer" button actually recovers the draft
  await healGeocoderMock()
  console.log(`${id}: seeded (file-new draft in error, retry will succeed)`)
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

  // admin-mode data-fair session: the integrity endpoints require admin mode
  // (reqAdminMode). Same dev_fixtures org context as dfAx, but elevated.
  dfAdminAx = await axiosAuth({ ...creds, org: 'dev_fixtures', adminMode: true, axiosOpts: { baseURL: dfBaseURL } })

  await agentsAx.put('/agents/api/settings/organization/dev_fixtures', agentSettings)
  console.log('agent settings written (mock provider) for organization/dev_fixtures')

  // activate the AI assistant on the data-fair org settings (the agentChat flag
  // gates the assistant UI). PATCH merges, so it preserves any other settings.
  await dfAx.patch('/api/v1/settings/organization/dev_fixtures', { agentChat: true })
  console.log('agent chat activated on organization/dev_fixtures settings')

  // publish the mock base apps to the dev/test registry and sync them into base-applications
  // (idempotent — safe to re-run on every `npm run dev-fixtures`)
  await publishMockApps()
  await dfAdminAx.post('/api/v1/base-applications/_sync')
  console.log('mock base applications published to the registry and synced')

  await seedSuiviDemandes()
  await seedProduits()
  await seedEquipements()
  await seedIntegriteOk()
  await seedIntegriteBreach()
  await seedHorairesFuseaux()
  await seedIgnoreAbove()
  await seedUniciteRest()
  await seedUniciteFichier()
  await seedBrouillonErreur()

  console.log('\nDone. Browse the seeded data at:')
  for (const id of ['fixtures-suivi-demandes', 'fixtures-produits', 'fixtures-equipements', 'fixtures-integrite-ok', 'fixtures-integrite-breach', 'fixtures-horaires-fuseaux', 'fixtures-ignore-above', 'fixtures-unicite-rest', 'fixtures-unicite-fichier', 'fixtures-brouillon-erreur']) {
    console.log(`  dataset:         ${dfBaseURL}/dataset/${id}`)
  }
  console.log('  (the integrity panel on the two "intégrité" datasets requires admin mode)')
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
