// q_mode=complete ranking & cost review (INVESTIGATIONS.md §16).
//
// Question: `complete` mode's prefix clause is constant-score (verified against a real
// API-seeded dataset by src/complete-check.ts — every mid-typing keystroke whose prefix
// is not accidentally a stem returns a single score tier, so "ranking" degenerates to
// the _i/_updatedAt tie-break, i.e. row order). What would ranked autocomplete cost,
// and what ordering would each candidate produce?
//
// The experiment builds its own index (same convention as §15's text-analyzer family):
// a referential-flavored corpus — establishments with a label ("École primaire
// Saint-Martin-de-Provence"), a commune column with Zipfian popularity and deliberate
// prefix families (mar → Marseille/Martigues/Marché/Saint-Martin…), a French sentence
// description, a keyword category, a year — mapped EXACTLY as the post-#534 new shape
// maps them (keyword main + .text keyword_repeat + .keyword_insensitive; analysis
// settings transcribed from indexBase, api/src/datasets/es/manage-indices.ts).
//
// Arms (per probe):
//   complete-today  production buildQClauses complete-mode body (baseline)
//   prefix-only     the startsWith clause alone (cost isolation)
//   simple-mode     production default-mode body (plain q + exact-match boost 0.5)
//   bool-prefix     multi_match type=bool_prefix over the .text fields
//   ranked-prefix   per-field prefix queries, rewrite=top_terms_blended_freqs_1024
//   tiered          complete-today + scoring-only value tiers (term^8 / value-prefix^4
//                   on label/commune .keyword_insensitive)
//   agg-popularity  the singleSearch alternative: prefix filter + terms agg on label
//                   ordered by _count (suggestions = most frequent values)

import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'
import { mulberry32 } from '../generator.ts'
import { getEsClient } from '../es.ts'

export const COMPLETE_RANKING_INDEX = 'benchmark-complete-ranking'
const DEFAULT_ROWS = 200_000

// ---- corpus ----

const SAINT_BASES = ['Martin', 'Marcel', 'Maurice', 'Médard', 'Michel', 'Pierre', 'Paul', 'Denis', 'Julien', 'Étienne']
const SUFFIXES = ['', '-de-Provence', '-sur-Loire', '-en-Retz', '-la-Forêt']
const STANDALONE = [
  'Marseille', 'Martigues', 'Marmande', 'Margaux', 'Marckolsheim',
  'Commercy', 'Communay', 'Commentry', 'Combourg', 'Compiègne',
  'Toulouse', 'Tours', 'Tourcoing', 'Nantes', 'Nice', 'Lyon', 'Lille',
  'Bordeaux', 'Brest', 'Dijon', 'Écully', 'Équeurdreville'
]

function communeList (): string[] {
  const list = [...STANDALONE]
  for (const base of SAINT_BASES) for (const suffix of SUFFIXES) list.push(`Saint-${base}${suffix}`)
  list.push('Sainte-Marie', 'Sainte-Marie-aux-Mines', 'Sainte-Maxime')
  return list
}

const TYPES = [
  'École primaire', 'Collège', 'Gymnase', 'Médiathèque', 'Marché couvert',
  'Mairie', 'Piscine municipale', 'Stade', 'Crèche', 'Maison de santé'
]

const CATEGORIES = ['enseignement', 'sport', 'culture', 'administration', 'santé', 'commerce']

const TEMPLATES = [
  'La {type} de {commune} publie chaque année les données de fréquentation de la commune.',
  'Les services municipaux de {commune} assurent la gestion des équipements sportifs et culturels.',
  'Cet établissement accueille les habitants de {commune} et des communes environnantes.',
  'Le budget communal de {commune} finance les travaux d\'entretien de la {type}.',
  'Les associations locales de {commune} organisent des activités dans la {type}.',
  'La commune de {commune} recense les équipements publics accessibles aux personnes à mobilité réduite.',
  'Les commerces de proximité de {commune} participent au marché hebdomadaire.',
  'Le territoire de {commune} regroupe plusieurs écoles et établissements scolaires.',
  'La {type} contribue à la vie culturelle et associative de {commune}.',
  'Les données de {commune} sont publiées en open data par les services de la mairie.',
  'Le tourisme représente une part importante de l\'économie de {commune}.',
  'La population de {commune} bénéficie des transports en commun de l\'agglomération.'
]

/** Zipfian pick: rank r with weight 1/(r+1). */
function zipfPick<T> (list: T[], rand: () => number, cum: number[]): T {
  const x = rand() * cum[cum.length - 1]
  let lo = 0; let hi = cum.length - 1
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < x) lo = mid + 1; else hi = mid }
  return list[lo]
}

function cumWeights (n: number): number[] {
  const cum: number[] = []
  let acc = 0
  for (let r = 0; r < n; r++) { acc += 1 / (r + 1); cum.push(acc) }
  return cum
}

// ---- index build (production new-shape mapping) ----

// analysis settings transcribed from indexBase (api/src/datasets/es/manage-indices.ts)
const ANALYSIS = {
  normalizer: {
    insensitive_normalizer: { type: 'custom', filter: ['lowercase', 'asciifolding'] }
  },
  filter: {
    french_elision: {
      type: 'elision',
      articles_case: true,
      articles: ['l', 'm', 't', 'qu', 'n', 's', 'j', 'd', 'c', 'jusqu', 'quoiqu', 'lorsqu', 'puisqu']
    },
    french_stop: { type: 'stop', stopwords: '_french_' },
    french_stemmer: { type: 'stemmer', language: 'light_french' }
  },
  analyzer: {
    custom_french: {
      tokenizer: 'standard',
      filter: ['french_elision', 'lowercase', 'french_stop', 'french_stemmer', 'asciifolding']
    },
    custom_french_repeat: {
      tokenizer: 'standard',
      filter: ['french_elision', 'lowercase', 'keyword_repeat', 'french_stop', 'french_stemmer', 'remove_duplicates', 'asciifolding']
    },
    custom_french_exact: {
      tokenizer: 'standard',
      filter: ['french_elision', 'lowercase', 'asciifolding']
    }
  }
}

/** esProperty new-shape output for a full-text string column. */
const textColumn = () => ({
  type: 'keyword',
  ignore_above: 200,
  fields: {
    text: { type: 'text', analyzer: 'custom_french_repeat', search_analyzer: 'custom_french' },
    keyword_insensitive: { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' }
  }
})

const MAPPING = {
  properties: {
    _i: { type: 'long' },
    label: textColumn(),
    commune: textColumn(),
    description: textColumn(),
    category: {
      type: 'keyword',
      ignore_above: 200,
      fields: { keyword_insensitive: { type: 'keyword', ignore_above: 200, normalizer: 'insensitive_normalizer' } }
    },
    year: { type: 'long', fields: { text_standard: { type: 'text', analyzer: 'standard' } } }
  }
}

// production field routing for this schema (getFilterableFields transcription)
const Q_EXACT_FIELDS = ['label.text', 'commune.text', 'description.text']
const Q_STANDARD_FIELDS = ['year.text_standard']
const Q_SEARCH_FIELDS = [...Q_EXACT_FIELDS, ...Q_STANDARD_FIELDS, 'category.keyword_insensitive']
const PREFIX_FIELDS = [...Q_EXACT_FIELDS, ...Q_STANDARD_FIELDS]

function * docs (rows: number): Generator<Record<string, unknown>> {
  const communes = communeList()
  const cum = cumWeights(communes.length)
  const rand = mulberry32(1234)
  for (let i = 0; i < rows; i++) {
    const commune = zipfPick(communes, rand, cum)
    const type = TYPES[Math.floor(rand() * TYPES.length)]
    const template = TEMPLATES[Math.floor(rand() * TEMPLATES.length)]
    yield {
      _i: i,
      label: `${type} ${commune}`,
      commune,
      description: template.replaceAll('{commune}', commune).replaceAll('{type}', type.toLowerCase()),
      category: CATEGORIES[Math.floor(rand() * CATEGORIES.length)],
      year: 2015 + Math.floor(rand() * 10)
    }
  }
}

/** Build (or reuse) the index. Reuse requires matching doc count AND the repeat analyzer
 *  (§15.c lesson: a doc-count-only check silently reuses a stale-analysis index). */
export async function prepareCompleteRankingIndex (rows = DEFAULT_ROWS): Promise<string> {
  const es = getEsClient()
  const index = COMPLETE_RANKING_INDEX
  if (await es.indices.exists({ index })) {
    const [count, settings] = await Promise.all([
      es.count({ index }),
      es.indices.getSettings({ index })
    ])
    const analyzers = (Object.values(settings as Record<string, any>)[0])?.settings?.index?.analysis?.analyzer ?? {}
    if (count.count === rows && analyzers.custom_french_repeat && analyzers.custom_french_exact) {
      console.log(`[complete-ranking] reusing ${index} (${rows.toLocaleString()} docs)`)
      return index
    }
    console.log(`[complete-ranking] rebuilding ${index} (stale count or analysis)`)
    await es.indices.delete({ index })
  }
  console.log(`[complete-ranking] building ${index} (${rows.toLocaleString()} docs)…`)
  await es.indices.create({
    index,
    settings: { index: { number_of_shards: 1, number_of_replicas: 0, refresh_interval: '-1' }, analysis: ANALYSIS } as any,
    mappings: MAPPING as any
  })
  let batch: any[] = []
  let sent = 0
  const flush = async () => {
    if (!batch.length) return
    const res = await es.bulk({ operations: batch })
    if (res.errors) throw new Error('bulk indexing errors: ' + JSON.stringify(res.items.find((it: any) => it.index?.error)))
    sent += batch.length / 2
    batch = []
  }
  for (const doc of docs(rows)) {
    batch.push({ index: { _index: index, _id: `r${doc._i}` } }, doc)
    if (batch.length >= 4000) await flush()
  }
  await flush()
  await es.indices.refresh({ index })
  await es.indices.forcemerge({ index, max_num_segments: 1 })
  await es.indices.putSettings({ index, settings: { refresh_interval: '1s' } })
  console.log(`[complete-ranking] built ${index} (${sent.toLocaleString()} docs, force-merged)`)
  await sanityChecks(index)
  return index
}

// ---- query bodies ----

const PAGE = { size: 20, track_total_hits: true, sort: ['_score', '_i'] }

/** Fold a prefix the way insensitive/exact analysis would (raw prefix queries skip analysis). */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** buildQClauses complete mode, new shape, no wildcard columns (production baseline). */
export function completeTodayBody (q: string) {
  const should: any[] = []
  if (!q.includes('*') && !q.includes('?')) {
    should.push({ simple_query_string: { query: `${q}*`, fields: PREFIX_FIELDS } })
  }
  if (q.includes(' ') && !q.includes('"')) {
    should.push({ simple_query_string: { query: `"${q}"`, fields: Q_SEARCH_FIELDS } })
  }
  should.push({ simple_query_string: { query: q, fields: Q_SEARCH_FIELDS } })
  return { query: { bool: { should, minimum_should_match: 1 } }, ...PAGE }
}

/** buildQClauses default (simple) mode incl. the exact-match boost clause (EXACT_MATCH_BOOST = 0.5). */
export function simpleModeBody (q: string) {
  const should: any[] = [
    { simple_query_string: { query: q, fields: Q_SEARCH_FIELDS } },
    { simple_query_string: { query: q, fields: Q_EXACT_FIELDS, analyzer: 'custom_french_exact', boost: 0.5 } }
  ]
  return { query: { bool: { should, minimum_should_match: 1 } }, ...PAGE }
}

export function prefixOnlyBody (q: string) {
  return { query: { simple_query_string: { query: `${q}*`, fields: PREFIX_FIELDS } }, ...PAGE }
}

export function boolPrefixBody (q: string) {
  return { query: { multi_match: { query: q, type: 'bool_prefix', fields: Q_EXACT_FIELDS } }, ...PAGE }
}

/** Ranked prefix: per-field prefix queries with a scoring rewrite — docs score by the
 *  blended TF/IDF of the expanded completion terms instead of a constant. */
export function rankedPrefixBody (q: string) {
  const terms = fold(q).split(/\s+/)
  const last = terms[terms.length - 1]
  const scored = terms.slice(0, -1).join(' ')
  const should: any[] = Q_EXACT_FIELDS.map(f => ({
    prefix: { [f]: { value: last, rewrite: 'top_terms_blended_freqs_1024' } }
  }))
  if (scored) should.push({ simple_query_string: { query: scored, fields: Q_SEARCH_FIELDS } })
  return { query: { bool: { should, minimum_should_match: 1 } }, ...PAGE }
}

/** complete-today + scoring-only "match quality" tiers on the value columns:
 *  whole-value equality (^8) then value-startsWith (^4), case/accent-insensitive. */
export function tieredBody (q: string) {
  const base = completeTodayBody(q)
  const folded = fold(q)
  for (const col of ['label', 'commune']) {
    base.query.bool.should.push(
      { term: { [`${col}.keyword_insensitive`]: { value: folded, boost: 8 } } },
      { prefix: { [`${col}.keyword_insensitive`]: { value: folded, boost: 4 } } }
    )
  }
  return base
}

/** The singleSearch alternative: same match set as prefix-only, suggestions ranked by
 *  popularity (terms agg ordered by _count) instead of by (constant) score. */
export function aggPopularityBody (q: string) {
  return {
    query: { simple_query_string: { query: `${q}*`, fields: PREFIX_FIELDS } },
    size: 0,
    track_total_hits: true,
    // size:0 requests are shard-request-cacheable, unlike the hits arms — disable for a fair A/B
    request_cache: false,
    aggs: { suggestions: { terms: { field: 'label', order: { _count: 'desc' }, size: 20 } } }
  }
}

const ARMS: Record<string, (q: string) => Record<string, any>> = {
  'complete-today': completeTodayBody,
  'prefix-only': prefixOnlyBody,
  'simple-mode': simpleModeBody,
  'bool-prefix': boolPrefixBody,
  'ranked-prefix': rankedPrefixBody,
  tiered: tieredBody,
  'agg-popularity': aggPopularityBody
}

// ---- sanity checks & ranking evidence (printed at build time) ----

async function sanityChecks (index: string): Promise<void> {
  const es = getEsClient()

  // S1 — normalizer applies to term/prefix input on .keyword_insensitive
  const s1: any = await es.search({ index, query: { term: { 'label.keyword_insensitive': 'école primaire marseille' } }, size: 0, track_total_hits: true })
  console.log(`[sanity] S1 term on keyword_insensitive (folded input) hits=${s1.hits.total.value} ${s1.hits.total.value > 0 ? 'PASS' : 'FAIL'}`)

  // S2 — accent ladder: every ASCII prefix of "écully" matches on the new shape
  let s2ok = true
  for (const p of ['ec', 'ecu', 'ecul', 'ecull']) {
    const r: any = await es.search({ index, ...prefixOnlyBody(p), size: 0 })
    if (r.hits.total.value === 0) { s2ok = false; console.log(`[sanity] S2 prefix "${p}" → 0 hits`) }
  }
  console.log(`[sanity] S2 accent prefix ladder ${s2ok ? 'PASS' : 'FAIL'}`)

  // S3 — constant-ranking exhibit: distinct score count of complete-today at a mid-typing keystroke
  const s3: any = await es.search({ index, ...completeTodayBody('mar') })
  const distinct = [...new Set(s3.hits.hits.map((h: any) => h._score))]
  console.log(`[sanity] S3 complete-today q="mar": total=${s3.hits.total.value}, top-20 distinct scores=${distinct.length} (${distinct.slice(0, 4).join(', ')}) — expected 1-2 tiers`)
}

/** Qualitative ranking evidence: top suggestions per arm for each probe. */
export async function printRankingEvidence (index: string, probes: string[]): Promise<void> {
  const es = getEsClient()
  for (const q of probes) {
    console.log(`\n[ranking] q="${q}"`)
    for (const [arm, builder] of Object.entries(ARMS)) {
      const body = builder(q)
      const res: any = await es.search({ index, ...body })
      let display: string
      if (body.aggs) {
        display = res.aggregations.suggestions.buckets.slice(0, 5).map((b: any) => `${b.key} (${b.doc_count})`).join(' | ')
      } else {
        const distinct = new Set(res.hits.hits.map((h: any) => h._score)).size
        display = res.hits.hits.slice(0, 5).map((h: any) => `${h._source.label}@${h._score.toFixed(2)}`).join(' | ') + `  [${distinct} distinct scores/20]`
      }
      console.log(`  ${arm.padEnd(15)} total=${String(res.hits.total.value).padEnd(7)} ${display}`)
    }
  }
}

// ---- experiment definitions ----

const PROBES: Record<string, string> = {
  'mid-word': 'mar',
  ambiguous: 'comm',
  'full-word': 'marseille',
  'two-words': 'saint mar'
}

export const completeRankingExperiments: Experiment[] = Object.entries(PROBES).map(([probeName, q]) => ({
  name: `complete-ranking:${probeName}`,
  description: `complete-mode ranking/cost candidates, q="${q}"`,
  preset: 'custom',
  prepare: async (rows?: number) => ({
    index: await prepareCompleteRankingIndex(rows ?? DEFAULT_ROWS),
    rows: rows ?? DEFAULT_ROWS
  }),
  baseline: {
    name: 'complete-today',
    description: 'production complete-mode body (constant-score prefix)',
    body: (_ctx: SchemaContext) => completeTodayBody(q)
  },
  variants: Object.entries(ARMS).filter(([name]) => name !== 'complete-today').map(([name, builder]) => ({
    name,
    description: name,
    body: (_ctx: SchemaContext) => builder(q)
  }))
}))
