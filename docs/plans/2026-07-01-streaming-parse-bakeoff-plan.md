# Streaming ES-parse substrate bake-off — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure, on a fair uniform task, which JSON-buffer parsing substrate best cuts allocation/GC vs V8 `JSON.parse`+`stringify` for the `/lines` response, to select (or reject) a basis for a future streaming endpoint.

**Architecture:** A self-contained micro-benchmark under `benchmark/src/streaming-parse/`. Every substrate implements a uniform async interface (`t1` parse+read, `t2json`, `t2csv`) driven off the same synthetic/real ES `_search` buffers and a shared schema descriptor, gated by output equivalence (JSON deep-equal, CSV byte-equal) against the V8 reference. A measurement harness records GC count/pause (`perf_hooks`), peak RSS, and ms/iter and prints a ranked table.

**Tech Stack:** Node (`--experimental-strip-types`, `--expose-gc`), TypeScript run directly; parsers: `@streamparser/json`, `jsonparse`, `stream-json`, `simdjson`; `perf_hooks` for GC metrics.

## Global Constraints

- **Location:** everything lives under `benchmark/src/streaming-parse/`; results in `benchmark/results/streaming-parse-bakeoff.md`. Do NOT touch the production `/lines` path.
- **Run convention (from repo root):** `NODE_CONFIG_DIR=api/config NODE_ENV=benchmark node --expose-gc --max-semi-space-size=8 --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/<file>.ts`. `--max-semi-space-size=8` makes young-gen scavenges frequent and observable; `--expose-gc` enables `global.gc()`.
- **Reuse existing utils:** seeded PRNG + row generators live in `benchmark/src/seed.ts` (`generateRows`, `generateWideRows`, `benchSchema`, `wideSchema`, mulberry32). Do not reinvent them.
- **Fairness (the Task-10 lesson from the sibling effort):** the V8 baseline MUST include `JSON.parse` of the same buffer (it is today's path). All substrates consume the identical `Buffer` and produce identical output; only the parse+extract differs.
- **Uniform substrate interface** (async so stream-based parsers fit): `t1(buf, d) => Promise<number>` (checksum of all extracted field values), `t2json(buf, d) => Promise<Buffer>` (JSON rows-array bytes), `t2csv(buf, d) => Promise<Buffer>` (CSV bytes). Sync parsers resolve immediately.
- **Shared emit, so only extraction differs:** a shared CSV cell formatter (`csv-format.ts`) is used by ALL substrates including V8, so CSV is byte-comparable; JSON parity is deep-equal (key order not significant).
- **Correctness gate:** a substrate whose `t2json` is not deep-equal and `t2csv` not byte-equal to the V8 reference (on every buffer) is disqualified and excluded from the ranking.
- **Native-addon gate (simdjson):** if it will not install/build in dev after a reasonable attempt, mark it `available=false` and skip (no rabbit-holing). A dev win is not shippable until it also loads+runs on Alpine/musl (Task 10).
- **Decision rule:** a substrate wins if it cuts T1 GC pause/count ≥30% vs V8 with ≤1.5× the ms/iter (or ≥3× allocation win to excuse a larger CPU cost). A negative verdict is an acceptable, expected outcome.
- **Determinism:** seeded generators only; no `Math.random`/`Date.now` in generation.

---

## File Structure

- `benchmark/src/streaming-parse/descriptor.ts` — `Column`, `Descriptor` types; `schemaToDescriptor(schema, selectIncludesId)`.
- `benchmark/src/streaming-parse/buffers.ts` — builds the named synthetic ES `_search` buffers + descriptors; loads the captured real fixture if present.
- `benchmark/src/streaming-parse/csv-format.ts` — the shared CSV cell/row formatter used by all substrates.
- `benchmark/src/streaming-parse/json-emit.ts` — the shared JSON rows-array writer used by the SAX/simdjson substrates.
- `benchmark/src/streaming-parse/substrate.ts` — the `Substrate` interface type.
- `benchmark/src/streaming-parse/substrates/v8.ts` — baseline (also produces the reference output).
- `benchmark/src/streaming-parse/substrates/streamparser.ts` — `@streamparser/json`.
- `benchmark/src/streaming-parse/substrates/jsonparse.ts` — `jsonparse`.
- `benchmark/src/streaming-parse/substrates/streamjson.ts` — `stream-json`.
- `benchmark/src/streaming-parse/substrates/simdjson.ts` — `simdjson` (conditional).
- `benchmark/src/streaming-parse/harness.ts` — `measure()` (GC/RSS/ms) + correctness gate + table.
- `benchmark/src/streaming-parse/bench.ts` — entrypoint.
- `benchmark/src/streaming-parse/capture-real.ts` — fetch+save a real ES `_search` buffer fixture.
- `benchmark/src/streaming-parse/fixtures/` — the saved real buffer (gitignored if large; small sample committed).
- `benchmark/src/streaming-parse/alpine-check/` — Dockerfile + script for the simdjson musl gate.
- `benchmark/results/streaming-parse-bakeoff.md` — results + recommendation.

---

## Phase 0 — Shared task definition (buffers, descriptor, emit, gate)

### Task 1: Descriptor + synthetic buffers + shared formatters

**Files:**
- Create: `benchmark/src/streaming-parse/descriptor.ts`, `buffers.ts`, `csv-format.ts`, `json-emit.ts`
- Test: `benchmark/src/streaming-parse/buffers.test.ts` (a plain assert script run with node)

**Interfaces:**
- Produces:
  ```ts
  // descriptor.ts
  export interface Column { sourceKey: string; outKey: string; type: 'string'|'integer'|'number'|'boolean'|'object'; separator: string | null }
  export interface Descriptor { columns: Column[]; selectIncludesId: boolean }
  export function schemaToDescriptor(schema: {key:string;type?:string;separator?:string}[], selectIncludesId: boolean): Descriptor
  // buffers.ts
  export interface NamedBuffer { name: string; buf: Buffer; descriptor: Descriptor }
  export function makeBuffers(rowCount?: number): NamedBuffer[]  // 'string-heavy','number-heavy','wide','nested-multivalue'
  // csv-format.ts
  export function csvCell(value: unknown, type: Column['type']): string  // BOM-less; quoting: strings always quoted, "→"", strip \0; number raw; bool 1/0; object JSON.stringify+conditional-quote
  export function csvHeader(cols: Column[]): string
  // json-emit.ts
  export function beginArray(): string; export function jsonRow(pairs: [string, unknown][]): string  // writes {"k":v,...}
  ```

- [ ] **Step 1: Write `descriptor.ts`**

```ts
export interface Column { sourceKey: string; outKey: string; type: 'string'|'integer'|'number'|'boolean'|'object'; separator: string | null }
export interface Descriptor { columns: Column[]; selectIncludesId: boolean }

const tyOf = (t?: string): Column['type'] =>
  t === 'integer' ? 'integer' : t === 'number' ? 'number' : t === 'boolean' ? 'boolean' : t === 'string' ? 'string' : 'object'

export function schemaToDescriptor (schema: { key: string, type?: string, separator?: string }[], selectIncludesId: boolean): Descriptor {
  const columns: Column[] = schema.map(f => ({ sourceKey: f.key, outKey: f.key, type: tyOf(f.type), separator: f.separator ?? null }))
  return { columns, selectIncludesId }
}
```

- [ ] **Step 2: Write `buffers.ts`** (build ES `_search` shape from `seed.ts` generators; add axes)

```ts
import { generateRows, generateWideRows, benchSchema, wideSchema } from '../seed.ts'
import { schemaToDescriptor, type Descriptor } from './descriptor.ts'

export interface NamedBuffer { name: string, buf: Buffer, descriptor: Descriptor }

const wrap = (rows: Record<string, any>[]): Buffer => {
  const hits = rows.map((r, i) => ({ _id: r._id ?? `id-${i}`, _score: null, sort: [i], _source: r }))
  return Buffer.from(JSON.stringify({ hits: { total: { value: rows.length, relation: 'eq' }, hits } }))
}

// nested + multivalue: dotted source keys and an array field with a separator
const nestedSchema = [
  { key: 'a.b', type: 'string' }, { key: 'a.c', type: 'integer' },
  { key: 'tags', type: 'string', separator: ';' }, { key: 'label', type: 'string' }
]
function generateNestedRows (count: number): Record<string, any>[] {
  const rows: Record<string, any>[] = []
  for (let i = 0; i < count; i++) {
    rows.push({ _id: `n-${i}`, a: { b: `deep-${i}`, c: i }, tags: [`t${i % 5}`, `t${i % 7}`, `t${i % 3}`], label: `row ${i}` })
  }
  return rows
}

// number-heavy: reuse wideSchema's number columns only-ish by using benchSchema numeric-forward
const numberSchema = Array.from({ length: 20 }, (_, i) => ({ key: `n${i}`, type: i % 2 ? 'number' : 'integer' }))
function generateNumberRows (count: number): Record<string, any>[] {
  const rows: Record<string, any>[] = []
  let s = 1
  for (let i = 0; i < count; i++) {
    const r: Record<string, any> = { _id: `num-${i}` }
    for (let c = 0; c < numberSchema.length; c++) { s = (s * 1103515245 + 12345) & 0x7fffffff; r[`n${c}`] = c % 2 ? s / 1000 : (s % 100000) }
    rows.push(r)
  }
  return rows
}

export function makeBuffers (rowCount = 10000): NamedBuffer[] {
  return [
    { name: 'string-heavy', buf: wrap(generateRows(rowCount)), descriptor: schemaToDescriptor(benchSchema, true) },
    { name: 'number-heavy', buf: wrap(generateNumberRows(rowCount)), descriptor: schemaToDescriptor(numberSchema, true) },
    { name: 'wide', buf: wrap(generateWideRows(rowCount)), descriptor: schemaToDescriptor(wideSchema, true) },
    { name: 'nested-multivalue', buf: wrap(generateNestedRows(rowCount)), descriptor: schemaToDescriptor(nestedSchema, true) }
  ]
}
```

- [ ] **Step 3: Write `csv-format.ts`** (fixed CSV semantics, shared by all substrates)

```ts
import type { Column } from './descriptor.ts'
const NEEDS_QUOTE = /[",\r\n]/
export function csvCell (value: unknown, type: Column['type']): string {
  if (value === null || value === undefined) return ''
  if (type === 'string') return '"' + String(value).replace(/"/g, '""').replace(/\0/g, '') + '"'
  if (type === 'integer' || type === 'number') return '' + value
  if (type === 'boolean') return value === true ? '1' : value === false ? '0' : ''
  let s: string; try { s = JSON.stringify(value) } catch { s = String(value) }
  if (s === undefined) return ''
  s = s.replace(/\0/g, '')
  return NEEDS_QUOTE.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}
export function csvHeader (cols: Column[]): string {
  return cols.map(c => '"' + c.outKey.replace(/"/g, '""') + '"').join(',') + '\n'
}
```

- [ ] **Step 4: Write `json-emit.ts`** (shared JSON row writer for non-V8 substrates)

```ts
export function jsonRowFragment (pairs: [string, unknown][]): string {
  let out = '{'
  for (let i = 0; i < pairs.length; i++) {
    if (i) out += ','
    out += JSON.stringify(pairs[i][0]) + ':' + JSON.stringify(pairs[i][1])
  }
  return out + '}'
}
```

- [ ] **Step 5: Write the check `buffers.test.ts`**

```ts
import assert from 'node:assert/strict'
import { makeBuffers } from './buffers.ts'
const bufs = makeBuffers(50)
assert.equal(bufs.length, 4)
for (const { name, buf, descriptor } of bufs) {
  const parsed = JSON.parse(buf.toString())
  assert.equal(parsed.hits.hits.length, 50, name)
  assert.ok(descriptor.columns.length > 0, name)
}
console.log('buffers.test OK')
```

- [ ] **Step 6: Run the check**

Run: `NODE_CONFIG_DIR=api/config NODE_ENV=benchmark node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/buffers.test.ts`
Expected: prints `buffers.test OK`, exit 0.

- [ ] **Step 7: Commit**

```bash
git add benchmark/src/streaming-parse
git commit -m "bench(streaming): descriptor, synthetic ES buffers, shared csv/json emit"
```

---

### Task 2: Measurement harness + correctness gate + table

**Files:**
- Create: `benchmark/src/streaming-parse/substrate.ts`, `harness.ts`
- Test: `benchmark/src/streaming-parse/harness.test.ts`

**Interfaces:**
- Consumes: `NamedBuffer` (Task 1).
- Produces:
  ```ts
  // substrate.ts
  export interface Substrate {
    name: string; available: boolean
    t1(buf: Buffer, d: import('./descriptor.ts').Descriptor): Promise<number>
    t2json(buf: Buffer, d: import('./descriptor.ts').Descriptor): Promise<Buffer>
    t2csv(buf: Buffer, d: import('./descriptor.ts').Descriptor): Promise<Buffer>
  }
  // harness.ts
  export interface Measurement { msPerIter: number; gcCount: number; gcPauseMs: number; peakRssMb: number }
  export function measure(fn: () => Promise<unknown>, warmup?: number, iters?: number): Promise<Measurement>
  export function checkEquivalence(ref: {json: Buffer, csv: Buffer}, got: {json: Buffer, csv: Buffer}): { jsonOk: boolean, csvOk: boolean }
  export function printTable(rows: Array<{ substrate: string, task: string } & Measurement>): void
  ```

- [ ] **Step 1: Write `substrate.ts`** (just the interface above — copy it verbatim).

- [ ] **Step 2: Write `harness.ts`**

```ts
import { PerformanceObserver, performance } from 'node:perf_hooks'
export interface Measurement { msPerIter: number; gcCount: number; gcPauseMs: number; peakRssMb: number }

export async function measure (fn: () => Promise<unknown>, warmup = 5, iters = 30): Promise<Measurement> {
  for (let i = 0; i < warmup; i++) await fn()
  let gcCount = 0; let gcPauseMs = 0
  const obs = new PerformanceObserver(list => { for (const e of list.getEntries()) { gcCount++; gcPauseMs += e.duration } })
  obs.observe({ entryTypes: ['gc'] })
  global.gc?.()
  let peakRss = process.memoryUsage().rss
  const t0 = performance.now()
  for (let i = 0; i < iters; i++) { await fn(); const rss = process.memoryUsage().rss; if (rss > peakRss) peakRss = rss }
  const totalMs = performance.now() - t0
  obs.disconnect()
  return { msPerIter: totalMs / iters, gcCount, gcPauseMs, peakRssMb: peakRss / 1048576 }
}

import assert from 'node:assert/strict'
export function checkEquivalence (ref: { json: Buffer, csv: Buffer }, got: { json: Buffer, csv: Buffer }) {
  let jsonOk = false
  try { assert.deepEqual(JSON.parse(got.json.toString()), JSON.parse(ref.json.toString())); jsonOk = true } catch { jsonOk = false }
  return { jsonOk, csvOk: ref.csv.equals(got.csv) }   // JSON: deep-equal (key order irrelevant); CSV: byte-equal
}

export function printTable (rows: Array<{ substrate: string, task: string } & Measurement>): void {
  console.log('\nsubstrate'.padEnd(18) + 'task'.padEnd(8) + 'ms/iter'.padStart(10) + 'gc#'.padStart(7) + 'gcPause'.padStart(10) + 'peakRSS'.padStart(10))
  for (const r of rows) {
    console.log(r.substrate.padEnd(18) + r.task.padEnd(8) + r.msPerIter.toFixed(2).padStart(10) + String(r.gcCount).padStart(7) + (r.gcPauseMs.toFixed(1) + 'ms').padStart(10) + (r.peakRssMb.toFixed(0) + 'MB').padStart(10))
  }
}
```

> Note on the JSON gate: deep-equality across differing key order is what matters. Use the canonical form `assert.deepEqual(JSON.parse(a), JSON.parse(b))` in the real gate (Task 8 wires it per-row); the `checkEquivalence` helper above returns booleans for the table. If the canonicalization is awkward, the implementer may replace the `jsonOk` computation with a recursive deep-equal of the parsed arrays — the REQUIREMENT is "parsed JSON arrays are deep-equal", byte-equality is not required for JSON.

- [ ] **Step 3: Write `harness.test.ts`**

```ts
import assert from 'node:assert/strict'
import { measure } from './harness.ts'
const m = await measure(async () => { const a = []; for (let i = 0; i < 1000; i++) a.push({ i }); return a }, 2, 5)
assert.ok(m.msPerIter >= 0)
assert.ok(m.gcCount >= 0)
assert.ok(m.peakRssMb > 0)
console.log('harness.test OK', JSON.stringify(m))
```

- [ ] **Step 4: Run it**

Run: `NODE_CONFIG_DIR=api/config NODE_ENV=benchmark node --expose-gc --max-semi-space-size=8 --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/harness.test.ts`
Expected: prints `harness.test OK {...}`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add benchmark/src/streaming-parse/substrate.ts benchmark/src/streaming-parse/harness.ts benchmark/src/streaming-parse/harness.test.ts
git commit -m "bench(streaming): measurement harness (gc/rss/ms) + equivalence gate"
```

---

## Phase 1 — Substrates

Each substrate is a task ending in a correctness test asserting its `t2json`/`t2csv` match V8's on the `nested-multivalue` buffer (the hardest: flatten + multivalue + mixed types).

### Task 3: V8 baseline substrate (+ produces the reference)

**Files:**
- Create: `benchmark/src/streaming-parse/substrates/v8.ts`
- Test: `benchmark/src/streaming-parse/substrates/v8.test.ts`

**Interfaces:**
- Consumes: `Substrate` (Task 2), `Descriptor`, `csvCell`/`csvHeader` (Task 1).
- Produces: `export const v8: Substrate`, and `export function referenceOutput(buf, d): { json: Buffer, csv: Buffer }` (used by other substrate tests).

- [ ] **Step 1: Write `v8.ts`** (today's path: JSON.parse → build objects → JSON.stringify / shared CSV)

```ts
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// resolve a possibly-dotted key + multivalue join, matching flatten semantics
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) { v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source) }
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

function rows (buf: Buffer): any[] { return JSON.parse(buf.toString()).hits.hits }

export const v8: Substrate = {
  name: 'v8', available: true,
  async t1 (buf, d: Descriptor) {
    let sum = 0
    for (const hit of rows(buf)) {
      if (d.selectIncludesId) sum += hit._id.length
      for (const c of d.columns) { const v = extract(hit._source, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length }
    }
    return sum
  },
  async t2json (buf, d) {
    const out: any[] = []
    for (const hit of rows(buf)) {
      const o: Record<string, unknown> = {}
      if (d.selectIncludesId) o._id = hit._id
      for (const c of d.columns) o[c.outKey] = extract(hit._source, c.sourceKey, c.separator) ?? null
      out.push(o)
    }
    return Buffer.from(JSON.stringify(out))
  },
  async t2csv (buf, d) {
    let s = csvHeader(d.columns)
    for (const hit of rows(buf)) {
      s += d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'
    }
    return Buffer.from(s)
  }
}

export async function referenceOutput (buf: Buffer, d: Descriptor) {
  return { json: await v8.t2json(buf, d), csv: await v8.t2csv(buf, d) }
}
```

- [ ] **Step 2: Write `v8.test.ts`**

```ts
import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { v8 } from './v8.ts'
const { buf, descriptor } = makeBuffers(20).find(b => b.name === 'nested-multivalue')!
const json = JSON.parse((await v8.t2json(buf, descriptor)).toString())
assert.equal(json.length, 20)
assert.equal(json[0]['a.b'], 'deep-0')            // flatten
assert.equal(json[0].tags, 't0;t0;t0')            // multivalue join (i=0)
const csv = (await v8.t2csv(buf, descriptor)).toString()
assert.ok(csv.startsWith('"a.b","a.c","tags","label"\n'))
console.log('v8.test OK')
```

- [ ] **Step 3: Run it** — `node ... benchmark/src/streaming-parse/substrates/v8.test.ts` (same flags). Expected: `v8.test OK`.
- [ ] **Step 4: Commit** — `git commit -m "bench(streaming): v8 baseline substrate + reference output"`

---

### Task 4: `@streamparser/json` substrate

**Files:**
- Create: `benchmark/src/streaming-parse/substrates/streamparser.ts`, `streamparser.test.ts`
- Modify: `benchmark/package.json` (add `@streamparser/json` to devDependencies)

**Interfaces:**
- Consumes: `Substrate`, `Descriptor`, `csvCell`/`csvHeader`, `jsonRowFragment`, `referenceOutput` (Task 3).
- Produces: `export const streamparser: Substrate`.

- [ ] **Step 1: Add the dep** — hand-edit `benchmark/package.json` devDependencies to add `"@streamparser/json": "^0.0.22"` (latest 0.x), then `npm install`. Confirm `node_modules/@streamparser/json` exists.

- [ ] **Step 2: Write `streamparser.ts`** — drive the tokenizer at `hits.hits.*._source` and rebuild each row; emit via shared formatters.

```ts
import { JSONParser } from '@streamparser/json'
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// Emit one row's source object at a time using a value-path filter on hits.hits.*._source.
// paths: keep '$.hits.hits.*._source' -> onValue gives each _source object fully assembled.
function eachSource (buf: Buffer, onSource: (src: any) => void): void {
  const parser = new JSONParser({ paths: ['$.hits.hits.*._source'], keepStack: false })
  parser.onValue = ({ value }) => onSource(value as any)
  parser.write(buf)
  parser.end()
}
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}

export const streamparser: Substrate = {
  name: 'streamparser', available: true,
  async t1 (buf, d: Descriptor) {
    let sum = 0
    eachSource(buf, src => { for (const c of d.columns) { const v = extract(src, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length } })
    return sum
  },
  async t2json (buf, d) {
    let s = '['; let first = true
    eachSource(buf, src => {
      s += (first ? '' : ','); first = false
      let o = '{'; let f2 = true
      for (const c of d.columns) { if (!f2) o += ','; f2 = false; o += JSON.stringify(c.outKey) + ':' + JSON.stringify(extract(src, c.sourceKey, c.separator) ?? null) }
      s += o + '}'
    })
    return Buffer.from(s + ']')
  },
  async t2csv (buf, d) {
    let s = csvHeader(d.columns)
    eachSource(buf, src => { s += d.columns.map(c => csvCell(extract(src, c.sourceKey, c.separator), c.type)).join(',') + '\n' })
    return Buffer.from(s)
  }
}
```

> Note: `@streamparser/json`'s value-path filter still assembles each `_source` OBJECT (so it is "streaming across rows, DOM per row" — one row object alive at a time, not the whole array). That per-row-object cost is exactly what the bake-off is measuring. If the installed version's API differs (`paths` vs `emitPartialTokens`, `onValue` signature), adapt to the installed version's docs — the REQUIREMENT is: emit each `_source` once, hold at most one row at a time.

- [ ] **Step 3: Write `streamparser.test.ts`** — assert equivalence vs V8 on the nested buffer.

```ts
import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { referenceOutput } from './v8.ts'
import { streamparser } from './streamparser.ts'
const { buf, descriptor } = makeBuffers(20).find(b => b.name === 'nested-multivalue')!
const ref = await referenceOutput(buf, descriptor)
assert.deepEqual(JSON.parse((await streamparser.t2json(buf, descriptor)).toString()), JSON.parse(ref.json.toString()))
assert.ok((await streamparser.t2csv(buf, descriptor)).equals(ref.csv))
console.log('streamparser.test OK')
```

- [ ] **Step 4: Run it** (same flags). Expected: `streamparser.test OK`. If the JSON differs on `selectIncludesId` (`_id` lives outside `_source`), note it: this substrate reads only `_source`, so add `_id` handling by widening the path to `$.hits.hits.*` and reading `._id`/`._source` — adjust and re-run until equivalence holds.
- [ ] **Step 5: Commit** — `git commit -m "bench(streaming): @streamparser/json substrate"`

---

### Task 5: `jsonparse` substrate

**Files:**
- Create: `benchmark/src/streaming-parse/substrates/jsonparse.ts`, `jsonparse.test.ts`

**Interfaces:**
- Consumes: same as Task 4. Produces `export const jsonparse: Substrate`. (`jsonparse@1.3.1` already installed.)

- [ ] **Step 1: Write `jsonparse.ts`** — `jsonparse` is a SAX emitter that fires `onValue` at each completed value with a `.stack`/`.key` context. Drive it to capture each `_source` object.

```ts
import Parser from 'jsonparse'
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

// jsonparse fires onValue for EVERY completed value; we detect the completed _source objects
// by their stack depth/key: value.onValue with this.key === '_source' and this.stack path under hits.hits.
function eachSource (buf: Buffer, onSource: (src: any) => void): void {
  const p: any = new Parser()
  p.onValue = function (value: any) {
    // this.key is the key just closed; when we just closed a '_source' object under hits.hits[n]
    if (this.key === '_source' && value && typeof value === 'object') onSource(value)
  }
  p.write(buf)
}
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}
export const jsonparse: Substrate = {
  name: 'jsonparse', available: true,
  async t1 (buf, d: Descriptor) { let sum = 0; eachSource(buf, src => { for (const c of d.columns) { const v = extract(src, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length } }); return sum },
  async t2json (buf, d) { let s = '['; let first = true; eachSource(buf, src => { s += first ? '' : ','; first = false; let o = '{'; let f = true; for (const c of d.columns) { if (!f) o += ','; f = false; o += JSON.stringify(c.outKey) + ':' + JSON.stringify(extract(src, c.sourceKey, c.separator) ?? null) } s += o + '}' }); return Buffer.from(s + ']') },
  async t2csv (buf, d) { let s = csvHeader(d.columns); eachSource(buf, src => { s += d.columns.map(c => csvCell(extract(src, c.sourceKey, c.separator), c.type)).join(',') + '\n' }); return Buffer.from(s) }
}
```

> Note: `jsonparse` builds the full value tree internally (it accumulates objects/arrays and emits them), so it materializes each `_source` (and its parents) — again the per-row-object cost we are measuring. If `this.key === '_source'` also matches a nested field literally named `_source`, guard by also checking `this.stack` depth (top frames should be `hits`→`hits`→array index). Adjust until the equivalence test passes.

- [ ] **Step 2: Write `jsonparse.test.ts`** — same shape as Task 4 Step 3 but importing `jsonparse`. Assert `t2json` deep-equal and `t2csv` byte-equal vs `referenceOutput`. Print `jsonparse.test OK`.
- [ ] **Step 3: Run it** (same flags). Fix drive logic until equivalence holds.
- [ ] **Step 4: Commit** — `git commit -m "bench(streaming): jsonparse substrate"`

---

### Task 6: `stream-json` substrate

**Files:**
- Create: `benchmark/src/streaming-parse/substrates/streamjson.ts`, `streamjson.test.ts`

**Interfaces:**
- Consumes: same. Produces `export const streamjson: Substrate` (async, stream-pipeline based). (`stream-json@1.9.1` installed.)

- [ ] **Step 1: Write `streamjson.ts`** — `Pick` the `hits.hits` array then `streamArray` to get each hit; read `._source`.

```ts
import { parser } from 'stream-json'
import { pick } from 'stream-json/filters/Pick'
import { streamArray } from 'stream-json/streamers/StreamArray'
import { Readable } from 'node:stream'
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}
async function eachHit (buf: Buffer, onHit: (hit: any) => void): Promise<void> {
  const pipeline = Readable.from([buf]).pipe(parser()).pipe(pick({ filter: 'hits.hits' })).pipe(streamArray())
  for await (const { value } of pipeline) onHit(value)
}
export const streamjson: Substrate = {
  name: 'stream-json', available: true,
  async t1 (buf, d: Descriptor) { let sum = 0; await eachHit(buf, hit => { if (d.selectIncludesId) sum += String(hit._id).length; for (const c of d.columns) { const v = extract(hit._source, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length } }); return sum },
  async t2json (buf, d) { let s = '['; let first = true; await eachHit(buf, hit => { s += first ? '' : ','; first = false; let o = '{'; let f = true; if (d.selectIncludesId) { o += '"_id":' + JSON.stringify(hit._id); f = false } for (const c of d.columns) { if (!f) o += ','; f = false; o += JSON.stringify(c.outKey) + ':' + JSON.stringify(extract(hit._source, c.sourceKey, c.separator) ?? null) } s += o + '}' }); return Buffer.from(s + ']') },
  async t2csv (buf, d) { let s = csvHeader(d.columns); await eachHit(buf, hit => { s += d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n' }); return Buffer.from(s) }
}
```

> Note: `stream-json` emits `{key, value}` where `value` is the fully-materialized hit object — plus Node object-mode stream overhead per element. Both are exactly the costs under measurement; a poor result here is a legitimate finding, not a bug.

- [ ] **Step 2: Write `streamjson.test.ts`** — equivalence vs V8 on the nested buffer (note V8 emits `_id` first when `selectIncludesId`; match key set via deep-equal). Print `streamjson.test OK`.
- [ ] **Step 3: Run it** (same flags). Expected pass.
- [ ] **Step 4: Commit** — `git commit -m "bench(streaming): stream-json substrate"`

---

### Task 7: `simdjson` substrate (conditional native)

**Files:**
- Create: `benchmark/src/streaming-parse/substrates/simdjson.ts`, `simdjson.test.ts`
- Modify: `benchmark/package.json` (add `simdjson` to devDependencies, best-effort)

**Interfaces:**
- Consumes: same. Produces `export const simdjson: Substrate` with `available` reflecting whether the native module loaded.

- [ ] **Step 1: Attempt install** — add `"simdjson": "^0.9.2"` to `benchmark/package.json` devDeps and `npm install`. If it fails to build (native), STOP: set the substrate `available=false` (Step 2 handles it) and record the failure in the report; do not fight the build.

- [ ] **Step 2: Write `simdjson.ts`** — load lazily; if load throws, export an unavailable stub. Use the lazy/On-Demand API to pull only descriptor fields.

```ts
import type { Substrate } from '../substrate.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'

let lib: any = null; let available = true
try { lib = await import('simdjson') } catch { available = false }

function extractFrom (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}
// simdjson exposes lazyParse (tape) + valueForKeyPath, or parse() to a JS object. Prefer the lazy
// tape and pull only needed keys; fall back to parse() if the lazy API is unavailable in the version.
function hits (buf: Buffer): any[] {
  // Most simdjson node bindings return a plain object from parse(); we use that but ONLY read needed
  // fields so the win (if any) is from the fast SIMD parse, not building fewer objects.
  const doc = lib.parse(buf.toString())
  return doc.hits.hits
}
export const simdjson: Substrate = {
  name: 'simdjson', available,
  async t1 (buf, d: Descriptor) { if (!available) return 0; let sum = 0; for (const hit of hits(buf)) { for (const c of d.columns) { const v = extractFrom(hit._source, c.sourceKey, c.separator); sum += v == null ? 0 : String(v).length } } return sum },
  async t2json (buf, d) { if (!available) return Buffer.alloc(0); const out: any[] = []; for (const hit of hits(buf)) { const o: Record<string, unknown> = {}; if (d.selectIncludesId) o._id = hit._id; for (const c of d.columns) o[c.outKey] = extractFrom(hit._source, c.sourceKey, c.separator) ?? null; out.push(o) } return Buffer.from(JSON.stringify(out)) },
  async t2csv (buf, d) { if (!available) return Buffer.alloc(0); let s = csvHeader(d.columns); for (const hit of hits(buf)) s += d.columns.map(c => csvCell(extractFrom(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n'; return Buffer.from(s) }
}
```

> Note: if the installed `simdjson` exposes an On-Demand / `lazyParse` + `valueForKeyPath` API, prefer it (pull only `hits.hits[i]._source.<key>` off the tape without materializing the DOM) — that is the allocation win we're testing. If it only exposes `parse()` (full object), measure that (it's still a SIMD parse) and note in the report that the lazy path wasn't available. The `available=false` stub must let the bench run with simdjson simply skipped.

- [ ] **Step 3: Write `simdjson.test.ts`** — if `simdjson.available`, assert equivalence vs V8; else print `simdjson.test SKIP (unavailable)` and exit 0.

```ts
import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { referenceOutput } from './v8.ts'
import { simdjson } from './simdjson.ts'
if (!simdjson.available) { console.log('simdjson.test SKIP (unavailable)'); process.exit(0) }
const { buf, descriptor } = makeBuffers(20).find(b => b.name === 'nested-multivalue')!
const ref = await referenceOutput(buf, descriptor)
assert.deepEqual(JSON.parse((await simdjson.t2json(buf, descriptor)).toString()), JSON.parse(ref.json.toString()))
assert.ok((await simdjson.t2csv(buf, descriptor)).equals(ref.csv))
console.log('simdjson.test OK')
```

- [ ] **Step 4: Run it** (same flags). Expected: `simdjson.test OK` or `SKIP`.
- [ ] **Step 5: Commit** — `git commit -m "bench(streaming): simdjson substrate (conditional)"`

---

## Phase 2 — Run, capture real data, Alpine gate, results

### Task 8: Bench entrypoint — run all substrates × buffers × tasks, gate, table

**Files:**
- Create: `benchmark/src/streaming-parse/bench.ts`
- Modify: `benchmark/package.json` (add script `"benchmark-streaming"`)

**Interfaces:**
- Consumes: all substrates, `makeBuffers`, `measure`, `printTable`, `referenceOutput`.

- [ ] **Step 1: Write `bench.ts`**

```ts
import { makeBuffers } from './buffers.ts'
import { measure, printTable, type Measurement } from './harness.ts'
import { referenceOutput, v8 } from './substrates/v8.ts'
import { streamparser } from './substrates/streamparser.ts'
import { jsonparse } from './substrates/jsonparse.ts'
import { streamjson } from './substrates/streamjson.ts'
import { simdjson } from './substrates/simdjson.ts'
import assert from 'node:assert/strict'

const substrates = [v8, streamparser, jsonparse, streamjson, simdjson].filter(s => s.available)
const buffers = makeBuffers(Number(process.env.ROWS || 10000))
const table: Array<{ substrate: string, task: string } & Measurement> = []

for (const nb of buffers) {
  console.log(`\n=== buffer: ${nb.name} (${nb.descriptor.columns.length} cols) ===`)
  const ref = await referenceOutput(nb.buf, nb.descriptor)
  for (const s of substrates) {
    // correctness gate (skip v8 vs itself)
    if (s.name !== 'v8') {
      try {
        assert.deepEqual(JSON.parse((await s.t2json(nb.buf, nb.descriptor)).toString()), JSON.parse(ref.json.toString()))
        assert.ok((await s.t2csv(nb.buf, nb.descriptor)).equals(ref.csv))
      } catch (e) { console.log(`  ${s.name}: DISQUALIFIED (output mismatch on ${nb.name}) — ${e}`); continue }
    }
    table.push({ substrate: s.name, task: `${nb.name}/T1`, ...(await measure(() => s.t1(nb.buf, nb.descriptor))) })
    table.push({ substrate: s.name, task: `${nb.name}/json`, ...(await measure(() => s.t2json(nb.buf, nb.descriptor))) })
    table.push({ substrate: s.name, task: `${nb.name}/csv`, ...(await measure(() => s.t2csv(nb.buf, nb.descriptor))) })
  }
}
printTable(table)
```

- [ ] **Step 2: Add the script** — in `benchmark/package.json` scripts add:
`"benchmark-streaming": "node --expose-gc --max-semi-space-size=8 --experimental-strip-types --disable-warning=ExperimentalWarning src/streaming-parse/bench.ts"`

- [ ] **Step 3: Run the full bench**

Run (from repo root): `NODE_CONFIG_DIR=api/config NODE_ENV=benchmark node --expose-gc --max-semi-space-size=8 --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/bench.ts`
Expected: per-buffer sections, no DISQUALIFIED lines, and a final table with V8 as the reference row. Capture the output.

- [ ] **Step 4: Commit** — `git add benchmark/src/streaming-parse/bench.ts benchmark/package.json && git commit -m "bench(streaming): entrypoint runs all substrates x buffers x tasks with gate"`

---

### Task 9: Real ES buffer capture + add to the bench

**Files:**
- Create: `benchmark/src/streaming-parse/capture-real.ts`, `benchmark/src/streaming-parse/fixtures/.gitignore`
- Modify: `benchmark/src/streaming-parse/buffers.ts` (load the fixture if present)

**Interfaces:**
- Produces: a saved `fixtures/real-<dataset>.json` buffer; `makeBuffers` includes a `real` entry when the fixture exists.

- [ ] **Step 1: Ensure fixtures exist** — run `npm run dev-fixtures` (seeds `dev_fixtures` org with datasets) if not already seeded. (Dev services must be up; ES on `:27664`.)

- [ ] **Step 2: Write `capture-real.ts`** — query the dev ES `_search` directly for a fixtures dataset index and save the raw response bytes.

```ts
import fs from 'node:fs'
import path from 'node:path'
const ES = `http://localhost:${process.env.ES_PORT || '27664'}`
const index = process.env.CAPTURE_INDEX // e.g. 'dataset-development-<id>'
if (!index) { console.error('set CAPTURE_INDEX to a fixtures dataset ES index (see: curl $ES/_cat/indices)'); process.exit(1) }
const res = await fetch(`${ES}/${index}/_search`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ size: 10000, query: { match_all: {} } }) })
const buf = Buffer.from(await res.arrayBuffer())
const dir = path.resolve(import.meta.dirname, 'fixtures'); fs.mkdirSync(dir, { recursive: true })
const out = path.join(dir, 'real-capture.json'); fs.writeFileSync(out, buf)
console.log(`saved ${buf.length} bytes to ${out} (${JSON.parse(buf.toString()).hits.hits.length} hits)`)
```

- [ ] **Step 3: Run capture** — `curl -s localhost:27664/_cat/indices | grep dataset` to find an index, then `CAPTURE_INDEX=<index> node --experimental-strip-types ... benchmark/src/streaming-parse/capture-real.ts`. Confirm the file is saved with >0 hits.

- [ ] **Step 4: Load the fixture in `buffers.ts`** — append to `makeBuffers`: if `fixtures/real-capture.json` exists, read it, derive a descriptor from its first hit's `_source` keys (all `type:'string'` unless the value is a number/boolean), and push `{ name: 'real', buf, descriptor }`.

```ts
// at top of buffers.ts add: import fs from 'node:fs'; import path from 'node:path'
// inside makeBuffers, before the return, build an optional real entry:
const realPath = path.resolve(import.meta.dirname, 'fixtures', 'real-capture.json')
const extra: NamedBuffer[] = []
if (fs.existsSync(realPath)) {
  const buf = fs.readFileSync(realPath)
  const first = JSON.parse(buf.toString()).hits.hits[0]?._source ?? {}
  const schema = Object.keys(first).map(k => ({ key: k, type: typeof first[k] === 'number' ? 'number' : typeof first[k] === 'boolean' ? 'boolean' : 'string' }))
  extra.push({ name: 'real', buf, descriptor: schemaToDescriptor(schema, false) })
}
// return [...the four synthetic..., ...extra]
```

- [ ] **Step 5: Write `fixtures/.gitignore`** with `real-capture.json` (don't commit potentially large/real data; keep the capture reproducible via the script).
- [ ] **Step 6: Re-run the bench** (Task 8 Step 3) — confirm a `real` section appears and passes the gate. Capture output.
- [ ] **Step 7: Commit** — `git add benchmark/src/streaming-parse/capture-real.ts benchmark/src/streaming-parse/buffers.ts benchmark/src/streaming-parse/fixtures/.gitignore && git commit -m "bench(streaming): real ES buffer capture + inclusion"`

---

### Task 10: simdjson Alpine/musl validation (only if simdjson was available in Task 7)

**Files:**
- Create: `benchmark/src/streaming-parse/alpine-check/Dockerfile`, `benchmark/src/streaming-parse/alpine-check/check.mjs`

**Interfaces:** produces a pass/fail on whether `simdjson` loads + runs a parse on Alpine/musl.

- [ ] **Step 1: If simdjson was `available=false` in Task 7**, SKIP this task — write one line in the results (Task 11) that the Alpine gate is N/A because simdjson didn't build in dev. Otherwise continue.

- [ ] **Step 2: Write `alpine-check/check.mjs`**

```js
import simdjson from 'simdjson'
const doc = simdjson.parse(JSON.stringify({ hits: { hits: [{ _source: { a: 1, b: 'x' } }] } }))
if (doc.hits.hits[0]._source.b !== 'x') { console.error('simdjson wrong result'); process.exit(1) }
console.log('simdjson OK on', process.platform, process.arch)
```

- [ ] **Step 3: Write `alpine-check/Dockerfile`** (match the project's node major; install build tools for the native compile on musl)

```dockerfile
FROM node:22-alpine
RUN apk add --no-cache python3 make g++ 
WORKDIR /app
RUN npm init -y >/dev/null 2>&1 && npm install simdjson@^0.9.2
COPY check.mjs .
CMD ["node", "check.mjs"]
```

- [ ] **Step 4: Build + run the check**

Run: `docker build -t simdjson-musl-check benchmark/src/streaming-parse/alpine-check && docker run --rm simdjson-musl-check`
Expected: prints `simdjson OK on linux x64`. If the `npm install`/build fails on Alpine or the run fails to load the binding, RECORD that: simdjson is NOT shippable on our Alpine image (dev-only), which disqualifies it as a production substrate regardless of its dev benchmark.

- [ ] **Step 5: Commit** — `git add benchmark/src/streaming-parse/alpine-check && git commit -m "bench(streaming): simdjson Alpine/musl validation gate"`

---

### Task 11: Results writeup + recommendation

**Files:**
- Create: `benchmark/results/streaming-parse-bakeoff.md`

- [ ] **Step 1: Write the results doc** with: the environment (node version, flags, machine), the full ranked table (substrate × buffer × {T1,json,csv}: ms/iter, gc#, gcPause, peakRSS) from Task 8/9, the correctness-gate status (which substrates were disqualified, if any), the simdjson dev result + the Alpine gate outcome (Task 10), and — applying the §7 decision rule — a clear **recommendation**: which substrate (if any) clears "≥30% T1 GC-pause cut vs V8 at ≤1.5× ms/iter", or an honest **negative verdict**. If negative, state the next step (Arrow/ES|QL second track, or stop) per the spec.

- [ ] **Step 2: Cross-check** every number in the doc against the captured bench output (do not invent). Note run-to-run variance.

- [ ] **Step 3: Commit** — `git add benchmark/results/streaming-parse-bakeoff.md && git commit -m "docs(streaming): substrate bake-off results + recommendation"`

---

## Self-Review

**Spec coverage:** §3 uniform task (T1/T2, descriptor, gate) → Tasks 1,3,8. §4 substrates (V8, streamparser, jsonparse, stream-json, simdjson) → Tasks 3–7. §5 workload (synthetic axes + real capture) → Tasks 1,9. §6 metrics (GC/RSS/ms) + native/Alpine gate → Tasks 2,7,10. §7 decision rule + outcomes → Task 11. §8 deliverables/layout → all. Arrow second track is explicitly out of scope (§2 non-goal) — no task, correct.

**Placeholder scan:** no TBD/TODO; every code step has real code; run commands are concrete with the exact flags; equivalence assertions are real. The one judgment-laden spot (parser API drift for `@streamparser/json`/`jsonparse`/`simdjson` versions) is called out with the exact REQUIREMENT to satisfy, not left vague.

**Type consistency:** `Substrate` (`t1/t2json/t2csv` async, `available`), `Descriptor`/`Column` (`sourceKey/outKey/type/separator`), `Measurement` (`msPerIter/gcCount/gcPauseMs/peakRssMb`), `NamedBuffer` (`name/buf/descriptor`), `referenceOutput(buf,d)→{json,csv}` are used identically across Tasks 1–11. `extract`/`extractFrom` helper is duplicated per substrate deliberately (each substrate file is self-contained; DRY-ing it into a shared module is fine if the implementer prefers — note it, don't block).

**Known deferrals (not gaps):** JIT-compiled consumers (spec non-goal — applied to the winner later); Arrow/ES|QL track (spec second track); the streaming endpoint itself (next effort). Async substrate interface adds small per-iter promise overhead applied uniformly to all substrates (including V8), so it does not bias the comparison.
