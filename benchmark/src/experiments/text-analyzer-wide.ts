import type { Client } from '@elastic/elasticsearch'
import type { Experiment, ExperimentSetup } from '../experiments.ts'
import type { SchemaContext, SchemaField } from '../generator.ts'
import { schemaContext } from '../generator.ts'
import { getEsClient } from '../es.ts'
import {
  ANALYSIS_SETTINGS_REPEAT, SEARCH_ANALYZER_OVERRIDE, waitForStableStore, mb, pct
} from './text-analyzer.ts'
import { wideDocIterator, generateWideDocs, wideCorpusStats, WIDE_COLUMNS } from './text-analyzer-corpus.ts'

// INVESTIGATIONS.md §14.b — does the clause-collapse win of the `custom_french_repeat` shape
// (§14) survive at realistic WIDE fanout? §14 measured 2 text columns; the repo owner has since
// picked the SIMPLE shape as the preferred candidate for the indexing rework — a single `.text`
// field per column, analyzed with `custom_french_repeat` for BOTH indexing and search, no
// `search_analyzer` override, no extra boost clause. At 2 columns that "naive" shape was +17% vs
// dual on the default query and +107% on a phrase (the doubled SynonymQuery/MultiPhraseQuery), and
// only the `repeat-frq` variant (query analyzed with plain `custom_french`) recovered dual's cost.
// Production `q` queries every text column at once though (buildQClauses' `fields` array is
// per-column, `api/src/datasets/es/operations.ts`), so the clause COUNT collapses from 2N fields
// (dual: N `.text` + N `.text_standard`) to N fields (repeat: N `.text`) as column count N grows —
// a saving §14's 2-column setup could not see. This experiment reruns §14's three production query
// shapes at N=40 columns (the `wide-text` preset's shape) to see whether that per-request fanout
// saving flips the naive shape's sign, plus the two follow-ups the repo owner asked for: the
// `_search` catch-all regime (where N-field fanout doesn't apply — the whole point of catch-all is
// a constant field count) and a mixed-fleet compat check for a rolling migration.
//
// Same conventions as text-analyzer.ts: verbatim analyzer settings (imported, not re-declared),
// same `waitForStableStore` flush-and-poll fix (forcemerge does not mean settled), same
// `request_cache: false` / `track_total_hits: true` production page-1 shape, same French sentence
// corpus (text-analyzer-corpus.ts) — spread here over 40 independently-generated columns instead of
// a title+description pair, 1-2 sentences per column (the `WIDE_COLUMNS` / `wideDocIterator` export
// added there for this file).
//
// Four physical index SHAPES, each 1 shard, force-merged to 1 segment:
//   dual            N × { text: custom_french, text_standard: standard }               (today)
//   dual-catchall   dual's per-column mapping + copy_to: _search on every column,
//                   _search: { text: custom_french, text_standard: standard }          (today, wide dataset)
//   repeat          N × { text: custom_french_repeat }                                  (candidate)
//   repeat-catchall repeat's per-column mapping + copy_to: _search on every column,
//                   _search: { text: custom_french_repeat }                             (candidate, wide dataset)
// `repeat`/`repeat-catchall` each serve TWO query-level arms (naive: field's own analyzer at query
// time too; -frq: query analyzed with plain custom_french) — same index, no rebuild needed.

// ---------------------------------------------------------------------------------------------
// Shapes
// ---------------------------------------------------------------------------------------------

export const SHAPES = ['dual', 'dual-catchall', 'repeat', 'repeat-catchall'] as const
export type Shape = typeof SHAPES[number]

export const NUM_COLS = WIDE_COLUMNS
export const DEFAULT_ROWS = 100_000
const INDEX_PREFIX = 'benchmark-text-analyzer-wide'

export function indexName (shape: Shape): string {
  return `${INDEX_PREFIX}-${shape}`
}

function colKey (i: number): string {
  return `col${i + 1}`
}

function dualColumnMapping (copyToSearch: boolean): Record<string, any> {
  return {
    type: 'keyword',
    ignore_above: 200,
    fields: {
      text: { type: 'text', analyzer: 'custom_french' },
      text_standard: { type: 'text', analyzer: 'standard' }
    },
    ...(copyToSearch ? { copy_to: '_search' } : {})
  }
}

function repeatColumnMapping (copyToSearch: boolean): Record<string, any> {
  return {
    type: 'keyword',
    ignore_above: 200,
    fields: { text: { type: 'text', analyzer: 'custom_french_repeat' } },
    ...(copyToSearch ? { copy_to: '_search' } : {})
  }
}

function indexDefinition (shape: Shape): Record<string, any> {
  const isCatchall = shape.endsWith('-catchall')
  const isDual = shape.startsWith('dual')
  const properties: Record<string, any> = { id: { type: 'keyword' } }
  for (let i = 0; i < NUM_COLS; i++) {
    properties[colKey(i)] = isDual ? dualColumnMapping(isCatchall) : repeatColumnMapping(isCatchall)
  }
  if (isCatchall) {
    // mirrors buildIndexMappings' `_search` field verbatim (operations.ts): dual's catch-all
    // keeps the platform-default analyzer + its own `.text_standard` view; repeat's catch-all is
    // ONE field, same candidate shape as the per-column mapping.
    properties._search = isDual
      ? { type: 'text', analyzer: 'custom_french', fields: { text_standard: { type: 'text', analyzer: 'standard' } } }
      : { type: 'text', analyzer: 'custom_french_repeat' }
  }
  return {
    settings: {
      number_of_shards: 1,
      number_of_replicas: 0,
      refresh_interval: '-1',
      // superset covers both custom_french and custom_french_repeat — same settings object §14 uses
      analysis: ANALYSIS_SETTINGS_REPEAT
    },
    mappings: { properties }
  }
}

/** The 40-column schema every query body is built against (shape-independent field NAMES). */
export const WIDE_SCHEMA: SchemaField[] = Array.from({ length: NUM_COLS }, (_, i) => ({
  key: colKey(i), type: 'string', 'x-capabilities': { text: true, textStandard: true, index: true }
}))

// ---------------------------------------------------------------------------------------------
// Query shapes (identical builders to text-analyzer.ts, field lists now span all 40 columns)
// ---------------------------------------------------------------------------------------------

const textFields = (ctx: SchemaContext): string[] => ctx.fullTextFields.map(k => `${k}.text`)
const standardFields = (ctx: SchemaContext): string[] => ctx.fullTextFields.map(k => `${k}.text_standard`)

const common = { size: 20, track_total_hits: true, request_cache: false }

/** default `q`: one SQS `should` clause per field GROUP passed in. */
function defaultQ (fields: string[][], query: string, analyzer?: string): Record<string, any> {
  const should = fields.map(f => ({ simple_query_string: { query, fields: f, ...(analyzer ? { analyzer } : {}) } }))
  return { query: { bool: { should, minimum_should_match: 1 } }, ...common }
}

function startsWith (fields: string[], typed: string, analyzer?: string): Record<string, any> {
  return { query: { simple_query_string: { query: `${typed}*`, fields, ...(analyzer ? { analyzer } : {}) } }, ...common }
}

function phrase (fields: string[][], quoted: string, analyzer?: string): Record<string, any> {
  const should = fields.map(f => ({ simple_query_string: { query: `"${quoted}"`, fields: f, ...(analyzer ? { analyzer } : {}) } }))
  return { query: { bool: { should, minimum_should_match: 1 } }, ...common }
}

// Three probe queries — different term sets / match-set sizes, so the top-20 ordering comparison
// (item 3) is not a single anecdote. All three are drawn from STEM_PROBES-adjacent vocabulary in
// text-analyzer-corpus.ts's SENTENCES so they have real hits at 40-column fanout.
export const PROBE_QUERIES = [
  { name: 'logements', terms: 'logements sociaux commune' },
  { name: 'associations', terms: 'associations sportives' },
  { name: 'equipements', terms: 'equipements sportifs communes' }
] as const

const TYPED_PREFIX = 'logem'
const PHRASE = 'sont publiees chaque annee'

// ---------------------------------------------------------------------------------------------
// Index build
// ---------------------------------------------------------------------------------------------

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
  // batch smaller than text-analyzer.ts's 5000: each doc here carries 40 columns instead of 2,
  // so a batch of equal doc count would be ~20x heavier
  for (const doc of wideDocIterator(rows)) {
    const flat: Record<string, any> = { id: doc.id }
    for (let i = 0; i < NUM_COLS; i++) flat[colKey(i)] = doc.cols[i]
    batch.push({ index: { _index: index, _id: doc.id } }, flat)
    if (++pending >= 1000) await flush()
  }
  await flush()
}

// ---------------------------------------------------------------------------------------------
// Size measurement — store + analyzed-portion _disk_usage, per shape
// ---------------------------------------------------------------------------------------------

export interface WideSizeMeasure {
  shape: Shape
  storeBytes: number
  segments: number
  docs: number
  /** `_disk_usage` total for the per-column analyzed sub-fields only (`col*.text[_standard]`). */
  analyzedBytes: number
  invertedIndexBytes: number
  /** `_disk_usage` for `_search`(`.text_standard`) — 0 on non-catchall shapes. */
  searchFieldBytes: number
}

async function measureSize (es: Client, shape: Shape): Promise<WideSizeMeasure> {
  const index = indexName(shape)
  await waitForStableStore(es, index)
  const stats: any = await es.indices.stats({ index, metric: 'store,docs,segments' })
  const primaries = stats._all.primaries
  const usage: any = await es.indices.diskUsage({ index, run_expensive_tasks: true })
  const fields = usage[index]?.fields ?? {}
  let analyzedBytes = 0
  let invertedIndexBytes = 0
  let searchFieldBytes = 0
  for (const [name, value] of Object.entries<any>(fields)) {
    if (/^col\d+\.(text|text_standard)$/.test(name)) {
      analyzedBytes += value.total_in_bytes
      invertedIndexBytes += value.inverted_index?.total_in_bytes ?? 0
    } else if (/^_search(\.text_standard)?$/.test(name)) {
      searchFieldBytes += value.total_in_bytes
    }
  }
  return {
    shape,
    storeBytes: primaries.store.size_in_bytes,
    segments: primaries.segments.count,
    docs: primaries.docs.count,
    analyzedBytes,
    invertedIndexBytes,
    searchFieldBytes
  }
}

// ---------------------------------------------------------------------------------------------
// Sanity checks — same two checks as text-analyzer.ts §14, run on the non-catchall shapes only
// (the catch-all regime's recall/prefix behavior is not the question here — its field COUNT is).
// ---------------------------------------------------------------------------------------------

async function countHits (es: Client, index: string, query: any): Promise<number> {
  const res: any = await es.count({ index, query })
  return res.count
}

const STEM_PROBES = ['logements', 'associations', 'communes']
const PREFIX_LADDER_WORDS = ['logements', 'equipements']

interface WideProbeArm { label: string, shape: Shape, prefixSuffix: '.text' | '.text_standard', analyzer?: string }
const WIDE_PROBE_ARMS: WideProbeArm[] = [
  { label: 'dual', shape: 'dual', prefixSuffix: '.text_standard' },
  { label: 'repeat', shape: 'repeat', prefixSuffix: '.text' },
  { label: 'repeat-frq', shape: 'repeat', prefixSuffix: '.text', analyzer: SEARCH_ANALYZER_OVERRIDE }
]

export interface WideSanityChecks {
  stemmedRecall: { pass: boolean, probes: { probe: string, counts: Record<string, number> }[] }
  prefixLadder: { pass: boolean, words: { word: string, zeros: Record<string, string[]> }[] }
}

async function runSanityChecks (es: Client, ctx: SchemaContext): Promise<WideSanityChecks> {
  const fields = textFields(ctx)
  const probes: WideSanityChecks['stemmedRecall']['probes'] = []
  let recallPass = true
  for (const probe of STEM_PROBES) {
    const counts: Record<string, number> = {}
    for (const { label, shape, analyzer } of WIDE_PROBE_ARMS) {
      counts[label] = await countHits(es, indexName(shape), {
        simple_query_string: { query: probe, fields, default_operator: 'and', ...(analyzer ? { analyzer } : {}) }
      })
    }
    if (counts.repeat !== counts.dual || counts['repeat-frq'] !== counts.dual || counts.dual === 0) recallPass = false
    probes.push({ probe, counts })
  }

  const words: WideSanityChecks['prefixLadder']['words'] = []
  let ladderPass = true
  for (const word of PREFIX_LADDER_WORDS) {
    const zeros: Record<string, string[]> = {}
    for (const { label, shape, prefixSuffix, analyzer } of WIDE_PROBE_ARMS) {
      zeros[label] = []
      for (let len = 2; len <= word.length; len++) {
        const typed = word.slice(0, len)
        const count = await countHits(es, indexName(shape), {
          simple_query_string: {
            query: `${typed}*`,
            fields: ctx.fullTextFields.map(k => k + prefixSuffix),
            ...(analyzer ? { analyzer } : {})
          }
        })
        if (count === 0) zeros[label].push(typed)
      }
    }
    if (zeros.repeat.length > 0 || zeros['repeat-frq'].length > 0) ladderPass = false
    words.push({ word, zeros })
  }
  return { stemmedRecall: { pass: recallPass, probes }, prefixLadder: { pass: ladderPass, words } }
}

// ---------------------------------------------------------------------------------------------
// Top-20 ordering comparison (item 3) — dual as reference, per probe query.
// ---------------------------------------------------------------------------------------------

export interface TopKComparison {
  probe: string
  dual: string[]
  repeat: string[]
  repeatFrq: string[]
  /** exact array equality vs dual */
  repeatSameOrder: boolean
  repeatFrqSameOrder: boolean
  /** same 20 ids, any order */
  repeatSameSet: boolean
  repeatFrqSameSet: boolean
  /** ids present in repeat's top-20 but absent from dual's (naive's intrinsic-boost candidates) */
  repeatOnly: string[]
  dualOnly: string[]
}

async function top20 (es: Client, index: string, query: any): Promise<string[]> {
  const res: any = await es.search({ index, query, size: 20, track_total_hits: false })
  return res.hits.hits.map((h: any) => h._id)
}

async function compareTopK (es: Client, ctx: SchemaContext): Promise<TopKComparison[]> {
  const out: TopKComparison[] = []
  for (const { name, terms } of PROBE_QUERIES) {
    const dualBody = {
      bool: {
        should: [
          { simple_query_string: { query: terms, fields: textFields(ctx) } },
          { simple_query_string: { query: terms, fields: standardFields(ctx) } }
        ],
        minimum_should_match: 1
      }
    }
    const repeatBody = { simple_query_string: { query: terms, fields: textFields(ctx) } }
    const repeatFrqBody = { simple_query_string: { query: terms, fields: textFields(ctx), analyzer: SEARCH_ANALYZER_OVERRIDE } }
    const dual = await top20(es, indexName('dual'), dualBody)
    const repeat = await top20(es, indexName('repeat'), repeatBody)
    const repeatFrq = await top20(es, indexName('repeat'), repeatFrqBody)
    const dualSet = new Set(dual)
    const repeatSet = new Set(repeat)
    out.push({
      probe: name,
      dual,
      repeat,
      repeatFrq,
      repeatSameOrder: JSON.stringify(dual) === JSON.stringify(repeat),
      repeatFrqSameOrder: JSON.stringify(dual) === JSON.stringify(repeatFrq),
      repeatSameSet: dual.length === repeat.length && [...dualSet].every(id => repeatSet.has(id)),
      repeatFrqSameSet: dual.length === repeatFrq.length && [...dualSet].every(id => new Set(repeatFrq).has(id)),
      repeatOnly: repeat.filter(id => !dualSet.has(id)),
      dualOnly: dual.filter(id => !repeatSet.has(id))
    })
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Mixed-fleet union check (item 4) — one multi-index search spanning a dual-shaped index and a
// repeat-shaped index, union field list. Cheap: single search + per-index validate/explain.
// ---------------------------------------------------------------------------------------------

export interface UnionCheck {
  shardsTotal: number
  shardsFailed: number
  shardFailures: any[]
  totalHits: number
  /** hit count per source index, from the merged response. */
  hitsByIndex: Record<string, number>
  /** es.indices.validateQuery(explain) per index — confirms the query rewrites cleanly against
   *  each index's own mapping (dual resolves `*.text_standard` for real, repeat has none to
   *  resolve — neither should error or silently degrade the other side). */
  perIndexValidation: Record<string, { valid: boolean, explanation?: string }>
}

async function runUnionCheck (es: Client): Promise<UnionCheck> {
  const query = { simple_query_string: { query: 'logements sociaux', fields: ['*.text', '*.text_standard'] } }
  const dualIdx = indexName('dual')
  const repeatIdx = indexName('repeat')
  const res: any = await es.search({ index: [dualIdx, repeatIdx], query, size: 20, track_total_hits: true })
  const hitsByIndex: Record<string, number> = {}
  for (const h of res.hits.hits) hitsByIndex[h._index] = (hitsByIndex[h._index] ?? 0) + 1

  const perIndexValidation: UnionCheck['perIndexValidation'] = {}
  for (const idx of [dualIdx, repeatIdx]) {
    const v: any = await es.indices.validateQuery({ index: idx, query, explain: true, rewrite: true })
    perIndexValidation[idx] = {
      valid: v.valid,
      explanation: v.explanations?.[0]?.explanation
    }
  }
  return {
    shardsTotal: res._shards.total,
    shardsFailed: res._shards.failed,
    shardFailures: res._shards.failures ?? [],
    totalHits: res.hits.total.value,
    hitsByIndex,
    perIndexValidation
  }
}

// ---------------------------------------------------------------------------------------------
// Setup — build the 4 indexes, take every non-latency measurement, memoized like text-analyzer.ts
// ---------------------------------------------------------------------------------------------

let setupPromise: Promise<ExperimentSetup> | undefined

async function setup (rowsOverride?: number): Promise<ExperimentSetup> {
  if (!setupPromise) setupPromise = buildAndMeasure(rowsOverride ?? DEFAULT_ROWS)
  return await setupPromise
}

async function buildAndMeasure (rows: number): Promise<ExperimentSetup> {
  const es = getEsClient()
  for (const shape of SHAPES) {
    const index = indexName(shape)
    const exists = await es.indices.exists({ index })
    if (exists) {
      const count: any = await es.count({ index })
      if (count.count === rows) {
        console.log(`  [text-analyzer-wide] ${index}: reusing existing index (${rows} docs)`)
        continue
      }
      console.log(`  [text-analyzer-wide] ${index}: doc count ${count.count} != ${rows}, rebuilding`)
      await es.indices.delete({ index })
    }
    console.log(`  [text-analyzer-wide] ${index}: building ${rows} docs × ${NUM_COLS} columns`)
    const t0 = performance.now()
    await es.indices.create({ index, ...indexDefinition(shape) } as any)
    await bulkLoad(es, index, rows)
    await es.indices.refresh({ index })
    await es.indices.forcemerge({ index, max_num_segments: 1 })
    await es.indices.refresh({ index })
    console.log(`  [text-analyzer-wide] ${index}: built + force-merged in ${((performance.now() - t0) / 1000).toFixed(1)}s`)
  }

  const ctx = schemaContext(WIDE_SCHEMA)

  const sizes: WideSizeMeasure[] = []
  for (const shape of SHAPES) sizes.push(await measureSize(es, shape))
  const sanity = await runSanityChecks(es, ctx)
  const topKComparison = await compareTopK(es, ctx)
  const unionCheck = await runUnionCheck(es)
  const corpus = wideCorpusStats(generateWideDocs(2000))

  printSetupReport(sizes, sanity, topKComparison, unionCheck, corpus)

  const indexes: Record<string, string> = {
    dual: indexName('dual'),
    repeat: indexName('repeat'),
    'repeat-frq': indexName('repeat'),
    'dual-catchall': indexName('dual-catchall'),
    'repeat-catchall': indexName('repeat-catchall'),
    'repeat-catchall-frq': indexName('repeat-catchall')
  }
  return {
    rows,
    indexes,
    findings: { sizes, sanity, topKComparison, unionCheck, corpus }
  }
}

function printSetupReport (
  sizes: WideSizeMeasure[],
  sanity: WideSanityChecks,
  topKComparison: TopKComparison[],
  unionCheck: UnionCheck,
  corpus: ReturnType<typeof wideCorpusStats>
): void {
  const dual = sizes.find(s => s.shape === 'dual')!
  console.log('')
  console.log(`Wide corpus: ${corpus.numCols} columns, ~${corpus.avgWordsPerCol.toFixed(1)} words/col, ${corpus.docs} sample docs`)
  console.log(`  stopword density ${(corpus.stopwordDensity * 100).toFixed(1)}%, inflected-suffix share ${(corpus.inflectedSuffixShare * 100).toFixed(1)}%, ${corpus.distinctWords.toLocaleString()} distinct words`)
  console.log('')
  console.log('Index size (1 shard, 1 segment, 40 columns)')
  console.log('-'.repeat(100))
  console.log('Shape'.padEnd(16) + '| store MB | Δ store  | analyzed MB | Δ analyzed | inverted MB | search MB')
  console.log('-'.repeat(100))
  for (const s of sizes) {
    const isDual = s.shape === 'dual'
    console.log(
      s.shape.padEnd(16) +
      `| ${mb(s.storeBytes)} | ${(isDual ? '—' : pct(dual.storeBytes, s.storeBytes)).padStart(8)} ` +
      `| ${mb(s.analyzedBytes)}    | ${(isDual ? '—' : pct(dual.analyzedBytes, s.analyzedBytes)).padStart(10)} ` +
      `| ${mb(s.invertedIndexBytes)}    | ${mb(s.searchFieldBytes)}`
    )
  }
  console.log('-'.repeat(100))
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
  console.log('Top-20 ordering vs dual (reference):')
  for (const c of topKComparison) {
    console.log(`  "${c.probe}": repeat ${c.repeatSameOrder ? 'IDENTICAL order' : (c.repeatSameSet ? 'same set, reordered' : `DIFFERS (+${c.repeatOnly.length}/-${c.dualOnly.length})`)}` +
      ` | repeat-frq ${c.repeatFrqSameOrder ? 'IDENTICAL order' : (c.repeatFrqSameSet ? 'same set, reordered' : 'DIFFERS')}`)
  }
  console.log('')
  console.log(`Mixed-fleet union check: _shards.failed=${unionCheck.shardsFailed}/${unionCheck.shardsTotal}, totalHits=${unionCheck.totalHits}, hitsByIndex=${JSON.stringify(unionCheck.hitsByIndex)}`)
  for (const [idx, v] of Object.entries(unionCheck.perIndexValidation)) {
    console.log(`  validate[${idx}]: valid=${v.valid}`)
  }
}

// ---------------------------------------------------------------------------------------------
// Registered experiments
// ---------------------------------------------------------------------------------------------

function defaultQExperiment (probeName: string, terms: string): Experiment {
  return {
    name: `text-analyzer:wide-fanout:default-q-${probeName}`,
    description: `default q "${terms}" over all ${NUM_COLS} columns — dual's two 40-field SQS clauses vs the single-field collapse`,
    schema: WIDE_SCHEMA,
    setup,
    baseline: {
      name: 'dual',
      description: `bool/should of SQS over [*.text] (${NUM_COLS} fields) + SQS over [*.text_standard] (${NUM_COLS} fields)`,
      body: ctx => defaultQ([textFields(ctx), standardFields(ctx)], terms)
    },
    variants: [
      {
        name: 'repeat',
        description: `one SQS over [*.text] (custom_french_repeat, ${NUM_COLS} fields) — clause collapse, naive query analysis`,
        body: ctx => defaultQ([textFields(ctx)], terms)
      },
      {
        name: 'repeat-frq',
        description: 'repeat index, query analyzed with custom_french (one term per position)',
        body: ctx => defaultQ([textFields(ctx)], terms, SEARCH_ANALYZER_OVERRIDE)
      }
    ]
  }
}

const catchallExperiment: Experiment = {
  name: 'text-analyzer:wide-fanout:catchall',
  description: 'default q via the _search catch-all — constant field count regardless of column count',
  schema: WIDE_SCHEMA,
  setup,
  baseline: {
    name: 'dual-catchall',
    description: 'bool/should of SQS over [_search] + SQS over [_search.text_standard]',
    body: () => defaultQ([['_search'], ['_search.text_standard']], PROBE_QUERIES[0].terms)
  },
  variants: [
    {
      name: 'repeat-catchall',
      description: 'one SQS over [_search] (custom_french_repeat) — naive query analysis',
      body: () => defaultQ([['_search']], PROBE_QUERIES[0].terms)
    },
    {
      name: 'repeat-catchall-frq',
      description: 'repeat-catchall index, query analyzed with custom_french',
      body: () => defaultQ([['_search']], PROBE_QUERIES[0].terms, SEARCH_ANALYZER_OVERRIDE)
    }
  ]
}

const phraseExperiment: Experiment = {
  name: 'text-analyzer:wide-fanout:phrase',
  description: `quoted phrase "${PHRASE}" over all ${NUM_COLS} columns — positions path on each analyzed view`,
  schema: WIDE_SCHEMA,
  setup,
  baseline: {
    name: 'dual',
    description: 'phrase on [*.text] + [*.text_standard]',
    body: ctx => phrase([textFields(ctx), standardFields(ctx)], PHRASE)
  },
  variants: [
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

const prefixExperiment: Experiment = {
  name: 'text-analyzer:wide-fanout:prefix',
  description: `q_mode=complete startsWith "${TYPED_PREFIX}*" over all ${NUM_COLS} columns — mid-typing prefix`,
  schema: WIDE_SCHEMA,
  setup,
  baseline: {
    name: 'dual',
    description: 'prefix on [*.text_standard]',
    body: ctx => startsWith(standardFields(ctx), TYPED_PREFIX)
  },
  variants: [
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
}

export const textAnalyzerWideExperiments: Experiment[] = [
  ...PROBE_QUERIES.map(p => defaultQExperiment(p.name, p.terms)),
  catchallExperiment,
  phraseExperiment,
  prefixExperiment
]
