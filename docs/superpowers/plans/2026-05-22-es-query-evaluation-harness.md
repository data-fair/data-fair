# ES Query Evaluation Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the `benchmark/` package into an A/B evaluation harness that measures per-query Elasticsearch cost on large, realistically-shaped datasets.

**Architecture:** A multi-command CLI (`seed` / `experiment` / `query` / `throughput`). A parametric generator produces data-fair schemas carrying explicit `x-capabilities`, seeded into the local docker ES *via data-fair* so the mapping is real. The `experiment` command runs hand-authored raw-ES query variants (baseline vs. variants) N times serially, captures `took` / `hits.total` / `_profile` / bytes, and prints A/B comparison tables. No production-code changes.

**Tech Stack:** TypeScript run via `node --experimental-strip-types` (Node 24), `@elastic/elasticsearch` v8, `autocannon` (existing throughput mode), `node:test` for pure-unit tests.

**Reference:** `docs/superpowers/specs/2026-05-22-es-query-evaluation-harness-design.md` (the spec) and `benchmark/INVESTIGATIONS.md` (the follow-up backlog).

---

## File Structure

```
benchmark/src/
  index.ts          CLI dispatch + seed/experiment/query command glue   (rewrite)
  setup.ts          data-fair auth/connection                            (rewrite, slimmed)
  es.ts             raw ES client → local docker ES                      NEW
  generator.ts      parametric schema + row generator                    NEW (replaces seed.ts)
  presets.ts        named dataset specs                                  NEW
  seeder.ts         idempotent seeding via data-fair                     NEW
  metrics.ts        metric aggregation (median/min/max/mean/stddev)      NEW
  runner.ts         per-query runner: N runs → metrics, profile          NEW
  experiments.ts    experiment registry + selection                     NEW
  experiments/
    track-total-hits.ts   track_total_hits / block-max-WAND variants     NEW
    search-catchall.ts    _search catch-all variants                     NEW
    min-should-match.ts   minimum_should_match variants                  NEW
  throughput.ts     autocannon throughput mode                           NEW (extracted from index.ts)
  scenarios.ts      throughput scenarios                                 (rewrite — new dataset ids)
  reporter.ts       console tables + JSON persistence                    (rewrite — adds A/B report)
  seed.ts           DELETED (superseded by generator.ts)
  csv-serialize/    UNTOUCHED (unrelated existing benchmark)
benchmark/package.json   adds @elastic/elasticsearch + test script
benchmark/README.md      rewritten for the new commands
```

Test files live next to their module as `benchmark/src/*.test.ts`, run with `node --test`.

---

## Task 1: Benchmark package setup

**Files:**
- Modify: `benchmark/package.json`

- [ ] **Step 1: Add the ES client dependency and a test script**

Replace the entire contents of `benchmark/package.json` with:

```json
{
  "name": "@data-fair/data-fair-benchmark",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "benchmark": "node --experimental-strip-types --disable-warning=ExperimentalWarning src/index.ts",
    "benchmark-csv": "node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning src/csv-serialize/bench.ts",
    "test": "node --test --experimental-strip-types --disable-warning=ExperimentalWarning 'src/**/*.test.ts'"
  },
  "dependencies": {
    "@elastic/elasticsearch": "^8.17.1",
    "@fast-csv/format": "^4.3.5",
    "autocannon": "^8.0.0",
    "csv-stringify": "^6.5.2"
  },
  "devDependencies": {
    "@types/autocannon": "^7.12.0"
  }
}
```

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: completes without error; `@elastic/elasticsearch` resolves (it is already a transitive dep of `api`, so this just dedupes).

- [ ] **Step 3: Verify the test script runs with zero tests**

Run: `npm -w benchmark test`
Expected: exits 0 with `tests 0` (no test files exist yet — node's test runner reports zero passing).

- [ ] **Step 4: Commit**

```bash
git add benchmark/package.json package-lock.json
git commit -m "chore(benchmark): add ES client dep and test script"
```

---

## Task 2: Generator — types, capabilities, schema generation

**Files:**
- Create: `benchmark/src/generator.ts`
- Test: `benchmark/src/generator.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmark/src/generator.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { generateSchema, capabilityPresets, type DatasetSpec } from './generator.ts'

const spec: DatasetSpec = {
  id: 'bench-test',
  rows: 10,
  columns: [
    { type: 'string', count: 2, capabilities: capabilityPresets.fullText },
    { type: 'string', count: 1, capabilities: capabilityPresets.keywordOnly },
    { type: 'integer', count: 1 },
    { type: 'date', count: 1 }
  ],
  geo: true
}

test('generateSchema names fields by capability and type', () => {
  const schema = generateSchema(spec)
  assert.deepEqual(schema.map(f => f.key), ['text1', 'text2', 'kw1', 'int1', 'date1', 'lat', 'lon'])
})

test('generateSchema sets data-fair types and date format', () => {
  const schema = generateSchema(spec)
  const byKey = Object.fromEntries(schema.map(f => [f.key, f]))
  assert.equal(byKey.text1.type, 'string')
  assert.equal(byKey.int1.type, 'integer')
  assert.equal(byKey.date1.type, 'string')
  assert.equal(byKey.date1.format, 'date')
})

test('generateSchema attaches x-capabilities and geo refersTo', () => {
  const schema = generateSchema(spec)
  const byKey = Object.fromEntries(schema.map(f => [f.key, f]))
  assert.equal(byKey.kw1['x-capabilities']?.text, false)
  assert.equal(byKey.text1['x-capabilities']?.text, true)
  assert.equal(byKey.lat['x-refersTo'], 'http://schema.org/latitude')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/generator.test.ts`
Expected: FAIL — `Cannot find module './generator.ts'`.

- [ ] **Step 3: Write the implementation**

Create `benchmark/src/generator.ts`:

```ts
// Deterministic schema + data generation for benchmark datasets.

/** Seeded PRNG (mulberry32) — deterministic across runs. */
export function mulberry32 (seed: number): () => number {
  return function () {
    let t = seed += 0x6D2B79F5
    t = Math.imul(t ^ t >>> 15, t | 1)
    t ^= t + Math.imul(t ^ t >>> 7, t | 61)
    return ((t ^ t >>> 14) >>> 0) / 4294967296
  }
}

/** Per-column x-capabilities (subset relevant to the harness; see api/contract/capabilities.js). */
export type Capabilities = Partial<{
  text: boolean
  textStandard: boolean
  index: boolean
  values: boolean
  textAgg: boolean
  wildcard: boolean
}>

/** Named capability presets — keep DatasetSpec readable. */
export const capabilityPresets = {
  fullText: { text: true, textStandard: true, index: true, values: true },
  searchOnly: { text: true, textStandard: true, index: false, values: false },
  keywordOnly: { text: false, textStandard: false, index: true, values: true }
} satisfies Record<string, Capabilities>

export type ColumnType = 'string' | 'integer' | 'number' | 'date' | 'boolean'

export interface ColumnGroup {
  type: ColumnType
  count: number
  capabilities?: Capabilities
  cardinality?: 'low' | 'high'
}

export interface DatasetSpec {
  id: string
  columns: ColumnGroup[]
  geo?: boolean
  rows: number
  shards?: number
  seed?: number
}

/** A data-fair schema property. */
export interface SchemaField {
  key: string
  type: string
  format?: string
  'x-capabilities'?: Capabilities
  'x-refersTo'?: string
}

export type Row = Record<string, unknown>

interface GeneratedColumn {
  field: SchemaField
  type: ColumnType
  cardinality: 'low' | 'high'
  analyzed: boolean
}

const KEY_PREFIX: Record<ColumnType, string> = {
  string: 'text', integer: 'int', number: 'num', date: 'date', boolean: 'bool'
}

/** A string column gets analyzed sub-fields unless both text capabilities are off. */
function isAnalyzed (caps?: Capabilities): boolean {
  return (caps?.text ?? true) || (caps?.textStandard ?? true)
}

/** Map a column type to its data-fair JSON-schema type. */
function dfType (type: ColumnType): string {
  return type === 'date' ? 'string' : type
}

/** Expand a DatasetSpec into concrete columns with generation metadata. */
function generateColumns (spec: DatasetSpec): GeneratedColumn[] {
  const cols: GeneratedColumn[] = []
  const counters: Record<string, number> = {}
  for (const group of spec.columns) {
    const analyzed = group.type === 'string' ? isAnalyzed(group.capabilities) : false
    const cardinality = group.cardinality ?? 'high'
    for (let i = 0; i < group.count; i++) {
      const prefix = group.type === 'string'
        ? (analyzed ? 'text' : 'kw')
        : KEY_PREFIX[group.type]
      counters[prefix] = (counters[prefix] ?? 0) + 1
      const field: SchemaField = { key: `${prefix}${counters[prefix]}`, type: dfType(group.type) }
      if (group.type === 'date') field.format = 'date'
      if (group.capabilities) field['x-capabilities'] = { ...group.capabilities }
      cols.push({ field, type: group.type, cardinality, analyzed })
    }
  }
  if (spec.geo) {
    cols.push({ field: { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' }, type: 'number', cardinality: 'high', analyzed: false })
    cols.push({ field: { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }, type: 'number', cardinality: 'high', analyzed: false })
  }
  return cols
}

/** Produce the data-fair schema for a spec. */
export function generateSchema (spec: DatasetSpec): SchemaField[] {
  return generateColumns(spec).map(c => c.field)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/generator.test.ts`
Expected: PASS — 3 tests passing.

- [ ] **Step 5: Lint**

Run: `npx eslint benchmark/src/generator.ts benchmark/src/generator.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add benchmark/src/generator.ts benchmark/src/generator.test.ts
git commit -m "feat(benchmark): generator schema + x-capabilities"
```

---

## Task 3: Generator — row generation & schema context

**Files:**
- Modify: `benchmark/src/generator.ts` (append)
- Modify: `benchmark/src/generator.test.ts` (append)

- [ ] **Step 1: Write the failing test**

Append to `benchmark/src/generator.test.ts`:

```ts
import { generateRows, rowIterator, schemaContext, analyzedSubfields } from './generator.ts'

test('generateRows is deterministic for a fixed seed', () => {
  const a = generateRows(spec, 5)
  const b = generateRows(spec, 5)
  assert.deepEqual(a, b)
  assert.equal(a.length, 5)
})

test('generated rows carry every schema field plus _id', () => {
  const [row] = generateRows(spec, 1)
  assert.equal(row._id, 'row-0')
  for (const key of ['text1', 'text2', 'kw1', 'int1', 'date1', 'lat', 'lon']) {
    assert.ok(key in row, `missing ${key}`)
  }
  assert.equal(typeof row.int1, 'number')
})

test('rowIterator yields the same rows as generateRows', () => {
  assert.deepEqual([...rowIterator(spec, 3)], generateRows(spec, 3))
})

test('schemaContext groups fields by capability', () => {
  const ctx = schemaContext(generateSchema(spec))
  assert.deepEqual(ctx.fullTextFields, ['text1', 'text2'])
  assert.deepEqual(ctx.keywordFields, ['kw1'])
  assert.deepEqual(ctx.numberFields, ['int1'])
  assert.deepEqual(ctx.dateFields, ['date1'])
  assert.deepEqual(ctx.geoFields, ['lat', 'lon'])
})

test('analyzedSubfields reflects capabilities', () => {
  const schema = generateSchema(spec)
  const text1 = schema.find(f => f.key === 'text1')!
  const kw1 = schema.find(f => f.key === 'kw1')!
  assert.deepEqual(analyzedSubfields(text1), ['text', 'text_standard'])
  assert.deepEqual(analyzedSubfields(kw1), [])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/generator.test.ts`
Expected: FAIL — `generateRows` / `rowIterator` / `schemaContext` / `analyzedSubfields` are not exported.

- [ ] **Step 3: Write the implementation**

Append to `benchmark/src/generator.ts`:

```ts
const WORDS = [
  'données', 'analyse', 'résultat', 'population', 'commune', 'département', 'région',
  'emploi', 'transport', 'énergie', 'budget', 'école', 'santé', 'environnement',
  'agriculture', 'industrie', 'commerce', 'tourisme', 'culture', 'logement',
  'mobilité', 'climat', 'territoire', 'service', 'projet', 'infrastructure'
]

const CATEGORIES = [
  'cat-alpha', 'cat-beta', 'cat-gamma', 'cat-delta', 'cat-epsilon',
  'cat-zeta', 'cat-eta', 'cat-theta', 'cat-iota', 'cat-kappa'
]

/** Generate a single value for a column. */
function generateValue (col: GeneratedColumn, rand: () => number): unknown {
  switch (col.type) {
    case 'string':
      if (col.analyzed) {
        const n = 3 + Math.floor(rand() * 4)
        const words: string[] = []
        for (let k = 0; k < n; k++) words.push(WORDS[Math.floor(rand() * WORDS.length)])
        return words.join(' ')
      }
      return col.cardinality === 'low'
        ? CATEGORIES[Math.floor(rand() * CATEGORIES.length)]
        : `code-${Math.floor(rand() * 1_000_000)}`
    case 'integer':
      return col.cardinality === 'low' ? Math.floor(rand() * 10) : Math.floor(rand() * 1_000_000)
    case 'number':
      if (col.field.key === 'lat') return 41 + rand() * 10
      if (col.field.key === 'lon') return -5 + rand() * 15
      return Math.round(rand() * 1_000_000) / 100
    case 'date': {
      const y = 2018 + Math.floor(rand() * 7)
      const m = String(1 + Math.floor(rand() * 12)).padStart(2, '0')
      const d = String(1 + Math.floor(rand() * 28)).padStart(2, '0')
      return `${y}-${m}-${d}`
    }
    case 'boolean':
      return rand() < 0.5
  }
}

/** Lazily yield generated rows — used by the seeder to avoid holding millions of rows in memory. */
export function * rowIterator (spec: DatasetSpec, count = spec.rows): Generator<Row> {
  const columns = generateColumns(spec)
  const rand = mulberry32(spec.seed ?? 42)
  for (let i = 0; i < count; i++) {
    const row: Row = { _id: `row-${i}` }
    for (const col of columns) row[col.field.key] = generateValue(col, rand)
    yield row
  }
}

/** Eagerly generate rows (for tests / small datasets). */
export function generateRows (spec: DatasetSpec, count = spec.rows): Row[] {
  return [...rowIterator(spec, count)]
}

export interface SchemaContext {
  fields: SchemaField[]
  fullTextFields: string[]
  keywordFields: string[]
  numberFields: string[]
  dateFields: string[]
  booleanFields: string[]
  geoFields: string[]
}

/** The analyzed inner sub-fields a string column exposes (`.text`, `.text_standard`). */
export function analyzedSubfields (field: SchemaField): string[] {
  if (field.type !== 'string' || field.format) return []
  const caps = field['x-capabilities']
  const subs: string[] = []
  if (caps?.text ?? true) subs.push('text')
  if (caps?.textStandard ?? true) subs.push('text_standard')
  return subs
}

/** Derive field groupings from a generated schema, for use in experiment query bodies. */
export function schemaContext (schema: SchemaField[]): SchemaContext {
  const ctx: SchemaContext = {
    fields: schema, fullTextFields: [], keywordFields: [],
    numberFields: [], dateFields: [], booleanFields: [], geoFields: []
  }
  for (const f of schema) {
    const refersTo = f['x-refersTo'] ?? ''
    if (refersTo.includes('latitude') || refersTo.includes('longitude')) { ctx.geoFields.push(f.key); continue }
    if (f.type === 'boolean') ctx.booleanFields.push(f.key)
    else if (f.type === 'integer' || f.type === 'number') ctx.numberFields.push(f.key)
    else if (f.type === 'string' && f.format === 'date') ctx.dateFields.push(f.key)
    else if (f.type === 'string') {
      if (isAnalyzed(f['x-capabilities'])) ctx.fullTextFields.push(f.key)
      else ctx.keywordFields.push(f.key)
    }
  }
  return ctx
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/generator.test.ts`
Expected: PASS — 8 tests passing.

- [ ] **Step 5: Lint**

Run: `npx eslint benchmark/src/generator.ts benchmark/src/generator.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add benchmark/src/generator.ts benchmark/src/generator.test.ts
git commit -m "feat(benchmark): row generation + schema context"
```

---

## Task 4: Dataset presets

**Files:**
- Create: `benchmark/src/presets.ts`
- Test: `benchmark/src/presets.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmark/src/presets.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { presets, getPreset } from './presets.ts'
import { generateSchema, analyzedSubfields } from './generator.ts'

test('all four presets exist with fixed ids', () => {
  assert.deepEqual(Object.keys(presets).sort(), ['mixed', 'small', 'tall', 'wide-text'])
  assert.equal(presets.tall.id, 'bench-tall')
})

test('wide-text crosses the _search catch-all threshold (>= 30 analyzed sub-fields)', () => {
  const schema = generateSchema(getPreset('wide-text'))
  const analyzed = schema.reduce((n, f) => n + analyzedSubfields(f).length, 0)
  assert.ok(analyzed >= 30, `expected >= 30 analyzed sub-fields, got ${analyzed}`)
})

test('getPreset returns an independent clone', () => {
  const a = getPreset('small')
  a.rows = 999
  assert.notEqual(getPreset('small').rows, 999)
})

test('getPreset throws on an unknown name', () => {
  assert.throws(() => getPreset('nope'), /unknown preset/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/presets.test.ts`
Expected: FAIL — `Cannot find module './presets.ts'`.

- [ ] **Step 3: Write the implementation**

Create `benchmark/src/presets.ts`:

```ts
import { capabilityPresets, type DatasetSpec } from './generator.ts'

/** Named dataset specs. Row counts are conservative defaults — override with --rows. */
export const presets: Record<string, DatasetSpec> = {
  small: {
    id: 'bench-small',
    rows: 1000,
    columns: [
      { type: 'string', count: 2, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 1, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 1 },
      { type: 'number', count: 1 },
      { type: 'date', count: 1 }
    ],
    geo: true
  },
  tall: {
    id: 'bench-tall',
    rows: 2_000_000,
    columns: [
      { type: 'string', count: 1, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 1, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 2 },
      { type: 'date', count: 1 }
    ]
  },
  'wide-text': {
    id: 'bench-wide-text',
    rows: 300_000,
    columns: [
      { type: 'string', count: 40, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 10, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 3 },
      { type: 'date', count: 1 }
    ]
  },
  mixed: {
    id: 'bench-mixed',
    rows: 500_000,
    columns: [
      { type: 'string', count: 8, capabilities: capabilityPresets.fullText },
      { type: 'string', count: 4, capabilities: capabilityPresets.searchOnly },
      { type: 'string', count: 6, capabilities: capabilityPresets.keywordOnly, cardinality: 'low' },
      { type: 'integer', count: 5 },
      { type: 'number', count: 4 },
      { type: 'date', count: 2 },
      { type: 'boolean', count: 2 }
    ],
    geo: true
  }
}

/** Look up a preset by name, returning an independent clone (safe to mutate). */
export function getPreset (name: string): DatasetSpec {
  const preset = presets[name]
  if (!preset) throw new Error(`unknown preset "${name}" — available: ${Object.keys(presets).join(', ')}`)
  return structuredClone(preset)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/presets.test.ts`
Expected: PASS — 4 tests passing. (`wide-text` has 40 `fullText` columns × 2 sub-fields = 80 ≥ 30.)

- [ ] **Step 5: Lint**

Run: `npx eslint benchmark/src/presets.ts benchmark/src/presets.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add benchmark/src/presets.ts benchmark/src/presets.test.ts
git commit -m "feat(benchmark): named dataset presets"
```

---

## Task 5: Metrics aggregation

**Files:**
- Create: `benchmark/src/metrics.ts`
- Test: `benchmark/src/metrics.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmark/src/metrics.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregate } from './metrics.ts'

test('aggregate computes stats for an even-length sample', () => {
  const a = aggregate([4, 1, 3, 2])
  assert.equal(a.min, 1)
  assert.equal(a.max, 4)
  assert.equal(a.median, 2.5)
  assert.equal(a.mean, 2.5)
})

test('aggregate computes the median for an odd-length sample', () => {
  assert.equal(aggregate([5, 1, 3]).median, 3)
})

test('aggregate of a single sample has zero stddev', () => {
  const a = aggregate([7])
  assert.equal(a.median, 7)
  assert.equal(a.stddev, 0)
})

test('aggregate throws on empty input', () => {
  assert.throws(() => aggregate([]), /empty/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/metrics.test.ts`
Expected: FAIL — `Cannot find module './metrics.ts'`.

- [ ] **Step 3: Write the implementation**

Create `benchmark/src/metrics.ts`:

```ts
export interface Aggregated {
  median: number
  min: number
  max: number
  mean: number
  stddev: number
}

/** Aggregate a list of numeric samples. Median is the headline metric. */
export function aggregate (samples: number[]): Aggregated {
  if (samples.length === 0) throw new Error('aggregate: empty samples')
  const sorted = [...samples].sort((a, b) => a - b)
  const n = sorted.length
  const mean = sorted.reduce((s, x) => s + x, 0) / n
  const variance = sorted.reduce((s, x) => s + (x - mean) ** 2, 0) / n
  const mid = Math.floor(n / 2)
  const median = n % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
  return { median, min: sorted[0], max: sorted[n - 1], mean, stddev: Math.sqrt(variance) }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/metrics.test.ts`
Expected: PASS — 4 tests passing.

- [ ] **Step 5: Lint**

Run: `npx eslint benchmark/src/metrics.ts benchmark/src/metrics.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add benchmark/src/metrics.ts benchmark/src/metrics.test.ts
git commit -m "feat(benchmark): metric aggregation"
```

---

## Task 6: Raw ES client

**Files:**
- Create: `benchmark/src/es.ts`
- Test: `benchmark/src/es.test.ts`

The ES client itself needs a live cluster, so only the pure `aliasName` helper is unit-tested; the rest is verified by the smoke run in Task 12.

- [ ] **Step 1: Write the failing test**

Create `benchmark/src/es.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aliasName } from './es.ts'

test('aliasName joins the indices prefix and dataset id', () => {
  assert.equal(aliasName('dataset-benchmark', 'bench-tall'), 'dataset-benchmark-bench-tall')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/es.test.ts`
Expected: FAIL — `Cannot find module './es.ts'`.

- [ ] **Step 3: Write the implementation**

Create `benchmark/src/es.ts`:

```ts
import { Client } from '@elastic/elasticsearch'

/** data-fair names a dataset's alias `${indicesPrefix}-${datasetId}` (see commons.js aliasName). */
export function aliasName (indicesPrefix: string, datasetId: string): string {
  return `${indicesPrefix}-${datasetId}`
}

// The dev-benchmark API runs with NODE_ENV=benchmark, so indicesPrefix is `dataset-benchmark`
// (api/config/default.cjs: `indicesPrefix: 'dataset-' + (process.env.NODE_ENV || 'development')`).
const esNode = (process.env.ES_NODES || process.env.BENCHMARK_ES_NODES || 'http://localhost:9200').split(',')[0]
const indicesPrefix = process.env.BENCHMARK_INDICES_PREFIX || 'dataset-benchmark'

let client: Client | undefined

export function getEsClient (): Client {
  if (!client) client = new Client({ node: esNode })
  return client
}

/**
 * Resolve the ES index/alias backing a data-fair dataset. Tries the deterministic name
 * first, then falls back to scanning aliases (covers an unexpected indices prefix).
 */
export async function resolveIndex (datasetId: string): Promise<string> {
  const es = getEsClient()
  const candidate = aliasName(indicesPrefix, datasetId)
  const exists = await es.indices.existsAlias({ name: candidate }).catch(() => false)
  if (exists) return candidate
  const aliases = await es.cat.aliases({ format: 'json' }) as Array<{ alias?: string }>
  const match = aliases.find(a => a.alias === candidate || a.alias?.endsWith(`-${datasetId}`))
  if (!match?.alias) throw new Error(`no ES alias for dataset "${datasetId}" — is it seeded & finalized?`)
  return match.alias
}

/**
 * Create a faithful N-shard copy of an index (mappings copied verbatim) via _reindex,
 * for sharding-sensitivity experiments. Idempotent — returns an existing copy as-is.
 * The runner clears caches inline via `es.indices.clearCache` for its --cold mode.
 */
export async function reindexWithShards (sourceIndex: string, shards: number): Promise<string> {
  const es = getEsClient()
  const target = `${sourceIndex}-shards${shards}`
  if (await es.indices.exists({ index: target })) return target
  const got = await es.indices.get({ index: sourceIndex })
  const sourceDef = Object.values(got)[0]
  await es.indices.create({
    index: target,
    settings: { number_of_shards: shards, number_of_replicas: 0 },
    mappings: sourceDef.mappings
  })
  await es.reindex({
    source: { index: sourceIndex },
    dest: { index: target },
    refresh: true,
    wait_for_completion: true
  })
  return target
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/es.test.ts`
Expected: PASS — 1 test passing.

- [ ] **Step 5: Lint**

Run: `npx eslint benchmark/src/es.ts benchmark/src/es.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add benchmark/src/es.ts benchmark/src/es.test.ts
git commit -m "feat(benchmark): raw ES client"
```

---

## Task 7: Connection setup & idempotent seeder

**Files:**
- Modify: `benchmark/src/setup.ts` (rewrite — remove the old `seedDatasets`)
- Create: `benchmark/src/seeder.ts`

Both modules talk to a live data-fair API; they are verified by the smoke run in Task 12. No unit test.

- [ ] **Step 1: Rewrite `setup.ts`, slimmed to connection only**

Replace the entire contents of `benchmark/src/setup.ts` with:

```ts
import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'
import type { AxiosInstance } from 'axios'

const baseUrl = process.env.BENCHMARK_URL || 'http://localhost:3867/data-fair'
const directoryUrl = process.env.BENCHMARK_DIRECTORY_URL || 'http://localhost:3867/simple-directory'

let ax: AxiosInstance | undefined

/** Authenticate against the local data-fair and verify connectivity. */
export async function init (): Promise<void> {
  console.log(`[setup] connecting to ${baseUrl}`)
  ax = await axiosAuth({
    email: 'dmeadus0@answers.com',
    password: 'passwd',
    directoryUrl,
    axiosOpts: { baseURL: baseUrl, headers: { 'x-cache-bypass': '1' } }
  })
  const res = await ax.get('/api/v1/datasets', { params: { size: 0 } })
  console.log(`[setup] connected (${res.data.count} existing datasets)`)
}

export function getAxios (): AxiosInstance {
  if (!ax) throw new Error('setup.init() must be called before getAxios()')
  return ax
}

export function getBaseUrl (): string {
  return baseUrl
}
```

- [ ] **Step 2: Create the seeder**

Create `benchmark/src/seeder.ts`:

```ts
import { getAxios } from './setup.ts'
import { generateSchema, rowIterator, type DatasetSpec } from './generator.ts'

const BATCH_SIZE = 1000
const FINALIZE_TIMEOUT_S = 1800

/** Seed a dataset via data-fair (so the ES mapping is real). Idempotent. */
export async function seedDataset (spec: DatasetSpec): Promise<void> {
  const ax = getAxios()

  try {
    const res = await ax.get(`/api/v1/datasets/${spec.id}`)
    if (res.data.status === 'finalized' && res.data.count >= spec.rows) {
      console.log(`[seed] ${spec.id} already finalized (${res.data.count} rows), skipping`)
      return
    }
  } catch { /* dataset does not exist yet — create it below */ }

  console.log(`[seed] creating ${spec.id} (${spec.rows.toLocaleString()} rows)...`)
  await ax.put(`/api/v1/datasets/${spec.id}`, {
    isRest: true,
    title: spec.id,
    schema: generateSchema(spec)
  })

  let batch: Record<string, unknown>[] = []
  let sent = 0
  const flush = async () => {
    if (batch.length === 0) return
    await ax.post(`/api/v1/datasets/${spec.id}/_bulk_lines`, batch)
    sent += batch.length
    if (sent % 50_000 === 0 || sent >= spec.rows) {
      console.log(`[seed] ${spec.id}: ${sent.toLocaleString()}/${spec.rows.toLocaleString()} rows`)
    }
    batch = []
  }
  for (const row of rowIterator(spec)) {
    batch.push(row)
    if (batch.length >= BATCH_SIZE) await flush()
  }
  await flush()

  console.log(`[seed] ${spec.id}: waiting for finalization...`)
  for (let attempt = 0; attempt < FINALIZE_TIMEOUT_S; attempt++) {
    const res = await ax.get(`/api/v1/datasets/${spec.id}`)
    if (res.data.status === 'finalized') {
      console.log(`[seed] ${spec.id} ready`)
      return
    }
    await new Promise(resolve => setTimeout(resolve, 1000))
  }
  throw new Error(`${spec.id} did not finalize within ${FINALIZE_TIMEOUT_S}s`)
}
```

- [ ] **Step 3: Lint**

Run: `npx eslint benchmark/src/setup.ts benchmark/src/seeder.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add benchmark/src/setup.ts benchmark/src/seeder.ts
git commit -m "feat(benchmark): connection setup + idempotent seeder"
```

---

## Task 8: Per-query runner

**Files:**
- Create: `benchmark/src/runner.ts`
- Test: `benchmark/src/runner.test.ts`

`extractSample` and `summarizeProfile` are pure and unit-tested; `runQuery` needs a live ES and is verified in Task 12.

- [ ] **Step 1: Write the failing test**

Create `benchmark/src/runner.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { extractSample, summarizeProfile } from './runner.ts'

const esResponse = {
  took: 42,
  hits: {
    total: { value: 10000, relation: 'gte' },
    hits: [{ _id: 'row-1' }, { _id: 'row-2' }]
  }
}

test('extractSample reads took, totals and hit ids', () => {
  const s = extractSample(esResponse, 55.5, 2048)
  assert.equal(s.took, 42)
  assert.equal(s.roundTripMs, 55.5)
  assert.equal(s.bytes, 2048)
  assert.equal(s.totalValue, 10000)
  assert.equal(s.totalRelation, 'gte')
  assert.equal(s.hitsReturned, 2)
  assert.deepEqual(s.topHitIds, ['row-1', 'row-2'])
})

test('summarizeProfile sums rewrite and top-level query time', () => {
  const profile = {
    shards: [{
      searches: [{
        rewrite_time: 1_000_000,
        query: [{ type: 'BooleanQuery', time_in_nanos: 5_000_000 }]
      }]
    }]
  }
  const s = summarizeProfile(profile)
  assert.equal(s.rewriteTimeMs, 1)
  assert.equal(s.totalTimeMs, 5)
  assert.deepEqual(s.topQueryTypes, [{ type: 'BooleanQuery', timeMs: 5 }])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/runner.test.ts`
Expected: FAIL — `Cannot find module './runner.ts'`.

- [ ] **Step 3: Write the implementation**

Create `benchmark/src/runner.ts`:

```ts
import type { Client } from '@elastic/elasticsearch'
import { getEsClient } from './es.ts'
import { aggregate, type Aggregated } from './metrics.ts'

export interface QueryRunSample {
  took: number
  roundTripMs: number
  totalValue: number
  totalRelation: string
  hitsReturned: number
  bytes: number
  topHitIds: string[]
}

/** Pull the metrics we care about out of one ES _search response. */
export function extractSample (response: any, roundTripMs: number, bytes: number): QueryRunSample {
  const hits = response.hits
  return {
    took: response.took,
    roundTripMs,
    totalValue: hits.total?.value ?? 0,
    totalRelation: hits.total?.relation ?? 'eq',
    hitsReturned: hits.hits.length,
    bytes,
    topHitIds: hits.hits.map((h: any) => h._id)
  }
}

export interface ProfileSummary {
  totalTimeMs: number
  rewriteTimeMs: number
  topQueryTypes: { type: string, timeMs: number }[]
}

/** Collapse an ES _profile tree into a few headline numbers (top-level query nodes only). */
export function summarizeProfile (profile: any): ProfileSummary {
  let rewriteNanos = 0
  let queryNanos = 0
  const byType: Record<string, number> = {}
  for (const shard of profile?.shards ?? []) {
    for (const search of shard.searches ?? []) {
      rewriteNanos += search.rewrite_time ?? 0
      for (const node of search.query ?? []) {
        const nanos = node.time_in_nanos ?? 0
        queryNanos += nanos
        byType[node.type] = (byType[node.type] ?? 0) + nanos
      }
    }
  }
  const topQueryTypes = Object.entries(byType)
    .map(([type, nanos]) => ({ type, timeMs: nanos / 1e6 }))
    .sort((a, b) => b.timeMs - a.timeMs)
    .slice(0, 5)
  return { totalTimeMs: queryNanos / 1e6, rewriteTimeMs: rewriteNanos / 1e6, topQueryTypes }
}

export interface RunOptions {
  index: string
  body: Record<string, any>
  runs?: number
  warmup?: number
  cold?: boolean
  profile?: boolean
}

export interface RunResult {
  index: string
  runs: number
  cold: boolean
  took: Aggregated
  roundTripMs: Aggregated
  bytes: Aggregated
  totalValue: number
  totalRelation: string
  topHitIds: string[]
  profile?: ProfileSummary
}

async function searchOnce (es: Client, index: string, body: Record<string, any>): Promise<QueryRunSample> {
  const t0 = performance.now()
  const res = await es.search({ index, ...body })
  const roundTripMs = performance.now() - t0
  const bytes = Buffer.byteLength(JSON.stringify(res))
  return extractSample(res, roundTripMs, bytes)
}

/** Run one ES query body N times serially and aggregate the per-query metrics. */
export async function runQuery (opts: RunOptions): Promise<RunResult> {
  const es = getEsClient()
  const { index, body } = opts
  const runs = opts.runs ?? 10
  const warmup = opts.warmup ?? 3
  const cold = opts.cold ?? false

  for (let w = 0; w < warmup; w++) await searchOnce(es, index, body)

  const samples: QueryRunSample[] = []
  for (let r = 0; r < runs; r++) {
    if (cold) await es.indices.clearCache({ index })
    samples.push(await searchOnce(es, index, body))
  }

  let profile: ProfileSummary | undefined
  if (opts.profile) {
    const res = await es.search({ index, ...body, profile: true })
    profile = summarizeProfile((res as any).profile)
  }

  const last = samples[samples.length - 1]
  return {
    index,
    runs,
    cold,
    took: aggregate(samples.map(s => s.took)),
    roundTripMs: aggregate(samples.map(s => s.roundTripMs)),
    bytes: aggregate(samples.map(s => s.bytes)),
    totalValue: last.totalValue,
    totalRelation: last.totalRelation,
    topHitIds: last.topHitIds,
    profile
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/runner.test.ts`
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Lint**

Run: `npx eslint benchmark/src/runner.ts benchmark/src/runner.test.ts`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add benchmark/src/runner.ts benchmark/src/runner.test.ts
git commit -m "feat(benchmark): per-query runner"
```

---

## Task 9: Experiment definitions & registry

**Files:**
- Create: `benchmark/src/experiments.ts`
- Create: `benchmark/src/experiments/track-total-hits.ts`
- Create: `benchmark/src/experiments/search-catchall.ts`
- Create: `benchmark/src/experiments/min-should-match.ts`
- Test: `benchmark/src/experiments.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmark/src/experiments.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { allExperiments, selectExperiments } from './experiments.ts'
import { getPreset } from './presets.ts'
import { generateSchema, schemaContext } from './generator.ts'

test('every variant body builds a valid ES query for its preset', () => {
  for (const exp of allExperiments) {
    const ctx = schemaContext(generateSchema(getPreset(exp.preset)))
    for (const v of [exp.baseline, ...exp.variants]) {
      const body = v.body(ctx)
      assert.ok(body.query, `${exp.name}/${v.name} produced no query`)
    }
  }
})

test('selectExperiments resolves a group prefix', () => {
  const tth = selectExperiments('track-total-hits')
  assert.ok(tth.length >= 3)
  assert.ok(tth.every(e => e.name.startsWith('track-total-hits:')))
})

test('selectExperiments resolves a single exact name', () => {
  const one = selectExperiments('search-catchall:wide-q')
  assert.equal(one.length, 1)
})

test('selectExperiments throws on an unknown name', () => {
  assert.throws(() => selectExperiments('bogus'), /unknown experiment/)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/experiments.test.ts`
Expected: FAIL — `Cannot find module './experiments.ts'`.

- [ ] **Step 3: Create the experiment-type module**

Create `benchmark/src/experiments.ts`:

```ts
import type { SchemaContext } from './generator.ts'
import { trackTotalHitsExperiments } from './experiments/track-total-hits.ts'
import { searchCatchallExperiments } from './experiments/search-catchall.ts'
import { minShouldMatchExperiments } from './experiments/min-should-match.ts'

export interface QueryVariant {
  name: string
  description: string
  /** Builds a raw ES _search body; ctx exposes the seeded preset's field names. */
  body: (ctx: SchemaContext) => Record<string, any>
}

export interface Experiment {
  name: string
  description: string
  preset: string
  baseline: QueryVariant
  variants: QueryVariant[]
}

export const allExperiments: Experiment[] = [
  ...trackTotalHitsExperiments,
  ...searchCatchallExperiments,
  ...minShouldMatchExperiments
]

const byName = new Map(allExperiments.map(e => [e.name, e]))

/** Resolve `all`, an exact experiment name, or a `group` prefix (e.g. `track-total-hits`). */
export function selectExperiments (name: string): Experiment[] {
  if (name === 'all') return allExperiments
  const exact = byName.get(name)
  if (exact) return [exact]
  const prefixed = allExperiments.filter(e => e.name.startsWith(`${name}:`))
  if (prefixed.length > 0) return prefixed
  throw new Error(`unknown experiment "${name}" — available: ${[...byName.keys()].join(', ')}`)
}
```

- [ ] **Step 4: Create the `track-total-hits` experiments**

Create `benchmark/src/experiments/track-total-hits.ts`:

```ts
import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// Block-max-WAND speeds up top-k retrieval of SCORING queries by skipping
// non-competitive blocks. `track_total_hits: true` forces an exact count, which
// requires visiting every match and so DISABLES WAND. These experiments contrast
// scoring shapes (where capping track_total_hits re-enables WAND) against a
// filter-only shape (where WAND never applied). All run with size: 20 so real
// top-k retrieval happens — WAND has nothing to skip at size: 0.

const TERMS = 'analyse population transport'

/** First full-text column of the `tall` preset. */
const ft = (ctx: SchemaContext): string => ctx.fullTextFields[0]

function tthExperiment (
  name: string,
  description: string,
  query: (ctx: SchemaContext) => Record<string, any>
): Experiment {
  const body = (trackTotalHits: boolean | number) => (ctx: SchemaContext) => ({
    query: query(ctx),
    size: 20,
    track_total_hits: trackTotalHits
  })
  return {
    name: `track-total-hits:${name}`,
    description,
    preset: 'tall',
    baseline: { name: 'exact', description: 'track_total_hits: true (disables block-max-WAND)', body: body(true) },
    variants: [
      { name: 'cap-10k', description: 'track_total_hits: 10000', body: body(10_000) },
      { name: 'cap-100k', description: 'track_total_hits: 100000', body: body(100_000) },
      { name: 'disabled', description: 'track_total_hits: false', body: body(false) }
    ]
  }
}

export const trackTotalHitsExperiments: Experiment[] = [
  tthExperiment('disjunction',
    'scoring multi-term disjunction (simple_query_string, OR) — WAND should help most',
    ctx => ({ simple_query_string: { query: TERMS, fields: [ft(ctx)], default_operator: 'or' } })),
  tthExperiment('conjunction',
    'scoring conjunction (simple_query_string, AND)',
    ctx => ({ simple_query_string: { query: TERMS, fields: [ft(ctx)], default_operator: 'and' } })),
  tthExperiment('term-scoring',
    'single scored term in query context (match)',
    ctx => ({ match: { [ft(ctx)]: 'population' } })),
  tthExperiment('filter-only',
    'same predicate in a non-scoring filter context — WAND does not apply',
    ctx => ({ bool: { filter: [{ match: { [ft(ctx)]: 'population' } }] } }))
]
```

- [ ] **Step 5: Create the `search-catchall` experiment**

Create `benchmark/src/experiments/search-catchall.ts`:

```ts
import type { Experiment } from '../experiments.ts'
import type { SchemaContext } from '../generator.ts'

// On the wide-text preset, contrast a `q` query spread over every per-column
// analyzed field against the constant-size `_search` catch-all pair. Both field
// sets exist in the same index mapping, so this isolates the parse/execute cost
// of the wide `fields` array. Run with the ES default track_total_hits (10000),
// which keeps block-max-WAND enabled for both variants.

const QUERY = 'analyse population'

/** Every per-column analyzed field of the wide-text preset (`<col>.text`, `<col>.text_standard`). */
function perColumnFields (ctx: SchemaContext): string[] {
  const fields: string[] = []
  for (const key of ctx.fullTextFields) fields.push(`${key}.text`, `${key}.text_standard`)
  return fields
}

export const searchCatchallExperiments: Experiment[] = [{
  name: 'search-catchall:wide-q',
  description: 'q over all per-column analyzed fields vs the _search catch-all pair',
  preset: 'wide-text',
  baseline: {
    name: 'per-column',
    description: 'simple_query_string over every per-column analyzed field',
    body: ctx => ({
      query: { simple_query_string: { query: QUERY, fields: perColumnFields(ctx) } },
      size: 20
    })
  },
  variants: [{
    name: 'search-field',
    description: 'simple_query_string over [_search, _search.text_standard]',
    body: () => ({
      query: { simple_query_string: { query: QUERY, fields: ['_search', '_search.text_standard'] } },
      size: 20
    })
  }]
}]
```

- [ ] **Step 6: Create the `min-should-match` experiment**

Create `benchmark/src/experiments/min-should-match.ts`:

```ts
import type { Experiment } from '../experiments.ts'

// On the wide-text preset, measure how minimum_should_match on a multi-term q
// affects cost and result-set drift. No track_total_hits override → ES default
// (10000), so block-max-WAND is enabled and interacts with the msm pruning.

const QUERY = 'analyse population transport énergie commune'

function sqs (msm?: string): Record<string, any> {
  const clause: Record<string, any> = {
    query: QUERY,
    fields: ['_search', '_search.text_standard'],
    default_operator: 'or'
  }
  if (msm) clause.minimum_should_match = msm
  return { query: { simple_query_string: clause }, size: 20 }
}

export const minShouldMatchExperiments: Experiment[] = [{
  name: 'min-should-match:wide-q',
  description: 'minimum_should_match on a 5-term q over the _search field',
  preset: 'wide-text',
  baseline: { name: 'none', description: 'no minimum_should_match', body: () => sqs() },
  variants: [
    { name: 'msm-1', description: 'minimum_should_match: "1"', body: () => sqs('1') },
    { name: 'msm-2', description: 'minimum_should_match: "2"', body: () => sqs('2') },
    { name: 'msm-75pct', description: 'minimum_should_match: "75%"', body: () => sqs('75%') },
    { name: 'msm-neg25', description: 'minimum_should_match: "-25%"', body: () => sqs('-25%') }
  ]
}]
```

- [ ] **Step 7: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/experiments.test.ts`
Expected: PASS — 4 tests passing.

- [ ] **Step 8: Lint**

Run: `npx eslint benchmark/src/experiments.ts benchmark/src/experiments.test.ts benchmark/src/experiments/`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add benchmark/src/experiments.ts benchmark/src/experiments.test.ts benchmark/src/experiments/
git commit -m "feat(benchmark): experiment definitions + registry"
```

---

## Task 10: Reporter — A/B comparison report

**Files:**
- Modify: `benchmark/src/reporter.ts` (rewrite — keeps throughput reporting, adds experiment reporting)
- Test: `benchmark/src/reporter.test.ts`

- [ ] **Step 1: Write the failing test**

Create `benchmark/src/reporter.test.ts`:

```ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pctDelta, sameHits } from './reporter.ts'
import type { RunResult } from './runner.ts'

test('pctDelta computes signed percentage change', () => {
  assert.equal(pctDelta(100, 50), -50)
  assert.equal(pctDelta(100, 150), 50)
  assert.equal(pctDelta(0, 0), 0)
})

test('sameHits compares top hit ids, ignoring the total', () => {
  const base = { topHitIds: ['a', 'b'], totalValue: 999, totalRelation: 'eq' } as RunResult
  const same = { topHitIds: ['a', 'b'], totalValue: 10, totalRelation: 'gte' } as RunResult
  const diff = { topHitIds: ['a', 'c'], totalValue: 999, totalRelation: 'eq' } as RunResult
  assert.equal(sameHits(base, same), true)
  assert.equal(sameHits(base, diff), false)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/reporter.test.ts`
Expected: FAIL — `pctDelta` / `sameHits` are not exported.

- [ ] **Step 3: Rewrite the reporter**

Replace the entire contents of `benchmark/src/reporter.ts` with:

```ts
import { writeFileSync, mkdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import path from 'node:path'
import type { Scenario } from './scenarios.ts'
import type { RunResult } from './runner.ts'

// ---- throughput reporting (autocannon) -------------------------------------

export interface ScenarioResult {
  scenario: Scenario
  latency: { p50: number, p97_5: number, p99: number, avg: number }
  throughput: { avg: number, total: number }
  errors: number
  duration: number
}

export function printResults (results: ScenarioResult[]): void {
  const nameWidth = Math.max(20, ...results.map(r => r.scenario.name.length + 2))
  console.log('')
  console.log(`Throughput Results - ${new Date().toISOString().split('T')[0]}`)
  console.log('='.repeat(nameWidth + 52))
  console.log('Scenario'.padEnd(nameWidth) + '| p50 (ms) | p97.5(ms)| p99 (ms) | req/s  | errors')
  console.log('-'.repeat(nameWidth + 52))
  for (const r of results) {
    console.log(
      r.scenario.name.padEnd(nameWidth) +
      `| ${fmtMs(r.latency.p50)} | ${fmtMs(r.latency.p97_5)} | ${fmtMs(r.latency.p99)} | ${fmtReqs(r.throughput.avg)} | ${r.errors}`
    )
  }
  console.log('='.repeat(nameWidth + 52))
  console.log('')
}

// ---- experiment (A/B) reporting --------------------------------------------

export interface VariantResult {
  variant: string
  description: string
  isBaseline: boolean
  result: RunResult
}

export interface ExperimentResult {
  experiment: string
  description: string
  preset: string
  rows: number
  variants: VariantResult[]
}

/** Signed percentage change from `baseline` to `value`. */
export function pctDelta (baseline: number, value: number): number {
  if (baseline === 0) return value === 0 ? 0 : Infinity
  return ((value - baseline) / baseline) * 100
}

/** True when two runs returned the same top-k hit ids (the total may legitimately differ). */
export function sameHits (a: RunResult, b: RunResult): boolean {
  return a.topHitIds.length === b.topHitIds.length &&
    a.topHitIds.every((id, i) => id === b.topHitIds[i])
}

export function printExperimentReport (er: ExperimentResult): void {
  const baseline = er.variants.find(v => v.isBaseline)!
  console.log('')
  console.log(`Experiment: ${er.experiment} — ${er.description}`)
  console.log(`Dataset: ${er.preset} (${er.rows.toLocaleString()} rows), runs=${baseline.result.runs}, ${baseline.result.cold ? 'cold' : 'warm'} cache`)
  console.log('-'.repeat(100))
  console.log('Variant'.padEnd(16) + '| took p50 | took min | e2e p50  | hits.total          | Δ took   | results')
  console.log('-'.repeat(100))
  for (const v of er.variants) {
    const r = v.result
    const delta = v.isBaseline ? '    —   ' : fmtPct(pctDelta(baseline.result.took.median, r.took.median))
    const results = v.isBaseline ? 'baseline' : (sameHits(baseline.result, r) ? 'same' : 'DIFFERS')
    console.log(
      v.variant.padEnd(16) +
      `| ${fmtMs(r.took.median)} | ${fmtMs(r.took.min)} | ${fmtMs(r.roundTripMs.median)} | ${fmtTotal(r).padEnd(19)} | ${delta} | ${results}`
    )
  }
  console.log('-'.repeat(100))
  for (const v of er.variants) {
    if (v.result.profile) {
      const top = v.result.profile.topQueryTypes.map(t => `${t.type} ${t.timeMs.toFixed(1)}ms`).join(', ')
      console.log(`  profile [${v.variant}]: rewrite ${v.result.profile.rewriteTimeMs.toFixed(1)}ms; ${top}`)
    }
  }
}

// ---- JSON persistence ------------------------------------------------------

function gitInfo (): { commit: string, branch: string } {
  try {
    return {
      commit: execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim(),
      branch: execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
    }
  } catch {
    return { commit: 'unknown', branch: 'unknown' }
  }
}

function saveJson (kind: string, payload: object): void {
  const dir = path.resolve(import.meta.dirname, '../results')
  mkdirSync(dir, { recursive: true })
  const filename = `${kind}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`
  const filepath = path.join(dir, filename)
  writeFileSync(filepath, JSON.stringify(payload, null, 2))
  console.log(`Results saved to ${filepath}`)
}

export function saveResults (results: ScenarioResult[]): void {
  saveJson('throughput', {
    timestamp: new Date().toISOString(),
    git: gitInfo(),
    node: process.version,
    results: results.map(r => ({
      scenario: r.scenario.name,
      description: r.scenario.description,
      latency: r.latency,
      throughput: r.throughput,
      errors: r.errors,
      duration: r.duration
    }))
  })
}

export function saveExperimentResults (results: ExperimentResult[]): void {
  saveJson('experiment', {
    timestamp: new Date().toISOString(),
    git: gitInfo(),
    node: process.version,
    experiments: results
  })
}

// ---- formatting helpers ----------------------------------------------------

function fmtMs (v: number): string {
  return v.toFixed(1).padStart(8)
}

function fmtReqs (v: number): string {
  return String(Math.round(v)).padStart(6)
}

function fmtPct (v: number): string {
  const s = v >= 0 ? `+${v.toFixed(1)}` : v.toFixed(1)
  return `${s}%`.padStart(8)
}

function fmtTotal (r: RunResult): string {
  return `${r.totalValue.toLocaleString()} (${r.totalRelation})`
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/reporter.test.ts`
Expected: PASS — 2 tests passing.

- [ ] **Step 5: Lint**

Run: `npx eslint benchmark/src/reporter.ts benchmark/src/reporter.test.ts`
Expected: no errors. (`scenarios.ts` is rewritten in Task 11; its `Scenario` export keeps the same shape, so this import stays valid.)

- [ ] **Step 6: Commit**

```bash
git add benchmark/src/reporter.ts benchmark/src/reporter.test.ts
git commit -m "feat(benchmark): A/B experiment reporting"
```

---

## Task 11: CLI dispatch, throughput mode & scenarios

**Files:**
- Rewrite: `benchmark/src/scenarios.ts`
- Create: `benchmark/src/throughput.ts`
- Rewrite: `benchmark/src/index.ts`
- Delete: `benchmark/src/seed.ts`

This wires everything together. There is no unit test; verification is lint plus the smoke run in Task 12.

- [ ] **Step 1: Rewrite `scenarios.ts` for the new dataset ids and field names**

Replace the entire contents of `benchmark/src/scenarios.ts` with:

```ts
export interface Scenario {
  name: string
  description: string
  datasetId: string
  queryParams: string
}

// Field names follow the generator's naming: full-text strings `text<n>`,
// keyword strings `kw<n>`, integers `int<n>`, numbers `num<n>`, dates `date<n>`.
// The `bench-mixed` preset has all of these plus geo (lat/lon).
export const scenarios: Scenario[] = [
  { name: 'simple-list', description: 'Baseline paginated list', datasetId: 'bench-mixed', queryParams: 'size=20' },
  { name: 'fulltext-search', description: 'Full-text search', datasetId: 'bench-mixed', queryParams: 'q=analyse+population&size=20' },
  { name: 'filter-eq', description: 'Exact match filter', datasetId: 'bench-mixed', queryParams: 'kw1_eq=cat-alpha&size=20' },
  { name: 'filter-range', description: 'Range filter', datasetId: 'bench-mixed', queryParams: 'int1_gte=200&int1_lte=800&size=20' },
  { name: 'sort', description: 'Sort by integer field', datasetId: 'bench-mixed', queryParams: 'sort=int1&size=20' },
  { name: 'deep-pagination', description: 'Deep offset pagination', datasetId: 'bench-mixed', queryParams: 'page=500&size=20&sort=_i' },
  { name: 'geo-bbox', description: 'Geo bounding box filter', datasetId: 'bench-mixed', queryParams: 'bbox=-5,42,8,51&size=20' },
  { name: 'combined', description: 'Search + filter + sort combined', datasetId: 'bench-mixed', queryParams: 'q=analyse&int1_gte=100&sort=int1&size=20' },
  { name: 'small-dataset', description: 'Small dataset baseline', datasetId: 'bench-small', queryParams: 'size=20' }
]
```

- [ ] **Step 2: Create `throughput.ts` (the autocannon mode, extracted from the old `index.ts`)**

Create `benchmark/src/throughput.ts`:

```ts
import { parseArgs } from 'node:util'
import autocannon from 'autocannon'
import { init, getBaseUrl, getAxios } from './setup.ts'
import { seedDataset } from './seeder.ts'
import { getPreset } from './presets.ts'
import { scenarios, type Scenario } from './scenarios.ts'
import { printResults, saveResults, type ScenarioResult } from './reporter.ts'

async function runScenario (scenario: Scenario, duration: number, connections: number, warmup: number): Promise<ScenarioResult> {
  const url = `${getBaseUrl()}/api/v1/datasets/${scenario.datasetId}/lines?${scenario.queryParams}`

  const check = await getAxios().get(`/api/v1/datasets/${scenario.datasetId}/lines?${scenario.queryParams}`)
  if (check.status !== 200) throw new Error(`Pre-check failed for ${scenario.name}: status ${check.status}`)
  console.log(`  pre-check ok: ${check.data.total} total results`)

  if (warmup > 0) {
    console.log(`  warmup (${warmup}s)...`)
    await autocannon({ url, connections, duration: warmup })
  }

  console.log(`  benchmarking (${duration}s, ${connections} connections)...`)
  const result = await autocannon({ url, connections, duration })

  return {
    scenario,
    latency: { p50: result.latency.p50, p97_5: result.latency.p97_5, p99: result.latency.p99, avg: result.latency.average },
    throughput: { avg: result.requests.average, total: result.requests.total },
    errors: result.errors,
    duration
  }
}

/** `throughput` command — autocannon concurrency test over the GET /lines scenarios. */
export async function runThroughput (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      scenarios: { type: 'string', default: 'all' },
      duration: { type: 'string', default: '10' },
      connections: { type: 'string', default: '10' },
      warmup: { type: 'string', default: '3' },
      'no-save': { type: 'boolean', default: false }
    }
  })

  const selected = values.scenarios === 'all'
    ? scenarios
    : scenarios.filter(s => values.scenarios!.split(',').includes(s.name))
  if (selected.length === 0) {
    throw new Error(`No matching scenarios. Available: ${scenarios.map(s => s.name).join(', ')}`)
  }

  const duration = parseInt(values.duration!)
  const connections = parseInt(values.connections!)
  const warmup = parseInt(values.warmup!)

  await init()
  await seedDataset(getPreset('small'))
  await seedDataset(getPreset('mixed'))

  const results: ScenarioResult[] = []
  for (const scenario of selected) {
    console.log(`\n[${scenario.name}] ${scenario.description}`)
    try {
      results.push(await runScenario(scenario, duration, connections, warmup))
    } catch (err) {
      console.error(`  FAILED: ${err}`)
    }
  }

  printResults(results)
  if (!values['no-save']) saveResults(results)
}
```

- [ ] **Step 3: Rewrite `index.ts` as the command dispatcher**

Replace the entire contents of `benchmark/src/index.ts` with:

```ts
import { parseArgs } from 'node:util'
import { init, getAxios } from './setup.ts'
import { presets, getPreset } from './presets.ts'
import { seedDataset } from './seeder.ts'
import { resolveIndex, reindexWithShards } from './es.ts'
import { generateSchema, schemaContext } from './generator.ts'
import { selectExperiments } from './experiments.ts'
import { runQuery } from './runner.ts'
import { aggregate } from './metrics.ts'
import { runThroughput } from './throughput.ts'
import {
  printExperimentReport, saveExperimentResults,
  type ExperimentResult, type VariantResult
} from './reporter.ts'

const USAGE = `data-fair benchmark — Elasticsearch query evaluation harness

Usage: npm run benchmark -- <command> [options]

Commands:
  seed        Generate & idempotently load datasets
              --preset=<all|name,...>  --rows=<n>  --shards=<n>  --seed=<n>
  experiment  Raw-ES A/B: baseline vs. variant query bodies
              --name=<all|experiment|group>  --runs=<n>  --profile  --cold  --no-save
  query       Run a real data-fair API request N times
              --dataset=<id>  --params=<querystring>  --runs=<n>
  throughput  Autocannon concurrency test over GET /lines
              --scenarios=<all|name,...>  --duration=<s>  --connections=<n>  --warmup=<s>  --no-save

Presets: ${Object.keys(presets).join(', ')}`

async function seedCommand (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      preset: { type: 'string', default: 'all' },
      rows: { type: 'string' },
      shards: { type: 'string' },
      seed: { type: 'string' }
    }
  })
  await init()
  const names = values.preset === 'all' ? Object.keys(presets) : values.preset!.split(',')
  for (const name of names) {
    const spec = getPreset(name)
    if (values.rows) spec.rows = parseInt(values.rows)
    if (values.seed) spec.seed = parseInt(values.seed)
    if (values.shards) spec.shards = parseInt(values.shards)
    await seedDataset(spec)
    if (spec.shards) {
      const index = await resolveIndex(spec.id)
      const copy = await reindexWithShards(index, spec.shards)
      console.log(`[seed] ${spec.id}: ${spec.shards}-shard copy ready at ${copy}`)
    }
  }
}

async function experimentCommand (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      name: { type: 'string', default: 'all' },
      runs: { type: 'string', default: '10' },
      profile: { type: 'boolean', default: false },
      cold: { type: 'boolean', default: false },
      'no-save': { type: 'boolean', default: false }
    }
  })
  await init()
  const results: ExperimentResult[] = []
  for (const exp of selectExperiments(values.name!)) {
    const spec = getPreset(exp.preset)
    await seedDataset(spec)
    const index = await resolveIndex(spec.id)
    const ctx = schemaContext(generateSchema(spec))
    const variants = [
      { ...exp.baseline, isBaseline: true },
      ...exp.variants.map(v => ({ ...v, isBaseline: false }))
    ]
    console.log(`\n[experiment] ${exp.name}`)
    const variantResults: VariantResult[] = []
    for (const v of variants) {
      console.log(`  running variant: ${v.name}`)
      const result = await runQuery({
        index,
        body: v.body(ctx),
        runs: parseInt(values.runs!),
        cold: values.cold,
        profile: values.profile
      })
      variantResults.push({ variant: v.name, description: v.description, isBaseline: v.isBaseline, result })
    }
    const er: ExperimentResult = {
      experiment: exp.name,
      description: exp.description,
      preset: exp.preset,
      rows: spec.rows,
      variants: variantResults
    }
    printExperimentReport(er)
    results.push(er)
  }
  if (!values['no-save']) saveExperimentResults(results)
}

async function queryCommand (argv: string[]): Promise<void> {
  const { values } = parseArgs({
    args: argv,
    options: {
      dataset: { type: 'string' },
      params: { type: 'string', default: '' },
      runs: { type: 'string', default: '10' }
    }
  })
  if (!values.dataset) throw new Error('query: --dataset is required')
  await init()
  const ax = getAxios()
  const runs = parseInt(values.runs!)
  const url = `/api/v1/datasets/${values.dataset}/lines?${values.params}`
  const latencies: number[] = []
  let total = 0
  let bytes = 0
  for (let r = 0; r < runs; r++) {
    const t0 = performance.now()
    const res = await ax.get(url)
    latencies.push(performance.now() - t0)
    total = res.data.total
    bytes = Buffer.byteLength(JSON.stringify(res.data))
  }
  const e2e = aggregate(latencies)
  console.log('')
  console.log(`Query: GET ${url}`)
  console.log(`runs=${runs}  total=${total}  bytes=${bytes}`)
  console.log(`e2e latency (ms): p50=${e2e.median.toFixed(1)}  min=${e2e.min.toFixed(1)}  max=${e2e.max.toFixed(1)}`)
}

async function main (): Promise<void> {
  const [command, ...rest] = process.argv.slice(2)
  switch (command) {
    case 'seed': await seedCommand(rest); break
    case 'experiment': await experimentCommand(rest); break
    case 'query': await queryCommand(rest); break
    case 'throughput': await runThroughput(rest); break
    default: console.log(USAGE)
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
```

- [ ] **Step 4: Delete the superseded `seed.ts`**

Run: `git rm benchmark/src/seed.ts`
Expected: file removed. (Its schema/row generation is fully replaced by `generator.ts`; nothing imports `seed.ts` anymore — `setup.ts` was rewritten in Task 7.)

- [ ] **Step 5: Verify no dangling imports of `seed.ts`**

Run: `grep -rn "seed.ts\|generateRows\|benchSchema" benchmark/src --include=*.ts | grep -v generator`
Expected: only matches inside `seeder.ts` (`import ... from './generator.ts'`) and `generator.test.ts` — no reference to `./seed.ts`.

- [ ] **Step 6: Lint the whole benchmark package**

Run: `npx eslint benchmark/`
Expected: no errors.

- [ ] **Step 7: Run the full unit-test suite**

Run: `npm -w benchmark test`
Expected: PASS — all tests from Tasks 2–10 passing (generator, presets, metrics, es, runner, experiments, reporter).

- [ ] **Step 8: Verify the CLI prints usage**

Run: `npm run benchmark`
Expected: prints the usage block listing the four commands and the presets. (It does not connect — `default` branch only.)

- [ ] **Step 9: Commit**

```bash
git add benchmark/src/index.ts benchmark/src/throughput.ts benchmark/src/scenarios.ts
git rm benchmark/src/seed.ts
git commit -m "feat(benchmark): CLI dispatch, throughput mode, drop seed.ts"
```

---

## Task 12: README & end-to-end smoke verification

**Files:**
- Rewrite: `benchmark/README.md`

The smoke run needs the dev infrastructure. Per `AGENTS.md`, dev processes are managed by the user through zellij — do **not** start them. If the services are not running, ask the user to start them (`npm run test-deps`, then `npm run dev-benchmark`) before doing the smoke steps, or hand the smoke verification to the user.

- [ ] **Step 1: Rewrite the README**

Replace the entire contents of `benchmark/README.md` with:

````markdown
# data-fair benchmark

An Elasticsearch query evaluation harness for data-fair. Measures per-query ES cost on
large, realistically-shaped datasets and runs A/B comparisons of query variants.

See [`../docs/superpowers/specs/2026-05-22-es-query-evaluation-harness-design.md`](../docs/superpowers/specs/2026-05-22-es-query-evaluation-harness-design.md)
for the design and [`INVESTIGATIONS.md`](./INVESTIGATIONS.md) for the follow-up backlog.

## Setup

From the repository root, in separate terminals:

```sh
npm run test-deps      # mongo, elasticsearch, simple-directory, ...
npm run dev-benchmark  # API server + worker, benchmark config (relaxed limits)
```

## Commands

```sh
# Seed datasets (idempotent; first multi-million-row seed is slow)
npm run benchmark -- seed --preset=small
npm run benchmark -- seed --preset=tall --rows=5000000
npm run benchmark -- seed --preset=wide-text --shards=3

# Raw-ES A/B experiments
npm run benchmark -- experiment --name=track-total-hits --profile
npm run benchmark -- experiment --name=search-catchall:wide-q --cold
npm run benchmark -- experiment --name=all --runs=20

# End-to-end data-fair API query
npm run benchmark -- query --dataset=bench-tall --params="q=analyse&size=20" --runs=10

# Autocannon throughput test
npm run benchmark -- throughput --duration=30 --connections=20
```

Presets: `small` (1k rows), `tall` (2M, for track_total_hits), `wide-text` (300k, ~40
text columns), `mixed` (500k, all types). Experiments: `track-total-hits:*`,
`search-catchall:wide-q`, `min-should-match:wide-q`.

## Results

Experiment and throughput results print to the console and are saved as JSON in
`benchmark/results/`, tagged with the git commit.

## Tests

```sh
npm -w benchmark test  # pure-unit tests (generator, metrics, presets, runner, ...)
```
````

- [ ] **Step 2: Confirm the dev infrastructure is up**

Run: `bash dev/status.sh`
Expected: nginx, API, ES, mongo healthy. If not, ask the user to start `npm run test-deps` and `npm run dev-benchmark`, then continue.

- [ ] **Step 3: Smoke — seed the small preset**

Run: `npm run benchmark -- seed --preset=small`
Expected: `[seed] bench-small ... ready` (or `already finalized ... skipping` on a re-run).

- [ ] **Step 4: Smoke — run an experiment on the small preset**

The shipped experiments target `tall` / `wide-text`; for a fast smoke, seed those at a tiny size and run one experiment:

Run: `npm run benchmark -- seed --preset=tall --rows=20000 && npm run benchmark -- experiment --name=track-total-hits:disjunction --runs=5`
Expected: an `Experiment: track-total-hits:disjunction` table with rows `exact`, `cap-10k`, `cap-100k`, `disabled`; a `Δ took` column; a `results` column showing `same` for the capped variants (block-max-WAND returns the same top-20). A JSON file appears in `benchmark/results/`.

- [ ] **Step 5: Smoke — end-to-end API query**

Run: `npm run benchmark -- query --dataset=bench-small --params="size=20" --runs=5`
Expected: a `Query: GET ...` block with `total` and `e2e latency` percentiles.

- [ ] **Step 6: Final full lint & unit tests**

Run: `npx eslint benchmark/ && npm -w benchmark test`
Expected: lint clean; all unit tests pass.

- [ ] **Step 7: Commit**

```bash
git add benchmark/README.md
git commit -m "docs(benchmark): rewrite README for the evaluation harness"
```

---

## Self-Review Notes

**Spec coverage:** seed/experiment/query/throughput commands (Tasks 11) ✓; parametric generator + `x-capabilities` (Tasks 2–3) ✓; presets (Task 4) ✓; seeding via data-fair + `--shards` reindex (Tasks 6–7, 11) ✓; raw-ES runner with warm/cold + profile (Task 8) ✓; experiment definitions for the three threads (Task 9) ✓; A/B reporting + JSON persistence (Task 10) ✓; pure-unit tests via `node --test` (every TDD task) ✓; README smoke (Task 12) ✓. `INVESTIGATIONS.md` already exists (committed with the spec).

**Type consistency:** `DatasetSpec`, `SchemaField`, `SchemaContext`, `Capabilities` defined in `generator.ts` and imported everywhere; `RunResult`/`RunOptions` in `runner.ts`; `Experiment`/`QueryVariant` in `experiments.ts`; `ExperimentResult`/`VariantResult` in `reporter.ts`. `reporter.ts` imports `Scenario` from `scenarios.ts`, whose shape is unchanged by the Task 11 rewrite.

**Known infra dependency:** Tasks 6–12 contain integration code that cannot be fully exercised without a live ES + data-fair; those are verified by lint + the Task 12 smoke run, which depends on the user-managed dev environment.
