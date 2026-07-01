# End-to-end streaming parse pipeline experiment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Measure whether streaming the ES hits (byte-split envelope + batched `JSON.parse` + streamed serialize) cuts PEAK memory and GC-pause vs the buffered V8 path at ≤~1.5× CPU, and find the batch-size sweet spot.

**Architecture:** A self-contained experiment under `benchmark/src/streaming-parse/streaming/`, reusing the bake-off's descriptor, synthetic buffers, `csvCell`/`csvHeader`, and V8 oracle. A byte-stream splitter yields hit slices; a pipeline parses them in batches of K, transforms, and streams output to a sink. Measured on instrumented peak memory, GC-pause, ms/iter, plus a capped-heap survival test.

**Tech Stack:** Node (`--experimental-strip-types`, `--expose-gc`, `--max-old-space-size`), TypeScript run directly; `perf_hooks`; `node:child_process` for the survival test.

## Global Constraints

- **Location:** everything under `benchmark/src/streaming-parse/streaming/`; results in `benchmark/results/streaming-pipeline-experiment.md`. Do NOT touch production code (`api/`).
- **Reuse the bake-off** (`benchmark/src/streaming-parse/`): `descriptor.ts` (`Descriptor`, `schemaToDescriptor`), `buffers.ts` (`makeBuffers`, `NamedBuffer`), `csv-format.ts` (`csvCell`, `csvHeader`), `substrates/v8.ts` (`referenceOutput`). Do NOT reinvent them.
- **Metric focus = PEAK + GC, not total bytes.** The bake-off already showed total-bytes can't beat V8; this experiment is about peak memory and GC cost.
- **Batch sizes K ∈ {1, 100, 1000, Infinity}** (Infinity = whole = degenerate single parse).
- **Correctness gate:** every streaming variant's output must be deep-equal (JSON) / byte-equal (CSV) to the buffered-V8 reference on every buffer, or it is disqualified (not measured).
- **Run convention (repo root):** `node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/streaming/<file>.ts`. NO `NODE_CONFIG_DIR` needed (these files don't import `#config`).
- **Commit type:** commitlint REJECTS `bench:` — use `perf:` / `test:` / `docs:`. `.ts` import extensions. Match lint (`@stylistic/*`, `import-x/first`, lowercase subject).
- **Determinism:** seeded generators from `seed.ts` only; no `Math.random`/`Date.now` in data generation.
- **Decision rule:** streaming wins if some K cuts peak ≥2× vs buffered-V8 (and/or survives the capped-heap test where buffered OOMs) at ≤~1.5× ms/iter, GC-pause no worse. Negative verdict is acceptable.

---

## File Structure

- `benchmark/src/streaming-parse/streaming/splitter.ts` — incremental byte-stream hit splitter.
- `benchmark/src/streaming-parse/streaming/splitter.test.ts` — fuzz tests vs `JSON.parse` of the whole.
- `benchmark/src/streaming-parse/streaming/pipeline.ts` — `bufferedV8` baseline + `streaming(K)` variant + `Sink`/`collectSink` + `chunked` source.
- `benchmark/src/streaming-parse/streaming/pipeline.test.ts` — equivalence of streaming vs buffered-V8.
- `benchmark/src/streaming-parse/streaming/bench.ts` — peak/GC/ms table with the gate.
- `benchmark/src/streaming-parse/streaming/survival.ts` — one-variant runner for the capped-heap child-process test.
- `benchmark/src/streaming-parse/streaming/survival-run.ts` — spawns survival.ts under `--max-old-space-size` per variant, reports survive/OOM.
- `benchmark/src/streaming-parse/streaming/real-es.ts` — (optional) validate the splitter against a live ES `asStream`.
- `benchmark/results/streaming-pipeline-experiment.md` — results + verdict.

---

## Task 1: Incremental byte-stream hit splitter (+ fuzz tests)

The crux. A state machine that, fed byte chunks of an ES `_search` response, extracts `total` and emits each hit object as a byte slice — correctly across chunk boundaries, strings, escapes, and nested braces.

**Files:**
- Create: `benchmark/src/streaming-parse/streaming/splitter.ts`, `splitter.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HitSplitter { write(chunk: Buffer): void; end(): void; total: number | null }
  export function createHitSplitter(onHit: (hitBytes: Buffer) => void): HitSplitter
  ```

- [ ] **Step 1: Write the fuzz test first** (`splitter.test.ts`)

```ts
import assert from 'node:assert/strict'
import { createHitSplitter } from './splitter.ts'

// deterministic PRNG
function mulberry32 (seed: number) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }

function genHit (r: () => number, i: number) {
  // include tricky content: braces/brackets in strings, escaped quotes, unicode
  return {
    _id: `id-${i}`, _score: null, sort: [i],
    _source: {
      a: { b: `deep "${i}" }{`, c: i },
      tags: [`t${i % 3}`, `x]y`, `q\\z`],
      label: r() < 0.5 ? `line\nbreak ★ ${i}` : `plain ${i}`,
      n: Math.floor(r() * 1e6), f: (r() - 0.5) * 1000, nul: null
    }
  }
}
function envelope (hits: any[]) {
  return Buffer.from(JSON.stringify({ took: 3, timed_out: false, _shards: { total: 1 }, hits: { total: { value: hits.length, relation: 'eq' }, max_score: null, hits } }))
}

for (let seed = 1; seed <= 200; seed++) {
  const r = mulberry32(seed)
  const n = Math.floor(r() * 40)
  const hits = Array.from({ length: n }, (_, i) => genHit(r, i))
  const buf = envelope(hits)
  const chunkSize = 1 + Math.floor(r() * 64)   // tiny random chunks to stress boundaries
  const got: any[] = []
  const sp = createHitSplitter(b => got.push(JSON.parse(b.toString())))
  for (let i = 0; i < buf.length; i += chunkSize) sp.write(buf.subarray(i, i + chunkSize))
  sp.end()
  assert.deepEqual(got, hits, `hits seed ${seed} (n=${n}, chunk=${chunkSize})`)
  assert.equal(sp.total, n, `total seed ${seed}`)
}
console.log('splitter.test OK')
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/streaming/splitter.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement `splitter.ts`**

```ts
export interface HitSplitter { write(chunk: Buffer): void, end(): void, total: number | null }

// bytes
const QUOTE = 0x22, BACKSLASH = 0x5c, OBRACE = 0x7b, CBRACE = 0x7d, CBRACKET = 0x5d

// Find the index just AFTER the hits-array '[' in the accumulated prefix. Returns -1 if not yet seen.
// ES envelope: the only `"hits":[` before any hit data is the real hits array (took/_shards/total
// don't contain it). We match the byte sequence `"hits"` <ws>* `:` <ws>* `[`.
function findHitsArrayStart (b: Buffer): number {
  const needle = Buffer.from('"hits"')
  let from = 0
  for (;;) {
    const idx = b.indexOf(needle, from)
    if (idx === -1) return -1
    let j = idx + needle.length
    while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++
    if (j < b.length && b[j] === 0x3a /* : */) {
      j++
      while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++
      if (j < b.length && b[j] === 0x5b /* [ */) return j + 1
      // `"hits":{...}` (the outer hits object) — keep scanning for the inner `"hits":[`
    }
    from = idx + needle.length
  }
}
function extractTotal (b: Buffer): number | null {
  const s = b.toString('latin1')
  let m = /"total"\s*:\s*\{\s*"value"\s*:\s*(\d+)/.exec(s)
  if (m) return Number(m[1])
  m = /"total"\s*:\s*(\d+)/.exec(s)
  return m ? Number(m[1]) : null
}

export function createHitSplitter (onHit: (hitBytes: Buffer) => void): HitSplitter {
  let phase: 'prefix' | 'array' | 'done' = 'prefix'
  let prefix: Buffer = Buffer.alloc(0)
  let total: number | null = null
  let cur: Buffer = Buffer.alloc(0)   // unconsumed array-phase bytes
  let pos = 0                         // scan cursor within cur
  let depth = 0
  let inString = false
  let escape = false
  let hitStart = -1                   // index in cur where the in-progress hit began, or -1

  const scanArray = (chunk: Buffer) => {
    cur = cur.length ? Buffer.concat([cur, chunk]) : chunk
    let lastEmitEnd = 0
    while (pos < cur.length) {
      const c = cur[pos]
      if (inString) {
        if (escape) escape = false
        else if (c === BACKSLASH) escape = true
        else if (c === QUOTE) inString = false
      } else if (c === QUOTE) inString = true
      else if (c === OBRACE) { if (depth === 0) hitStart = pos; depth++ }
      else if (c === CBRACE) { depth--; if (depth === 0) { onHit(cur.subarray(hitStart, pos + 1)); lastEmitEnd = pos + 1; hitStart = -1 } }
      else if (c === CBRACKET && depth === 0) { phase = 'done'; break }
      pos++
    }
    // compact: keep from the in-progress hit start, else drop everything consumed
    const keepFrom = hitStart >= 0 ? hitStart : lastEmitEnd
    if (keepFrom > 0) { cur = cur.subarray(keepFrom); pos -= keepFrom; if (hitStart >= 0) hitStart -= keepFrom }
  }

  return {
    get total () { return total },
    write (chunk: Buffer) {
      if (phase === 'done') return
      if (phase === 'prefix') {
        prefix = prefix.length ? Buffer.concat([prefix, chunk]) : chunk
        const start = findHitsArrayStart(prefix)
        if (start === -1) return
        total = extractTotal(prefix)
        const rest = prefix.subarray(start)
        prefix = Buffer.alloc(0)
        phase = 'array'
        scanArray(rest)
        return
      }
      scanArray(chunk)
    },
    end () { phase = 'done' }
  }
}
```

- [ ] **Step 4: Run the fuzz test; iterate until GREEN**

Run: `node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/streaming/splitter.test.ts`
Expected: `splitter.test OK`. If a seed fails, it prints the seed/n/chunk — reproduce by narrowing the loop, fix the boundary/compaction logic, re-run. (The `latin1` in `extractTotal` is intentional: `total` digits are ASCII, and we only scan the small prefix.)

- [ ] **Step 5: Commit**

```bash
git add benchmark/src/streaming-parse/streaming/splitter.ts benchmark/src/streaming-parse/streaming/splitter.test.ts
git commit -m "perf(streaming): incremental ES hits byte-splitter + fuzz tests"
```

---

## Task 2: Pipeline — buffered-V8 baseline + streaming(K) variant + equivalence

**Files:**
- Create: `benchmark/src/streaming-parse/streaming/pipeline.ts`, `pipeline.test.ts`

**Interfaces:**
- Consumes: `createHitSplitter` (Task 1), `Descriptor` + `csvCell`/`csvHeader` + `referenceOutput` (bake-off).
- Produces:
  ```ts
  export interface Sink { write(bytes: string): void }
  export function collectSink(): { sink: Sink, get(): Buffer }
  export function nullSink(): Sink                       // counts bytes, discards
  export function chunked(buf: Buffer, chunkSize?: number): Buffer[]
  export function bufferedV8(buf: Buffer, d: Descriptor, format: 'json'|'csv', sink: Sink, sample: () => void): void
  export function streaming(chunks: Buffer[], d: Descriptor, format: 'json'|'csv', K: number, sink: Sink, sample: () => void): void
  ```

- [ ] **Step 1: Write the equivalence test** (`pipeline.test.ts`)

```ts
import assert from 'node:assert/strict'
import { makeBuffers } from '../buffers.ts'
import { referenceOutput } from '../substrates/v8.ts'
import { chunked, streaming, collectSink } from './pipeline.ts'

const noop = () => {}
for (const nb of makeBuffers(50)) {
  const ref = referenceOutput(nb.buf, nb.descriptor)
  for (const K of [1, 7, 100, Infinity]) {
    const js = collectSink(); streaming(chunked(nb.buf, 17), nb.descriptor, 'json', K, js.sink, noop)
    assert.deepEqual(JSON.parse(js.get().toString()), JSON.parse(ref.json.toString()), `${nb.name} json K=${K}`)
    const csv = collectSink(); streaming(chunked(nb.buf, 17), nb.descriptor, 'csv', K, csv.sink, noop)
    assert.ok(csv.get().equals(ref.csv), `${nb.name} csv K=${K}`)
  }
}
console.log('pipeline.test OK')
```

- [ ] **Step 2: Run to verify it fails** (module not found).

- [ ] **Step 3: Implement `pipeline.ts`**

```ts
import { createHitSplitter } from './splitter.ts'
import type { Descriptor } from '../descriptor.ts'
import { csvCell, csvHeader } from '../csv-format.ts'
import { referenceOutput } from '../substrates/v8.ts'

export interface Sink { write (bytes: string): void }
export function collectSink () { const parts: string[] = []; return { sink: { write: (b: string) => parts.push(b) }, get: () => Buffer.from(parts.join('')) } }
export function nullSink (): Sink { let n = 0; return { write: (b: string) => { n += b.length } } }
export function chunked (buf: Buffer, chunkSize = 65536): Buffer[] { const out: Buffer[] = []; for (let i = 0; i < buf.length; i += chunkSize) out.push(buf.subarray(i, i + chunkSize)); return out.length ? out : [buf.subarray(0, 0)] }

// shared with the bake-off v8 substrate semantics (flatten + multivalue join)
function extract (source: any, sourceKey: string, separator: string | null): unknown {
  let v = source[sourceKey]
  if (v === undefined && sourceKey.includes('.')) v = sourceKey.split('.').reduce((o, k) => (o == null ? o : o[k]), source)
  if (separator != null && Array.isArray(v)) return v.map(x => (x == null ? '' : typeof x === 'string' ? x : String(x))).join(separator)
  return v
}
function emitRowJson (sink: Sink, first: boolean, hit: any, d: Descriptor) {
  let o = first ? '{' : ',{'; let f = true
  if (d.selectIncludesId) { o += '"_id":' + JSON.stringify(hit._id); f = false }
  for (const c of d.columns) { if (!f) o += ','; f = false; o += JSON.stringify(c.outKey) + ':' + JSON.stringify(extract(hit._source, c.sourceKey, c.separator) ?? null) }
  sink.write(o + '}')
}
function emitRowCsv (sink: Sink, hit: any, d: Descriptor) {
  sink.write(d.columns.map(c => csvCell(extract(hit._source, c.sourceKey, c.separator), c.type)).join(',') + '\n')
}

// current path: parse whole -> build all -> stringify whole
export function bufferedV8 (buf: Buffer, d: Descriptor, format: 'json' | 'csv', sink: Sink, sample: () => void): void {
  const out = referenceOutput(buf, d)      // parses whole + builds all + serializes whole
  sample()                                 // high-water: everything materialized at once
  sink.write((format === 'csv' ? out.csv : out.json).toString())
}

// streaming: split -> batch K hits -> JSON.parse batch -> transform -> serialize -> drop
export function streaming (chunks: Buffer[], d: Descriptor, format: 'json' | 'csv', K: number, sink: Sink, sample: () => void): void {
  if (format === 'csv') sink.write(csvHeader(d.columns))
  else sink.write('[')
  let firstRow = true
  let batch: Buffer[] = []
  const flush = () => {
    if (!batch.length) return
    const arr = JSON.parse('[' + batch.map(b => b.toString()).join(',') + ']')  // K hits materialized
    for (const hit of arr) {
      if (format === 'csv') emitRowCsv(sink, hit, d)
      else { emitRowJson(sink, firstRow, hit, d); firstRow = false }
    }
    batch = []
    sample()                               // high-water: only K hits live here
  }
  const sp = createHitSplitter(hitBytes => { batch.push(Buffer.from(hitBytes)); if (batch.length >= K) flush() })
  for (const c of chunks) sp.write(c)
  sp.end()
  flush()
  if (format !== 'csv') sink.write(']')
}
```

> Note: `Buffer.from(hitBytes)` copies the slice out of the splitter's `cur` (which it compacts/reuses), so batched slices stay valid until flush. K=Infinity collects all before one parse (the degenerate high-peak case). `bufferedV8` samples once (all materialized); `streaming` samples per flush (≤K hits live).

- [ ] **Step 4: Run the equivalence test; iterate until GREEN**

Run: `node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/streaming/pipeline.test.ts`
Expected: `pipeline.test OK` (streaming output deep-equal/byte-equal to buffered-V8 for all buffers × K).

- [ ] **Step 5: Commit** — `git commit -m "perf(streaming): buffered-v8 baseline + streaming(K) pipeline + equivalence"`

---

## Task 3: Bench — peak / GC-pause / ms with the equivalence gate

**Files:**
- Create: `benchmark/src/streaming-parse/streaming/bench.ts`
- Modify: `benchmark/package.json` (add script `"benchmark-streaming-pipeline"`)

**Interfaces:** Consumes all of Task 2 + `makeBuffers` + `perf_hooks`.

- [ ] **Step 1: Write `bench.ts`**

```ts
import { PerformanceObserver } from 'node:perf_hooks'
import { makeBuffers } from '../buffers.ts'
import { referenceOutput } from '../substrates/v8.ts'
import { chunked, streaming, bufferedV8, collectSink, nullSink } from './pipeline.ts'
import assert from 'node:assert/strict'

const ROWS = Number(process.env.ROWS || 10000)
const CHUNK = Number(process.env.CHUNK || 65536)
const mem = () => { const m = process.memoryUsage(); return m.heapUsed + m.external + m.arrayBuffers }

// run one variant once, sampling peak at its high-water points; return { peakMb, ms, gcMs }
function measureRun (run: (sample: () => void) => void) {
  global.gc?.()
  const base = mem(); let peak = base
  const sample = () => { const v = mem(); if (v > peak) peak = v }
  let gcMs = 0
  const obs = new PerformanceObserver(l => { for (const e of l.getEntries()) gcMs += e.duration })
  obs.observe({ entryTypes: ['gc'] })
  const t0 = performance.now(); run(sample); const ms = performance.now() - t0
  obs.disconnect()
  sample()
  return { peakMb: (peak - base) / 1048576, ms, gcMs }
}
const median = (xs: number[]) => xs.slice().sort((a, b) => a - b)[Math.floor(xs.length / 2)]

const variants: Array<{ name: string, run: (buf: Buffer, chunks: Buffer[], d: any, sample: () => void) => void }> = [
  { name: 'buffered-v8', run: (buf, _c, d, s) => bufferedV8(buf, d, 'json', nullSink(), s) },
  ...[1, 100, 1000, Infinity].map(K => ({ name: `stream-K${K === Infinity ? 'whole' : K}`, run: (_b: Buffer, c: Buffer[], d: any, s: () => void) => streaming(c, d, 'json', K, nullSink(), s) }))
]

for (const nb of makeBuffers(ROWS)) {
  console.log(`\n=== ${nb.name} (${nb.descriptor.columns.length} cols, ${ROWS} rows) ===`)
  const ref = referenceOutput(nb.buf, nb.descriptor)
  const chunks = chunked(nb.buf, CHUNK)
  console.log('variant'.padEnd(16) + 'peakMB'.padStart(9) + 'ms/iter'.padStart(10) + 'gcMs'.padStart(9))
  for (const v of variants) {
    // gate (skip buffered-v8 vs itself): streaming output must equal buffered-V8
    if (v.name !== 'buffered-v8') {
      const js = collectSink(); streaming(chunks, nb.descriptor, 'json', v.name.endsWith('whole') ? Infinity : Number(v.name.slice(8)), js.sink, () => {})
      try { assert.deepEqual(JSON.parse(js.get().toString()), JSON.parse(ref.json.toString())) } catch { console.log(`${v.name}: DISQUALIFIED`); continue }
    }
    const runs = Array.from({ length: 5 }, () => measureRun(s => v.run(nb.buf, chunks, nb.descriptor, s)))
    console.log(v.name.padEnd(16) + median(runs.map(r => r.peakMb)).toFixed(1).padStart(9) + median(runs.map(r => r.ms)).toFixed(1).padStart(10) + median(runs.map(r => r.gcMs)).toFixed(1).padStart(9))
  }
}
```

- [ ] **Step 2: Add the script** — in `benchmark/package.json` scripts:
`"benchmark-streaming-pipeline": "node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning src/streaming-parse/streaming/bench.ts"`

- [ ] **Step 3: Run it (2–3×), capture output**

Run: `node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/streaming/bench.ts`
Expected: per-buffer tables, no DISQUALIFIED, `buffered-v8` peak MB clearly HIGHER than small-K streaming (the core hypothesis), with streaming ms within ~1.5×. Capture the numbers; note run-to-run variance. If small-K streaming does NOT show a lower peak, that is a real finding — report it (do not massage).

- [ ] **Step 4: Commit** — `git add ... && git commit -m "perf(streaming): peak/gc/ms bench for streaming pipeline vs buffered v8"`

---

## Task 4: Capped-heap survival test (the robust demonstration)

Run each variant in a CHILD process under a small `--max-old-space-size` on a large payload; record survive vs OOM. Buffered-V8 should OOM where small-K streaming survives.

**Files:**
- Create: `benchmark/src/streaming-parse/streaming/survival.ts`, `survival-run.ts`

**Interfaces:** `survival.ts` reads `argv` `[variant, rows]`, builds the buffer, runs the variant to a `nullSink`, exits 0 on success (non-zero/crash on OOM). `survival-run.ts` spawns it per variant.

- [ ] **Step 1: Write `survival.ts`**

```ts
import { makeBuffers } from '../buffers.ts'
import { chunked, streaming, bufferedV8, nullSink } from './pipeline.ts'
const [variant, rowsStr] = process.argv.slice(2)
const rows = Number(rowsStr || 200000)
// use the string-heavy buffer (largest per-row payload) to force memory pressure
const nb = makeBuffers(rows).find(b => b.name === 'string-heavy')!
if (variant === 'buffered-v8') bufferedV8(nb.buf, nb.descriptor, 'json', nullSink(), () => {})
else streaming(chunked(nb.buf, 65536), nb.descriptor, 'json', variant === 'whole' ? Infinity : Number(variant), nullSink(), () => {})
console.log('OK')
```

- [ ] **Step 2: Write `survival-run.ts`**

```ts
import { spawnSync } from 'node:child_process'
const HEAP = process.env.HEAP || '128'
const ROWS = process.env.ROWS || '200000'
const script = new URL('./survival.ts', import.meta.url).pathname
console.log(`capped-heap survival: --max-old-space-size=${HEAP}MB, ${ROWS} rows (string-heavy)`)
for (const variant of ['buffered-v8', 'whole', '1000', '100', '1']) {
  const r = spawnSync(process.execPath, ['--max-old-space-size=' + HEAP, '--experimental-strip-types', '--disable-warning=ExperimentalWarning', script, variant, ROWS], { encoding: 'utf8' })
  const ok = r.status === 0 && /OK/.test(r.stdout || '')
  const oom = /heap out of memory|Allocation failed/i.test((r.stderr || '') + (r.stdout || ''))
  console.log(`  ${variant.padEnd(12)} ${ok ? 'SURVIVED' : oom ? 'OOM' : 'FAILED(' + r.status + ')'}`)
}
```

- [ ] **Step 3: Run it; tune ROWS/HEAP so buffered-v8 OOMs and small-K survives**

Run: `node --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/streaming/survival-run.ts`
Expected: `buffered-v8` and `whole` → OOM; small-K (1/100/1000) → SURVIVED at a `ROWS`/`HEAP` where the object graph exceeds the heap cap. If nothing OOMs, raise `ROWS` (e.g. `ROWS=500000`) or lower `HEAP` (e.g. `HEAP=96`) until the contrast appears; record the `ROWS`/`HEAP` used. (Note: the raw input buffer is `external` memory and does NOT count against `--max-old-space-size`, so the OOM is driven by the JS object graph — exactly the all-objects-vs-K-objects contrast.)

- [ ] **Step 4: Commit** — `git commit -m "perf(streaming): capped-heap survival test (buffered OOM vs streaming survives)"`

---

## Task 5 (optional): Validate the splitter against live ES `asStream`

Only if dev ES is up (`bash dev/status.sh`). Confirms the splitter works on a real streamed `_search`.

**Files:** Create `benchmark/src/streaming-parse/streaming/real-es.ts`

- [ ] **Step 1: Write `real-es.ts`** — POST `_search` to the dev ES with `asStream`-style consumption (use `fetch` and read `res.body` as a web stream, or `http` for chunks), feed chunks to `createHitSplitter`, and assert the emitted hit count equals `hits.total` and each hit `JSON.parse`s. Handle gzip: if the response `content-encoding` is gzip, pipe through `zlib.createGunzip()` first.

```ts
import { createHitSplitter } from './splitter.ts'
const ES = `http://localhost:${process.env.ES_PORT || '27664'}`
const index = process.env.CAPTURE_INDEX
if (!index) { console.error('set CAPTURE_INDEX (see: curl $ES/_cat/indices)'); process.exit(1) }
const res = await fetch(`${ES}/${index}/_search`, { method: 'POST', headers: { 'content-type': 'application/json', 'accept-encoding': 'identity' }, body: JSON.stringify({ size: 10000, query: { match_all: {} } }) })
let count = 0
const sp = createHitSplitter(b => { JSON.parse(b.toString()); count++ })
// @ts-ignore web stream async iteration
for await (const chunk of res.body as any) sp.write(Buffer.from(chunk))
sp.end()
console.log(`real-es: emitted ${count} hits, splitter.total=${sp.total}`)
if (sp.total != null && count !== Math.min(sp.total, 10000)) { console.error('MISMATCH'); process.exit(1) }
console.log('real-es OK')
```

- [ ] **Step 2: Run it** — find an index (`curl -s localhost:27664/_cat/indices | grep dataset`), then `CAPTURE_INDEX=<index> node --experimental-strip-types ... real-es.ts`. Expected: `real-es OK`. (`accept-encoding: identity` sidesteps gzip; if a proxy still compresses, add the gunzip step.) If ES is down, SKIP this task and note it.
- [ ] **Step 3: Commit** (if run) — `git commit -m "perf(streaming): validate splitter against live ES asStream"`

---

## Task 6: Results writeup + verdict

**Files:** Create `benchmark/results/streaming-pipeline-experiment.md`

- [ ] **Step 1: Write the results doc** with: environment (node version, flags, ROWS/CHUNK), the peak/ms/gc table per buffer × variant (from Task 3), the capped-heap survival results + the ROWS/HEAP used (from Task 4), the real-ES validation status (Task 5), and — applying the decision rule (§7 of the design) — the VERDICT: does some K cut peak ≥2× vs buffered-V8 (and/or survive where buffered OOMs) at ≤~1.5× ms? Name the sweet-spot K. If yes → recommend wiring the streaming split+batched-parse+streamed-serialize into `/lines` (a separate effort), composed with the serialization optimization already planned. If no → honest negative (streaming bookkeeping isn't worth it; serialization-only optimization stands).
- [ ] **Step 2: Cross-check** every number against the captured bench/survival output. Note variance.
- [ ] **Step 3: Commit** — `git commit -m "docs(streaming): streaming pipeline experiment results + verdict"`

---

## Self-Review

**Spec coverage:** §3 pipeline (splitter + batched parse + streamed serialize) → Tasks 1,2. §4 baseline+variants+gate → Task 2,3. §5 source (synthetic chunked primary + optional real ES) → Task 3 (`chunked`), Task 5. §6 metrics (peak sampled + capped-heap survival + GC + ms) → Tasks 3,4. §7 decision rule → Task 6. §8 deliverables/layout → all. Non-goals (endpoint wiring, simdjson-per-hit, object pool) → correctly absent.

**Placeholder scan:** no TBD/TODO; every code step has real code; run commands concrete with flags; the splitter's tricky compaction is driven by a real fuzz test; the tuning steps (survival ROWS/HEAP) give concrete starting values + how to adjust.

**Type consistency:** `HitSplitter`/`createHitSplitter(onHit)`, `Sink.write`, `collectSink().get()`, `chunked(buf,chunkSize)`, `bufferedV8(buf,d,format,sink,sample)`, `streaming(chunks,d,format,K,sink,sample)`, `Descriptor`/`referenceOutput` are used identically across Tasks 1–6. K=Infinity is the "whole" sentinel throughout. `extract` is defined locally in pipeline.ts (matching the bake-off v8 substrate) — the equivalence gate guarantees it matches.

**Known deferrals (not gaps):** aggregations/tail parsing (our buffers have none; splitter stops at `]`); the real `/lines` wiring; async real-ES as the primary (synthetic chunked is primary for reproducibility, async promise overhead avoided by using sync `Buffer[]` chunks).
