import type { Client } from '@elastic/elasticsearch'
import type { Experiment, ExperimentSetup } from '../experiments.ts'
import type { SchemaContext, SchemaField } from '../generator.ts'
import { getEsClient } from '../es.ts'
import { docIterator, generateDocs, corpusStats, type TextDoc } from './text-analyzer-corpus.ts'

// Is the `keyword_repeat` single-field analyzer worth it?
//
// Today a text column is mapped as a keyword main carrying TWO analyzed sub-fields:
//   `.text`          — custom_french (elision + stop + light_french stemmer + asciifolding)
//   `.text_standard` — the standard analyzer, unstemmed; it exists mainly so `q_mode=complete`'s
//                      mid-typing `startsWith` prefix clause doesn't stop matching the moment the
//                      typed word is stemmed away from its surface form.
// Candidate: ONE analyzed sub-field whose analyzer emits, at every position, both the surface
// token and the stemmed token (the Lucene `keyword_repeat` pattern) — recovering `.text_standard`'s
// prefix/exact-form behavior inside `.text` and collapsing the production `q` clause pair into one.
//
// Three variants, same 2 text columns, same docs, 1 shard, force-merged to 1 segment:
//   dual   (today)  keyword + { text: custom_french, text_standard: standard }
//   single          keyword + { text: custom_french }                       — the floor
//   repeat          keyword + { text: custom_french_repeat }                — the candidate
//
// Measures (a) store bytes + per-field `_disk_usage` so the analyzed portion is isolated from
// `_source`/doc-values, (b) the three production query shapes, (c) two correctness checks that
// must accompany any quotation of the size/latency numbers.
//
// Related: INVESTIGATIONS.md §6 (`_search` catch-all cost curve vs field count) and §7 (keyword
// mains in `q`) established the per-column-fanout cost model this trades against — halving the
// analyzed sub-fields per column halves that fanout; §12/§13 established the real-corpus and
// `request_cache=false` measurement discipline reused here. The dev spike that designed and
// validated the analyzer is `dev/spikes/indexing-rework/spike-i-keyword-repeat.ts`.

// ---------------------------------------------------------------------------------------------
// Analyzers
// ---------------------------------------------------------------------------------------------

/**
 * Verbatim copy of the analysis block from `api/src/datasets/es/manage-indices.ts` (indexBase).
 * Exported so `text-analyzer-wide.ts` (§14.b) reuses the exact same analyzers/filters rather
 * than risking drift between a 2-column and a 40-column copy.
 */
export const ANALYSIS_SETTINGS = {
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
    }
  }
}

// Filter order copied verbatim from dev/spikes/indexing-rework/spike-i-keyword-repeat.ts, where it
// was investigated live with `_analyze` before being committed to. The reasons for the order:
// - `keyword_repeat` sits right before french_stop/french_stemmer: it duplicates each token into a
//   keyword-marked copy (which french_stemmer — Lucene stemmers respect the keyword attribute —
//   skips) and a free copy (which french_stemmer processes normally).
// - `french_stop` runs on BOTH copies. Lucene's StopFilter is NOT keyword-attribute-aware, so a
//   stopword is removed from both copies uniformly — no stopword leaks through on the keyword side.
// - `remove_duplicates` runs right after french_stemmer (the standard keyword_repeat + stemmer +
//   remove_duplicates combo): it collapses the two copies back into one whenever stemming was a
//   no-op (invariant words), avoiding a spurious tf=2 at that position — and, decisively for this
//   experiment, keeping the index from paying for a second posting on every uninflected token.
// - `asciifolding` runs LAST, after remove_duplicates — mirrors today's `custom_french` (which also
//   folds last), so BOTH surviving copies end up accent-insensitive, and dedupe compares pre-fold
//   token text (the conservative comparison: it won't over-merge tokens that are only equal
//   after folding).
export const REPEAT_FILTER_ORDER = [
  'french_elision', 'lowercase', 'keyword_repeat', 'french_stop', 'french_stemmer',
  'remove_duplicates', 'asciifolding'
]

export const ANALYSIS_SETTINGS_REPEAT = {
  ...ANALYSIS_SETTINGS,
  analyzer: {
    ...ANALYSIS_SETTINGS.analyzer,
    custom_french_repeat: { tokenizer: 'standard', filter: REPEAT_FILTER_ORDER }
  }
}

// ---------------------------------------------------------------------------------------------
// Variants
// ---------------------------------------------------------------------------------------------

export const ARMS = ['dual', 'single', 'repeat'] as const
export type Arm = typeof ARMS[number]

const fieldMappings: Record<Arm, () => Record<string, any>> = {
  dual: () => ({
    type: 'keyword',
    ignore_above: 200,
    fields: {
      text: { type: 'text', analyzer: 'custom_french' },
      text_standard: { type: 'text', analyzer: 'standard' }
    }
  }),
  single: () => ({
    type: 'keyword',
    ignore_above: 200,
    fields: { text: { type: 'text', analyzer: 'custom_french' } }
  }),
  repeat: () => ({
    type: 'keyword',
    ignore_above: 200,
    fields: { text: { type: 'text', analyzer: 'custom_french_repeat' } }
  })
}

/** Both text columns of the experiment index, declared as a data-fair schema for the query ctx. */
export const TEXT_ANALYZER_SCHEMA: SchemaField[] = [
  { key: 'title', type: 'string', 'x-capabilities': { text: true, textStandard: true, index: true } },
  { key: 'description', type: 'string', 'x-capabilities': { text: true, textStandard: true, index: true } }
]

export const DEFAULT_ROWS = 300_000
const INDEX_PREFIX = 'benchmark-text-analyzer'

export function indexName (arm: Arm): string {
  return `${INDEX_PREFIX}-${arm}`
}

function indexDefinition (arm: Arm): Record<string, any> {
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      // one segment is force-merged in before measuring; no background refresh during the load
      refresh_interval: '-1',
      analysis: ANALYSIS_SETTINGS_REPEAT
    },
    mappings: {
      properties: {
        id: { type: 'keyword' },
        title: fieldMappings[arm](),
        description: fieldMappings[arm]()
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Query shapes (production `q`, per `api/src/datasets/es/operations.ts` buildQClauses)
// ---------------------------------------------------------------------------------------------

const textFields = (ctx: SchemaContext): string[] => ctx.fullTextFields.map(k => `${k}.text`)
const standardFields = (ctx: SchemaContext): string[] => ctx.fullTextFields.map(k => `${k}.text_standard`)

/** Shared per-query settings: prod page-1 shape, and never the shard request cache (§13). */
const common = { size: 20, track_total_hits: true, request_cache: false }

/**
 * default `q` mode. `dual` is the two-clause bool/should production shape — clause A over the
 * stemmed `.text` views, clause B over the raw `.text_standard` views to boost exact matches.
 * `single`/`repeat` have only one analyzed view per column, so clause B dissolves: this is the
 * clause collapse the candidate buys.
 */
function defaultQ (fields: string[][], query: string, analyzer?: string): Record<string, any> {
  const should = fields.map(f => ({ simple_query_string: { query, fields: f, ...(analyzer ? { analyzer } : {}) } }))
  return { query: { bool: { should, minimum_should_match: 1 } }, ...common }
}

/** `q_mode=complete`'s startsWith clause: the mid-typing prefix, on the unstemmed surface view. */
function startsWith (fields: string[], typed: string, analyzer?: string): Record<string, any> {
  return { query: { simple_query_string: { query: `${typed}*`, fields, ...(analyzer ? { analyzer } : {}) } }, ...common }
}

/** Quoted phrase — exercises the positions path on each analyzed view. */
function phrase (fields: string[][], quoted: string, analyzer?: string): Record<string, any> {
  const should = fields.map(f => ({ simple_query_string: { query: `"${quoted}"`, fields: f, ...(analyzer ? { analyzer } : {}) } }))
  return { query: { bool: { should, minimum_should_match: 1 } }, ...common }
}

// A `repeat`-mapped field is analyzed with custom_french_repeat at SEARCH time too, so every query
// position becomes a 2-term SynonymQuery. `repeat-frq` keeps the same index but overrides the
// query analyzer to plain custom_french — one stemmed term per position, matching the stemmed copy
// that repeat also indexes. It isolates how much of repeat's query cost is the doubled query
// (fixable with `search_analyzer`) rather than the doubled index (not fixable).
export const SEARCH_ANALYZER_OVERRIDE = 'custom_french'

const Q_TERMS = 'logements sociaux commune'
const TYPED_PREFIX = 'logem'
// a frequent 4-word phrase (~56k matching docs): a rare phrase resolves in under 1 ms, which the
// integer-millisecond `took` cannot discriminate at all
const PHRASE = 'sont publiees chaque annee'

// ---------------------------------------------------------------------------------------------
// Index build + measurements (setup)
// ---------------------------------------------------------------------------------------------

export interface SizeMeasure {
  arm: Arm
  storeBytes: number
  segments: number
  docs: number
  /** `_disk_usage` total for the analyzed sub-fields only (`*.text`, `*.text_standard`). */
  analyzedBytes: number
  /** `_disk_usage` inverted-index-only total for those same sub-fields. */
  invertedIndexBytes: number
  perField: Record<string, number>
}

async function bulkLoad (es: Client, index: string, rows: number): Promise<void> {
  const batch: any[] = []
  let pending = 0
  const flush = async () => {
    if (batch.length === 0) return
    const res = await es.bulk({ operations: batch })
    if (res.errors) {
      const failed = res.items.find((it: any) => it.index?.error)
      throw new Error(`bulk errors on ${index}: ${JSON.stringify(failed).slice(0, 300)}`)
    }
    batch.length = 0
    pending = 0
  }
  for (const doc of docIterator(rows)) {
    batch.push({ index: { _index: index, _id: doc.id } }, doc)
    if (++pending >= 5000) await flush()
  }
  await flush()
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms))

/**
 * `forcemerge` returns before the store has settled: the merged segment is still being written
 * and/or the pre-merge segments are still referenced, so `indices.stats` right after it reports a
 * size that is neither the old nor the final one (measured: 53 MB for an index that settles at
 * 106 MB — a size A/B taken there is pure fiction). Flush, then poll until the store size is
 * stable over two consecutive reads AND the index is down to one segment.
 */
export async function waitForStableStore (es: Client, index: string): Promise<void> {
  await es.indices.flush({ index, force: true, wait_if_ongoing: true })
  await es.indices.refresh({ index })
  let previous = -1
  for (let attempt = 0; attempt < 40; attempt++) {
    const stats: any = await es.indices.stats({ index, metric: 'store,segments' })
    const size = stats._all.primaries.store.size_in_bytes
    const segments = stats._all.primaries.segments.count
    if (size === previous && segments === 1) return
    previous = size
    await sleep(1000)
  }
  throw new Error(`${index}: store size never stabilised at one segment`)
}

async function measureSize (es: Client, arm: Arm): Promise<SizeMeasure> {
  const index = indexName(arm)
  await waitForStableStore(es, index)
  const stats: any = await es.indices.stats({ index, metric: 'store,docs,segments' })
  const primaries = stats._all.primaries
  const usage: any = await es.indices.diskUsage({ index, run_expensive_tasks: true })
  const fields = usage[index]?.fields ?? {}
  const perField: Record<string, number> = {}
  let analyzedBytes = 0
  let invertedIndexBytes = 0
  for (const [name, value] of Object.entries<any>(fields)) {
    perField[name] = value.total_in_bytes
    if (/\.(text|text_standard)$/.test(name)) {
      analyzedBytes += value.total_in_bytes
      invertedIndexBytes += value.inverted_index?.total_in_bytes ?? 0
    }
  }
  return {
    arm,
    storeBytes: primaries.store.size_in_bytes,
    segments: primaries.segments.count,
    docs: primaries.docs.count,
    analyzedBytes,
    invertedIndexBytes,
    perField
  }
}

async function countHits (es: Client, index: string, query: any): Promise<number> {
  const res: any = await es.count({ index, query })
  return res.count
}

/** Words present in the corpus whose surface form differs from their light_french stem. */
const STEM_PROBES = ['logements', 'associations', 'communes', 'donnees publiees', 'equipements sportifs']
/** Mid-typing ladders: every prefix of length >= 2 of a word a user would type in an autocomplete. */
const PREFIX_LADDER_WORDS = ['logements', 'associations', 'transport', 'equipements']

/**
 * The four measured arms: which index, which fields the production clause would target, and which
 * analyzer the query itself is run through. `.text_standard` for dual's prefix clause (the reason
 * that field exists), `.text` everywhere else.
 */
interface ProbeArm {
  label: string
  arm: Arm
  prefixSuffix: '.text' | '.text_standard'
  /** query-side analyzer override — omitted means "the field's own analyzer" */
  analyzer?: string
}

const PROBE_ARMS: ProbeArm[] = [
  { label: 'dual', arm: 'dual', prefixSuffix: '.text_standard' },
  { label: 'single', arm: 'single', prefixSuffix: '.text' },
  { label: 'repeat', arm: 'repeat', prefixSuffix: '.text' },
  { label: 'repeat-frq', arm: 'repeat', prefixSuffix: '.text', analyzer: SEARCH_ANALYZER_OVERRIDE }
]

export interface SanityChecks {
  /** repeat's recall on a stemmed query equals dual's, arm by arm. */
  stemmedRecall: { pass: boolean, probes: { probe: string, counts: Record<string, number> }[] }
  /** repeat's mid-typing prefix ladder never drops to zero (other arms reported for contrast). */
  prefixLadder: { pass: boolean, words: { word: string, zeros: Record<string, string[]> }[] }
}

async function runSanityChecks (es: Client): Promise<SanityChecks> {
  const fields = ['title.text', 'description.text']
  const probes: SanityChecks['stemmedRecall']['probes'] = []
  let recallPass = true
  for (const probe of STEM_PROBES) {
    const counts: Record<string, number> = {}
    for (const { label, arm, analyzer } of PROBE_ARMS) {
      counts[label] = await countHits(es, indexName(arm), {
        simple_query_string: { query: probe, fields, default_operator: 'and', ...(analyzer ? { analyzer } : {}) }
      })
    }
    if (counts.repeat !== counts.dual || counts['repeat-frq'] !== counts.dual || counts.dual === 0) recallPass = false
    probes.push({ probe, counts })
  }

  const words: SanityChecks['prefixLadder']['words'] = []
  let ladderPass = true
  for (const word of PREFIX_LADDER_WORDS) {
    const zeros: Record<string, string[]> = {}
    for (const { label, arm, prefixSuffix, analyzer } of PROBE_ARMS) {
      zeros[label] = []
      for (let len = 2; len <= word.length; len++) {
        const typed = word.slice(0, len)
        const count = await countHits(es, indexName(arm), {
          simple_query_string: {
            query: `${typed}*`,
            fields: ['title', 'description'].map(k => k + prefixSuffix),
            ...(analyzer ? { analyzer } : {})
          }
        })
        if (count === 0) zeros[label].push(typed)
      }
    }
    if (zeros.repeat.length > 0 || zeros['repeat-frq'].length > 0) ladderPass = false
    words.push({ word, zeros })
  }
  return {
    stemmedRecall: { pass: recallPass, probes },
    prefixLadder: { pass: ladderPass, words }
  }
}

/** Token-stream evidence: what each analyzer actually emits for a few probe strings. */
async function analyzeProbes (es: Client): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const texts = ['logements sociaux', "l'agence publie les donnees", 'Équipements']
  for (const analyzer of ['custom_french', 'custom_french_repeat', 'standard']) {
    for (const text of texts) {
      const res: any = await es.indices.analyze({ index: indexName('repeat'), analyzer, text })
      out[`${analyzer} | ${text}`] = res.tokens.map((t: any) => `${t.token}@${t.position}`).join(' ')
    }
  }
  return out
}

/**
 * Share of token positions where `keyword_repeat` really emits two tokens (i.e. where stemming
 * changed the surface form) — the single number that predicts repeat's extra postings. Measured
 * on ES over a sample of the actual generated docs.
 */
async function measureRepeatFactor (es: Client, sampleDocs: TextDoc[]): Promise<{
  standardTokens: number,
  frenchTokens: number,
  repeatTokens: number,
  stopwordRemovalShare: number,
  doubledPositionShare: number
}> {
  let standardTokens = 0
  let frenchTokens = 0
  let repeatTokens = 0
  for (const doc of sampleDocs) {
    const text = `${doc.title} ${doc.description}`
    for (const [analyzer, add] of [
      ['standard', (n: number) => { standardTokens += n }],
      ['custom_french', (n: number) => { frenchTokens += n }],
      ['custom_french_repeat', (n: number) => { repeatTokens += n }]
    ] as const) {
      const res: any = await es.indices.analyze({ index: indexName('repeat'), analyzer, text })
      add(res.tokens.length)
    }
  }
  return {
    standardTokens,
    frenchTokens,
    repeatTokens,
    stopwordRemovalShare: standardTokens === 0 ? 0 : 1 - frenchTokens / standardTokens,
    doubledPositionShare: frenchTokens === 0 ? 0 : repeatTokens / frenchTokens - 1
  }
}

let setupPromise: Promise<ExperimentSetup> | undefined

/**
 * Build (idempotently) the three indexes and take every non-latency measurement. Memoized so the
 * three registered experiments share one build. Lifecycle follows the harness convention for
 * seeded indexes: they are KEPT and reused when they already hold the right doc count (see
 * `reindexWithShards`), so repeated runs are cheap; drop them with
 * `curl -XDELETE $ES/benchmark-text-analyzer-*` when done.
 */
async function setup (rowsOverride?: number): Promise<ExperimentSetup> {
  if (!setupPromise) setupPromise = buildAndMeasure(rowsOverride ?? DEFAULT_ROWS)
  return await setupPromise
}

async function buildAndMeasure (rows: number): Promise<ExperimentSetup> {
  const es = getEsClient()
  for (const arm of ARMS) {
    const index = indexName(arm)
    const exists = await es.indices.exists({ index })
    if (exists) {
      const count: any = await es.count({ index })
      if (count.count === rows) {
        console.log(`  [text-analyzer] ${index}: reusing existing index (${rows} docs)`)
        continue
      }
      console.log(`  [text-analyzer] ${index}: doc count ${count.count} != ${rows}, rebuilding`)
      await es.indices.delete({ index })
    }
    console.log(`  [text-analyzer] ${index}: building ${rows} docs`)
    const t0 = performance.now()
    await es.indices.create({ index, ...indexDefinition(arm) } as any)
    await bulkLoad(es, index, rows)
    await es.indices.refresh({ index })
    await es.indices.forcemerge({ index, max_num_segments: 1 })
    await es.indices.refresh({ index })
    console.log(`  [text-analyzer] ${index}: built + force-merged in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
  }

  const sizes: SizeMeasure[] = []
  for (const arm of ARMS) sizes.push(await measureSize(es, arm))
  const sanity = await runSanityChecks(es)
  const corpus = corpusStats(generateDocs(2000))
  const analysis = await analyzeProbes(es)
  const repeatFactor = await measureRepeatFactor(es, generateDocs(200))

  printSetupReport(sizes, sanity, corpus, repeatFactor, analysis)

  const indexes: Record<string, string> = {}
  for (const arm of ARMS) indexes[arm] = indexName(arm)
  // query-analyzer variants share the `repeat` index — only the query differs
  indexes['repeat-frq'] = indexName('repeat')
  return {
    rows,
    indexes,
    findings: { sizes, sanity, corpus, repeatFactor, analysis, repeatFilterOrder: REPEAT_FILTER_ORDER }
  }
}

/** Signed percentage change from `baseline` to `value` (same convention as reporter.pctDelta). */
export function pct (baseline: number, value: number): string {
  if (baseline === 0) return 'n/a'
  const v = ((value - baseline) / baseline) * 100
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`
}

export const mb = (bytes: number): string => (bytes / 1024 / 1024).toFixed(1).padStart(8)

function printSetupReport (
  sizes: SizeMeasure[],
  sanity: SanityChecks,
  corpus: ReturnType<typeof corpusStats>,
  repeatFactor: { standardTokens: number, frenchTokens: number, repeatTokens: number, stopwordRemovalShare: number, doubledPositionShare: number },
  analysis: Record<string, string>
): void {
  const dual = sizes.find(s => s.arm === 'dual')!
  const single = sizes.find(s => s.arm === 'single')!
  console.log('')
  console.log(`Corpus: ${corpus.sentences} French sentences, ${corpus.distinctWords.toLocaleString()} distinct words over a ${corpus.docs}-doc sample`)
  console.log(`  title ~${corpus.avgTitleWords.toFixed(1)} words, description ~${corpus.avgDescriptionWords.toFixed(1)} words`)
  console.log(`  stopword density ${(corpus.stopwordDensity * 100).toFixed(1)}% (surface), ${(repeatFactor.stopwordRemovalShare * 100).toFixed(1)}% removed by french_stop`)
  console.log(`  inflected-suffix share ${(corpus.inflectedSuffixShare * 100).toFixed(1)}%; keyword_repeat doubles ${(repeatFactor.doubledPositionShare * 100).toFixed(1)}% of surviving positions`)
  console.log('')
  console.log('Index size (1 shard, 1 segment)')
  console.log('-'.repeat(94))
  console.log('Arm'.padEnd(10) + '| store MB | Δ store  | analyzed MB | Δ analyzed | inverted MB | Δ inverted')
  console.log('-'.repeat(94))
  for (const s of sizes) {
    const isDual = s.arm === 'dual'
    console.log(
      s.arm.padEnd(10) +
      `| ${mb(s.storeBytes)} | ${(isDual ? '—' : pct(dual.storeBytes, s.storeBytes)).padStart(8)} ` +
      `| ${mb(s.analyzedBytes)}    | ${(isDual ? '—' : pct(dual.analyzedBytes, s.analyzedBytes)).padStart(10)} ` +
      `| ${mb(s.invertedIndexBytes)}    | ${(isDual ? '—' : pct(dual.invertedIndexBytes, s.invertedIndexBytes)).padStart(10)}`
    )
  }
  console.log('-'.repeat(94))
  const repeat = sizes.find(s => s.arm === 'repeat')!
  console.log(`  repeat vs single (the floor): store ${pct(single.storeBytes, repeat.storeBytes)}, analyzed ${pct(single.analyzedBytes, repeat.analyzedBytes)}`)
  console.log('')
  console.log(`SANITY stemmed recall (repeat == dual): ${sanity.stemmedRecall.pass ? 'PASS' : 'FAIL'}`)
  for (const p of sanity.stemmedRecall.probes) {
    const cells = Object.entries(p.counts).map(([label, n]) => `${label} ${n.toLocaleString()}`)
    console.log(`  "${p.probe}": ${cells.join(' | ')}`)
  }
  console.log(`SANITY prefix ladder (repeat never zero mid-word): ${sanity.prefixLadder.pass ? 'PASS' : 'FAIL'}`)
  for (const w of sanity.prefixLadder.words) {
    const cells = Object.entries(w.zeros).map(([label, zeros]) => `${label} ${zeros.length === 0 ? 'none' : zeros.join(',')}`)
    console.log(`  "${w.word}": zero-hit prefixes — ${cells.join(' | ')}`)
  }
  console.log('')
  for (const [key, tokens] of Object.entries(analysis)) console.log(`  _analyze ${key} -> ${tokens}`)
}

// ---------------------------------------------------------------------------------------------
// Registered experiments
// ---------------------------------------------------------------------------------------------

export const textAnalyzerExperiments: Experiment[] = [
  {
    name: 'text-analyzer:default-q',
    description: `default q "${Q_TERMS}" — dual's two SQS clauses vs the single-field collapse`,
    schema: TEXT_ANALYZER_SCHEMA,
    setup,
    baseline: {
      name: 'dual',
      description: 'bool/should of SQS over [*.text] + SQS over [*.text_standard]',
      body: ctx => defaultQ([textFields(ctx), standardFields(ctx)], Q_TERMS)
    },
    variants: [
      {
        name: 'single',
        description: 'one SQS over [*.text] (custom_french) — recall floor, no exact-form boost',
        body: ctx => defaultQ([textFields(ctx)], Q_TERMS)
      },
      {
        name: 'repeat',
        description: 'one SQS over [*.text] (custom_french_repeat) — clause collapse',
        body: ctx => defaultQ([textFields(ctx)], Q_TERMS)
      },
      {
        name: 'repeat-frq',
        description: 'repeat index, query analyzed with custom_french (one term per position)',
        body: ctx => defaultQ([textFields(ctx)], Q_TERMS, SEARCH_ANALYZER_OVERRIDE)
      }
    ]
  },
  {
    name: 'text-analyzer:prefix',
    description: `q_mode=complete startsWith "${TYPED_PREFIX}*" mid-typing prefix`,
    schema: TEXT_ANALYZER_SCHEMA,
    setup,
    baseline: {
      name: 'dual',
      description: 'prefix on [*.text_standard] — the field that exists for exactly this',
      body: ctx => startsWith(standardFields(ctx), TYPED_PREFIX)
    },
    variants: [
      {
        name: 'single',
        description: 'prefix on [*.text] (stemmed terms only — expected to under-match)',
        body: ctx => startsWith(textFields(ctx), TYPED_PREFIX)
      },
      {
        name: 'repeat',
        description: 'prefix on [*.text] (surface form present as a real term)',
        body: ctx => startsWith(textFields(ctx), TYPED_PREFIX)
      },
      {
        name: 'repeat-frq',
        description: 'repeat index, prefix query analyzed with custom_french',
        body: ctx => startsWith(textFields(ctx), TYPED_PREFIX, SEARCH_ANALYZER_OVERRIDE)
      }
    ]
  },
  {
    name: 'text-analyzer:phrase',
    description: `quoted phrase "${PHRASE}" — positions path on each analyzed view`,
    schema: TEXT_ANALYZER_SCHEMA,
    setup,
    baseline: {
      name: 'dual',
      description: 'phrase on [*.text] + [*.text_standard]',
      body: ctx => phrase([textFields(ctx), standardFields(ctx)], PHRASE)
    },
    variants: [
      {
        name: 'single',
        description: 'phrase on [*.text] (custom_french)',
        body: ctx => phrase([textFields(ctx)], PHRASE)
      },
      {
        name: 'repeat',
        description: 'phrase on [*.text] (custom_french_repeat — two terms per position)',
        body: ctx => phrase([textFields(ctx)], PHRASE)
      },
      {
        name: 'repeat-frq',
        description: 'repeat index, phrase query analyzed with custom_french',
        body: ctx => phrase([textFields(ctx)], PHRASE, SEARCH_ANALYZER_OVERRIDE)
      }
    ]
  }
]
