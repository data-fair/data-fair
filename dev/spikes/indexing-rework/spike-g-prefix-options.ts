import { es, resetIndex, bulkIndex, finding, time, ANALYSIS_SETTINGS } from './es.ts'

// Question: q_mode=complete's autocomplete prefix clause (`simple_query_string` "<q>*") breaks once
// the ONE analyzed field per column is the stemmed `custom_french` one — "configurations" indexes as
// "configu" so "configur*" stops matching partway through typing. Measure candidate ways to keep
// prefix/autocomplete working: a lean unstemmed companion field (per column, or global catch-all), a
// keyword-view (whole-value prefix), and ES's built-in `search_as_you_type` field type. Do NOT pick a
// winner here — just gather evidence (store cost, per-field cost breakdown, correctness matrix,
// latency, query fanout).

// ---------------------------------------------------------------------------------------------
// Corpus: ~50k docs of French-like text built from morphology families (base/plural/derivation) so
// light_french stemming actually bites. Verified empirically against the real ANALYSIS_SETTINGS
// custom_french analyzer:
//   configuration(s) -> "configu"   publication(s) -> "public"   commune(s) -> "comun"
//   transporteur(s)/transport(s) -> "transport"     donnée(s) -> "done"      école(s) -> "ecol"
//   ministère(s) -> "minist"        région(s) -> "region"
// "configurations" stems to "configu" (7 chars): prefixes up to "configu" (inclusive) still match the
// stemmed term (it starts with "configu"), but "configur" (8 chars) onward no longer does — this is
// the exact failure point the platform hit, verified live before writing the fixture below.
// ---------------------------------------------------------------------------------------------

const VOCAB = [
  'configuration', 'configurations', 'configurer', 'configurée',
  'publication', 'publications', 'publier', 'publiée',
  'commune', 'communes',
  'transporteur', 'transporteurs', 'transport', 'transports',
  'école', 'écoles', 'scolaire',
  'donnée', 'données',
  'ministère', 'ministères',
  'région', 'régions', 'régional',
  'budget', 'budgets',
  'projet', 'projets',
  'contrat', 'contrats',
  'habitant', 'habitants',
  'surface', 'surfaces',
  'service', 'services',
  'marché', 'marchés',
  'département', 'départements'
]

const sentence = (n: number, seed: number) => Array.from({ length: n }, (_, i) => VOCAB[(seed * 7 + i * 13) % VOCAB.length]).join(' ')
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

const N = 50_000

// Deterministic probe injection so the correctness matrix has a guaranteed, sizeable population to
// query against, on top of the organic vocabulary occurrences.
function buildTitle (i: number): string {
  // ~1/7 of docs: guaranteed "Configurations" at the front — the main single-word progressive-typing probe.
  if (i % 7 === 0) return `Configurations avancées du système régional numéro ${i}`
  // ~1/101: title STARTS WITH "Transporteurs..." — positive case for the keyword-view whole-value prefix probe.
  if (i % 101 === 0) return `Transporteurs publics de la région numéro ${i}`
  // ~1/13 (and not already covered above): title CONTAINS "transporteurs" but NOT at position 0 —
  // negative case showing what a keyword-view whole-value prefix cannot do.
  if (i % 13 === 0) return `Service régional des transporteurs publics ${i}`
  // ~1/29: title carries the "données publications" bigram — multi-word probe for variant f (title-only).
  if (i % 29 === 0) return `Nouvelles données publications officielles ${i}`
  const n = 3 + (i % 4) // 3..6 words
  const words = sentence(n, i).split(' ')
  return words.map((w, idx) => idx === 0 ? capitalize(w) : w).join(' ')
}

function buildDescription (i: number): string {
  const words = Array.from({ length: 30 }, (_, k) => VOCAB[(i * 7 + k * 13) % VOCAB.length])
  // ~1/11: "données publications" bigram mid-description — multi-word probe for a/b/c/d/e/g.
  if (i % 11 === 0) { words[5] = 'données'; words[6] = 'publications' }
  // ~1/997: bigram AT THE START of description — positive case for keyword-view multi-word probe.
  if (i % 997 === 0) { words[0] = 'données'; words[1] = 'publications' }
  return words.join(' ')
}

const docs = Array.from({ length: N }, (_, i) => ({ id: `rec-${i}`, title: buildTitle(i), description: buildDescription(i) }))

// ---------------------------------------------------------------------------------------------
// Variant mappings
// ---------------------------------------------------------------------------------------------

const baseSettings = { analysis: ANALYSIS_SETTINGS, number_of_replicas: 0 }

const fieldA = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    text_standard: { type: 'text', analyzer: 'standard' }
  }
})
const fieldB = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: { text: { type: 'text', analyzer: 'custom_french' } }
})
const fieldC = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    prefix: { type: 'text', analyzer: 'standard', index_options: 'docs', norms: false }
  }
})
const fieldD = () => ({
  type: 'keyword',
  ignore_above: 200,
  copy_to: '_prefix',
  fields: { text: { type: 'text', analyzer: 'custom_french' } }
})
const fieldE = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    keyword_insensitive: { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' }
  }
})
const fieldG = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french' },
    prefix: { type: 'text', analyzer: 'standard', index_options: 'docs', norms: false, index_prefixes: { min_chars: 2, max_chars: 10 } }
  }
})

const variants: Record<string, any> = {
  'spike-g-a': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldA(), description: fieldA() } } },
  'spike-g-b': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldB(), description: fieldB() } } },
  'spike-g-c': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldC(), description: fieldC() } } },
  'spike-g-d': {
    settings: baseSettings,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        title: fieldD(),
        description: fieldD(),
        _prefix: { type: 'text', analyzer: 'standard', index_options: 'docs', norms: false }
      }
    }
  },
  'spike-g-e': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldE(), description: fieldE() } } },
  'spike-g-f': {
    settings: baseSettings,
    mappings: {
      properties: {
        id: { type: 'keyword' },
        title: { type: 'search_as_you_type', analyzer: 'standard' },
        description: fieldB()
      }
    }
  },
  'spike-g-g': { settings: baseSettings, mappings: { properties: { id: { type: 'keyword' }, title: fieldG(), description: fieldG() } } }
}

// ---------------------------------------------------------------------------------------------
// Query shapes per variant — the query each variant would actually issue for q_mode=complete's
// prefix clause. All single-word matrix probes run against TITLE only (every variant maps title,
// and the "Configurations..." probe is injected there) so results are directly comparable.
// ---------------------------------------------------------------------------------------------

const singleWordQuery: Record<string, (p: string) => any> = {
  'spike-g-a': p => ({ simple_query_string: { query: `${p}*`, fields: ['title.text_standard'] } }),
  'spike-g-b': p => ({ simple_query_string: { query: `${p}*`, fields: ['title.text'] } }),
  'spike-g-c': p => ({ simple_query_string: { query: `${p}*`, fields: ['title.prefix'] } }),
  'spike-g-d': p => ({ simple_query_string: { query: `${p}*`, fields: ['_prefix'] } }),
  'spike-g-e': p => ({ prefix: { 'title.keyword_insensitive': p.toLowerCase() } }),
  'spike-g-f': p => ({ multi_match: { query: p, type: 'bool_prefix', fields: ['title', 'title._2gram', 'title._3gram'] } }),
  'spike-g-g': p => ({ simple_query_string: { query: `${p}*`, fields: ['title.prefix'] } })
}

// Multi-word probe: "données publi" — a/b/c/d/e/g query DESCRIPTION (where the bigram was injected),
// f can only query TITLE (its only search_as_you_type field; description in f has no prefix capability
// at all — a structural gap, not a runtime failure, called out separately below).
const multiWordQuery: Record<string, () => any> = {
  'spike-g-a': () => ({ simple_query_string: { query: 'données publi*', fields: ['description.text_standard'] } }),
  'spike-g-b': () => ({ simple_query_string: { query: 'données publi*', fields: ['description.text'] } }),
  'spike-g-c': () => ({ simple_query_string: { query: 'données publi*', fields: ['description.prefix'] } }),
  'spike-g-d': () => ({ simple_query_string: { query: 'données publi*', fields: ['_prefix'] } }),
  'spike-g-e': () => ({ prefix: { 'description.keyword_insensitive': 'données publi' } }),
  'spike-g-f': () => ({ multi_match: { query: 'données publi', type: 'bool_prefix', fields: ['title', 'title._2gram', 'title._3gram'] } }),
  'spike-g-g': () => ({ simple_query_string: { query: 'données publi*', fields: ['description.prefix'] } })
}

const PROGRESSIVE_PREFIXES = ['con', 'confi', 'config', 'configu', 'configur', 'configura', 'configuratio', 'configurations']

async function count (index: string, query: any): Promise<number> {
  const res = await es('POST', `/${index}/_count`, { query })
  return res.count
}

// ---------------------------------------------------------------------------------------------
// Build + measure each variant
// ---------------------------------------------------------------------------------------------

const built: string[] = []
const failed: Record<string, string> = {}

for (const [name, def] of Object.entries(variants)) {
  try {
    await resetIndex(name, def)
    const t0 = performance.now()
    await bulkIndex(name, docs)
    await es('POST', `/${name}/_forcemerge?max_num_segments=1`)
    finding(`${name} bulk+merge ${(performance.now() - t0).toFixed(0)}ms for ${N} docs`)
    built.push(name)
  } catch (err: any) {
    failed[name] = err.message ?? String(err)
    finding(`${name} FAILED TO BUILD: ${failed[name]}`)
  }
}

// ---- 1. store size + per-field disk usage ----
if (built.length) {
  const stats = await es('GET', `/${built.join(',')}/_stats/store`)
  for (const name of built) {
    const bytes = stats.indices[name].primaries.store.size_in_bytes
    finding(`${name} store size ${(bytes / 1e6).toFixed(2)} MB`)
  }
}

const diskUsage: Record<string, any> = {}
for (const name of built) {
  try {
    const du = await es('POST', `/${name}/_disk_usage?run_expensive_tasks=true`)
    diskUsage[name] = du[name]
    const fields = du[name].fields
    for (const fieldName of Object.keys(fields)) {
      if (fieldName.startsWith('_') && fieldName !== '_prefix') continue // skip ES metadata fields, keep our custom _prefix
      if (!fieldName.startsWith('title') && !fieldName.startsWith('description') && fieldName !== '_prefix') continue
      const f = fields[fieldName]
      finding(`${name} field ${fieldName} total=${f.total_in_bytes}B inverted_index=${f.inverted_index.total_in_bytes}B stored_fields=${f.stored_fields_in_bytes}B doc_values=${f.doc_values_in_bytes}B norms=${f.norms_in_bytes}B`)
    }
  } catch (err: any) {
    finding(`${name} _disk_usage FAILED: ${err.message ?? err} -- falling back to total store size only`)
  }
}

// ---- 3. correctness matrix: progressive single-word prefixes ----
const matrix: Record<string, Record<string, number | string>> = {}
for (const name of built) {
  matrix[name] = {}
  for (const p of PROGRESSIVE_PREFIXES) {
    try {
      const c = await count(name, singleWordQuery[name](p))
      matrix[name][p] = c
    } catch (err: any) {
      matrix[name][p] = `ERR: ${(err.message ?? String(err)).split('\n')[0]}`
    }
  }
  finding(`${name} progressive prefix hits: ` + PROGRESSIVE_PREFIXES.map(p => `${p}=${matrix[name][p]}`).join(' '))
}

// ---- multi-word probe ----
const multiWordResults: Record<string, number | string> = {}
for (const name of built) {
  try {
    multiWordResults[name] = await count(name, multiWordQuery[name]())
  } catch (err: any) {
    multiWordResults[name] = `ERR: ${(err.message ?? String(err)).split('\n')[0]}`
  }
  finding(`${name} multi-word "données publi*" hits: ${multiWordResults[name]}`)
}

// ---- keyword-view (e) mid-value negative demonstration ----
if (built.includes('spike-g-e')) {
  try {
    const startsWith = await count('spike-g-e', { prefix: { 'title.keyword_insensitive': 'transporteurs' } })
    // NB: simple_query_string silently drops leading-wildcard terms (returns 0, no error) — use an
    // explicit `wildcard` query instead. Variant e has no unstemmed field at all (only `.text` and
    // `.keyword_insensitive`), so the "contains anywhere" ground truth has to go through the stemmed
    // `.text` field, matching the "transport" stem shared by transporteur(s)/transport(s).
    const contains = await count('spike-g-e', { wildcard: { 'title.text': '*transport*' } })
    finding(`spike-g-e mid-value probe: prefix('transporteurs') on title.keyword_insensitive (whole-value, starts-with only) = ${startsWith} hits; contains-anywhere (transport family, via stemmed title.text, only field available) = ${contains} hits -> keyword-view misses ${contains - startsWith} docs where the word isn't at position 0`)
  } catch (err: any) {
    finding(`spike-g-e mid-value probe FAILED: ${err.message ?? err}`)
  }
}

// ---- 4. query latency ----
for (const name of built) {
  try {
    await time(`${name} single-word "configur*"`, 20, () => count(name, singleWordQuery[name]('configur')))
  } catch (err: any) {
    finding(`${name} single-word latency query FAILED: ${err.message ?? err}`)
  }
  try {
    await time(`${name} multi-word "données publi*"`, 20, () => count(name, multiWordQuery[name]()))
  } catch (err: any) {
    finding(`${name} multi-word latency query FAILED: ${err.message ?? err}`)
  }
}

// ---------------------------------------------------------------------------------------------
// 5. Fanout: 20 per-column prefix fields (variant c shape) vs one global _prefix field (variant d shape)
// ---------------------------------------------------------------------------------------------

const FANOUT_N = 10_000
const FANOUT_COLS = 20
const fanoutDoc = (i: number) => {
  const doc: any = { id: `frec-${i}` }
  for (let c = 0; c < FANOUT_COLS; c++) {
    doc[`col${c}`] = c === 3 ? `${sentence(4, i)} configurations` : sentence(4, i + c)
  }
  return doc
}
const fanoutDocs = Array.from({ length: FANOUT_N }, (_, i) => fanoutDoc(i))

const percolProps: any = { id: { type: 'keyword' } }
const globalProps: any = { id: { type: 'keyword' } }
for (let c = 0; c < FANOUT_COLS; c++) {
  percolProps[`col${c}`] = {
    type: 'keyword',
    ignore_above: 200,
    fields: { prefix: { type: 'text', analyzer: 'standard', index_options: 'docs', norms: false } }
  }
  globalProps[`col${c}`] = { type: 'keyword', ignore_above: 200, copy_to: '_prefix' }
}
globalProps._prefix = { type: 'text', analyzer: 'standard', index_options: 'docs', norms: false }

const fanoutBuilt: string[] = []
try {
  await resetIndex('spike-g-fanout-percol', { settings: baseSettings, mappings: { properties: percolProps } })
  await bulkIndex('spike-g-fanout-percol', fanoutDocs)
  await es('POST', '/spike-g-fanout-percol/_forcemerge?max_num_segments=1')
  fanoutBuilt.push('spike-g-fanout-percol')
} catch (err: any) {
  finding(`spike-g-fanout-percol FAILED TO BUILD: ${err.message ?? err}`)
}
try {
  await resetIndex('spike-g-fanout-global', { settings: baseSettings, mappings: { properties: globalProps } })
  await bulkIndex('spike-g-fanout-global', fanoutDocs)
  await es('POST', '/spike-g-fanout-global/_forcemerge?max_num_segments=1')
  fanoutBuilt.push('spike-g-fanout-global')
} catch (err: any) {
  finding(`spike-g-fanout-global FAILED TO BUILD: ${err.message ?? err}`)
}

if (fanoutBuilt.includes('spike-g-fanout-percol')) {
  const percolFields = Array.from({ length: FANOUT_COLS }, (_, c) => `col${c}.prefix`)
  const hits = await count('spike-g-fanout-percol', { simple_query_string: { query: 'configur*', fields: percolFields } })
  finding(`spike-g-fanout-percol correctness sanity: configur* across ${FANOUT_COLS} per-column .prefix fields = ${hits} hits`)
  await time('spike-g-fanout-percol 20-field fanout "configur*"', 20, () => count('spike-g-fanout-percol', { simple_query_string: { query: 'configur*', fields: percolFields } }))
}
if (fanoutBuilt.includes('spike-g-fanout-global')) {
  const hits = await count('spike-g-fanout-global', { simple_query_string: { query: 'configur*', fields: ['_prefix'] } })
  finding(`spike-g-fanout-global correctness sanity: configur* on single _prefix field = ${hits} hits`)
  await time('spike-g-fanout-global single-field "configur*"', 20, () => count('spike-g-fanout-global', { simple_query_string: { query: 'configur*', fields: ['_prefix'] } }))
}

// ---------------------------------------------------------------------------------------------
// cleanup
// ---------------------------------------------------------------------------------------------

for (const name of [...built, ...Object.keys(failed), ...fanoutBuilt]) {
  await es('DELETE', `/${name}`).catch(() => {})
}
console.log('spike G done')
