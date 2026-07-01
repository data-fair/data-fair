# Production streamed `/lines` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/lines` able to run in a streamed mode that collapses peak memory (never holds all N hit objects), behind a default-off experimental flag with a small-payload heuristic, sharing ONE transform/serialize pipeline with the buffered path.

**Architecture:** Refactor `readLines` around a hit **source** (`{ head, hits: AsyncIterable, tail }`). Buffered source = `JSON.parse(whole)`; streamed source = ES `asStream` → gunzip? → a byte splitter that slices each hit and captures the envelope skeleton (prefix+tail → `JSON.parse`). json/csv stream through a shared pipeline; geo/tile/sheet formats collect the source into an array and run as today.

**Tech Stack:** TypeScript (data-fair api), Express, `@elastic/elasticsearch` 8.17, `node:zlib`, Playwright tests.

## Global Constraints

- **Flag:** `experimental.streamReadLines`, default `false`. Non-production per-request opt-in `?_stream=true` gated by `process.env.NODE_ENV !== 'production'`.
- **Parity:** streamed-mode output must be **deep-equal (JSON) / byte-equal (CSV)** to buffered-mode output for the same request.
- **Buffered-first:** the buffered refactor (Task 6) must be exactly behavior-preserving with the flag OFF — the existing `/lines` api suite is the gate. Do it before any streaming behavior.
- **Custom parsing is minimal:** only the hits-array boundary-finding + slicing is custom; the envelope goes through `JSON.parse` of a tiny prefix+tail skeleton.
- **Hard formats collect:** geojson, shp, wkt, mvt/vt/pbf, xlsx, ods consume the source via `Array.fromAsync` then run the current logic.
- **Streaming safety:** ES resolves before the first byte; per-row serialize is total; honor `res.write` backpressure (await `drain`); propagate abort to the ES stream; enveloped JSON makes truncation detectable.
- **Commit type:** commitlint accepts `feat:`/`fix:`/`refactor:`/`test:`/`docs:`/`perf:` (NOT `bench:`). `.ts` imports. Match lint (`@stylistic/*`, `import-x/first`).
- **Type ratchet:** `bash dev/check-types-ratchet.sh` must not regress; data-fair's full `check-types` is pre-existingly broken — gate on lint + ratchet + tests.
- **Tests:** Playwright — unit `*.unit.spec.ts`, api `*.api.spec.ts` under `tests/features/`. Dev services (ES `:27664`, mongo, dev-api) must be up for api tests.
- **Spec:** `docs/plans/2026-07-01-streaming-read-lines-production-design.md`. **Go/no-go is a staging measurement (spec §9), not this plan.**

---

## File Structure

- `api/src/datasets/es/hits-splitter.ts` — byte splitter: hit slices + envelope skeleton (prefix+tail). Pure.
- `api/src/datasets/routes/lines-source.ts` — `LinesSource = { head, hits, tail }`; `bufferedSource(esResponse)`.
- `api/src/datasets/es/search-stream.ts` — `searchStream(...) → LinesSource` via `asStream` + gunzip + splitter.
- `api/src/datasets/routes/lines-pipeline.ts` — shared consumer: stream json/csv from a source to `res`; `collect(source)` for hard formats.
- `api/src/datasets/routes/read.ts` — `readLines` refactored to pick a source + delegate to the pipeline.
- `api/config/{default.cjs,custom-environment-variables.cjs,type/schema.json}` — the flag + heuristic.
- Tests under `tests/features/`.

---

## Task 1: Production hits splitter + envelope skeleton (pure, fuzz-tested)

**Files:**
- Create: `api/src/datasets/es/hits-splitter.ts`
- Test: `tests/features/infra/hits-splitter.unit.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface HitSplitter {
    write(chunk: Buffer): void        // calls onHit(hitBytes) per complete hit
    end(): void
    envelope(): any                   // JSON.parse of prefix+tail (empty hits.hits) — call after end()
  }
  export function createHitSplitter(onHit: (hitBytes: Buffer) => void): HitSplitter
  ```

- [ ] **Step 1: Write the fuzz + envelope test** (`hits-splitter.unit.spec.ts`)

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { createHitSplitter } from '../../../api/src/datasets/es/hits-splitter.ts'

function mulberry32 (seed: number) { return function () { let t = seed += 0x6D2B79F5; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296 } }
const genHit = (r: () => number, i: number) => ({ _id: `id-${i}`, _score: null, sort: [i], _source: { a: { b: `d "${i}" }{`, c: i }, tags: [`t${i % 3}`, `x]y`, `q\\z`], label: r() < 0.5 ? `l\n★ ${i}` : `p ${i}`, n: (i * 2654435761) % 1e6 } })
const envelope = (hits: any[], aggs?: any) => Buffer.from(JSON.stringify({ took: 3, timed_out: false, _shards: { total: 1 }, hits: { total: { value: hits.length, relation: 'eq' }, max_score: null, hits }, ...(aggs ? { aggregations: aggs } : {}) }))

test.describe('hits-splitter', () => {
  test('slices hits + recovers envelope across tiny chunks, 200 seeds', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const r = mulberry32(seed)
      const n = Math.floor(r() * 40)
      const hits = Array.from({ length: n }, (_, i) => genHit(r, i))
      const aggs = r() < 0.5 ? { totalCollapse: { value: n } } : undefined
      const buf = envelope(hits, aggs)
      const chunk = 1 + Math.floor(r() * 64)
      const got: any[] = []
      const sp = createHitSplitter(b => got.push(JSON.parse(b.toString())))
      for (let i = 0; i < buf.length; i += chunk) sp.write(buf.subarray(i, i + chunk))
      sp.end()
      assert.deepEqual(got, hits, `hits seed ${seed}`)
      const env = sp.envelope()
      assert.equal(env.hits.total.value, n, `total seed ${seed}`)
      assert.deepEqual(env.hits.hits, [], `skeleton empties hits seed ${seed}`)
      if (aggs) assert.deepEqual(env.aggregations, aggs, `aggs seed ${seed}`)
    }
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `npx playwright test tests/features/infra/hits-splitter.unit.spec.ts --project unit` → FAIL (module not found).

- [ ] **Step 3: Implement `hits-splitter.ts`** (boundary state machine + prefix/tail capture)

```ts
const QUOTE = 0x22, BACKSLASH = 0x5c, OBRACE = 0x7b, CBRACE = 0x7d, CBRACKET = 0x5d
export interface HitSplitter { write(chunk: Buffer): void, end(): void, envelope(): any }

function findHitsArrayStart (b: Buffer): number {
  const needle = Buffer.from('"hits"'); let from = 0
  for (;;) {
    const idx = b.indexOf(needle, from); if (idx === -1) return -1
    let j = idx + needle.length
    while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++
    if (j < b.length && b[j] === 0x3a) { j++; while (j < b.length && (b[j] === 0x20 || b[j] === 0x0a || b[j] === 0x0d || b[j] === 0x09)) j++; if (j < b.length && b[j] === 0x5b) return j + 1 }
    from = idx + needle.length
  }
}

export function createHitSplitter (onHit: (hitBytes: Buffer) => void): HitSplitter {
  let phase: 'prefix' | 'array' | 'tail' = 'prefix'
  let prefix: Buffer = Buffer.alloc(0)         // captured: start .. '[' inclusive
  let tail: Buffer[] = []                       // captured: ']' inclusive .. end
  let cur: Buffer = Buffer.alloc(0); let pos = 0
  let depth = 0, inString = false, escape = false, hitStart = -1

  const scanArray = (chunk: Buffer) => {
    cur = cur.length ? Buffer.concat([cur, chunk]) : chunk
    let lastEmitEnd = 0
    while (pos < cur.length) {
      const c = cur[pos]
      if (inString) { if (escape) escape = false; else if (c === BACKSLASH) escape = true; else if (c === QUOTE) inString = false }
      else if (c === QUOTE) inString = true
      else if (c === OBRACE) { if (depth === 0) hitStart = pos; depth++ }
      else if (c === CBRACE) { depth--; if (depth === 0) { onHit(cur.subarray(hitStart, pos + 1)); lastEmitEnd = pos + 1; hitStart = -1 } }
      else if (c === CBRACKET && depth === 0) { phase = 'tail'; tail.push(cur.subarray(pos)); return }
      pos++
    }
    const keepFrom = hitStart >= 0 ? hitStart : lastEmitEnd
    if (keepFrom > 0) { cur = cur.subarray(keepFrom); pos -= keepFrom; if (hitStart >= 0) hitStart -= keepFrom }
  }

  return {
    write (chunk: Buffer) {
      if (phase === 'tail') { tail.push(chunk); return }
      if (phase === 'prefix') {
        prefix = prefix.length ? Buffer.concat([prefix, chunk]) : chunk
        const start = findHitsArrayStart(prefix); if (start === -1) return
        const rest = prefix.subarray(start); prefix = prefix.subarray(0, start)  // keep through '['
        phase = 'array'; scanArray(rest); return
      }
      scanArray(chunk)
    },
    end () { if (phase === 'prefix') phase = 'tail' },
    envelope () { return JSON.parse(Buffer.concat([prefix, ...tail]).toString()) }  // prefix ends '[', tail starts ']'
  }
}
```

> Note: `prefix` retains bytes through the `[`; when the array closes, everything from `]` onward is
> pushed to `tail`. `envelope()` concatenates them → `...,"hits":[]...` → `JSON.parse` recovers the whole
> envelope (total, aggregations, …) via V8. Robust to envelope key order.

- [ ] **Step 4: Run; iterate until GREEN** — `npx playwright test tests/features/infra/hits-splitter.unit.spec.ts --project unit`. Expected: pass (200 seeds; hits + envelope + aggregations recovered).
- [ ] **Step 5: Commit** — `git commit -m "feat(es): streaming hits splitter with envelope-skeleton recovery"`

---

## Task 2: LinesSource interface + buffered source (pure)

**Files:**
- Create: `api/src/datasets/routes/lines-source.ts`
- Test: `tests/features/infra/lines-source.unit.spec.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface LinesSource {
    total: number | undefined
    hits: AsyncIterable<any>          // each ES hit ({_id,_score,sort,_source,...})
    tail(): Promise<any>              // the full envelope object (aggregations, etc.), resolved when hits exhausted
  }
  export function bufferedSource(esResponse: any): LinesSource
  ```

- [ ] **Step 1: Write the test**

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bufferedSource } from '../../../api/src/datasets/routes/lines-source.ts'

test.describe('bufferedSource', () => {
  test('exposes total, iterable hits, tail envelope', async () => {
    const esResponse = { hits: { total: { value: 2 }, hits: [{ _id: 'a', _source: { x: 1 } }, { _id: 'b', _source: { x: 2 } }] }, aggregations: { g: { value: 9 } } }
    const src = bufferedSource(esResponse)
    assert.equal(src.total, 2)
    const got: any[] = []; for await (const h of src.hits) got.push(h._id)
    assert.deepEqual(got, ['a', 'b'])
    assert.deepEqual((await src.tail()).aggregations, { g: { value: 9 } })
  })
})
```

- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `lines-source.ts`**

```ts
export interface LinesSource { total: number | undefined, hits: AsyncIterable<any>, tail(): Promise<any> }

export function bufferedSource (esResponse: any): LinesSource {
  return {
    total: esResponse.hits.total?.value,
    hits: (async function * () { for (const h of esResponse.hits.hits) yield h })(),
    tail: async () => esResponse
  }
}
```

- [ ] **Step 4: Run → PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(datasets): LinesSource interface + buffered source"`

---

## Task 3: Shared pipeline — stream json/csv from a source; collect for hard formats

**Files:**
- Create: `api/src/datasets/routes/lines-pipeline.ts`
- Test: `tests/features/datasets/lines-pipeline.unit.spec.ts`

**Interfaces:**
- Consumes: `LinesSource` (Task 2), `bufferedSource`, `getFlatten`, `prepareResultContext`/`prepareResultItem` (`../es/commons.ts`), the compiled CSV serializer (`../utils/csv-jit.ts` if present on this branch, else `outputs.csvStreams`), `attachQueryHint`.
- Produces:
  ```ts
  export async function collect(source: LinesSource): Promise<any[]>   // Array.fromAsync(source.hits)
  // streams the JSON envelope { total, next?, results:[...], ...tail-fields, hint? } to res
  export async function streamJson(req, res, source: LinesSource, ctx: { publicBaseUrl, nextHref?, esSearchDurationMs }): Promise<void>
  // streams csv (header + rows) to res
  export async function streamCsv(req, res, source: LinesSource): Promise<void>
  ```

- [ ] **Step 1: Write the parity test** — build an `esResponse`, run `streamJson`/`streamCsv` via a `bufferedSource` into a fake `res` that concatenates writes, and assert the JSON deep-equals the current `readLines` json shape (`{total, results:[prepareResultItem…]}`) and CSV byte-equals `results2csv`.

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { bufferedSource } from '../../../api/src/datasets/routes/lines-source.ts'
import { streamJson, streamCsv } from '../../../api/src/datasets/routes/lines-pipeline.ts'
// fakeRes collects writes; fakeReq mirrors the bits the pipeline reads (dataset, query, __). Build a small
// finalized-like dataset object + esResponse with 3 mixed rows. Compare streamJson output.results deep-equal
// to a reference built with prepareResultItem; compare streamCsv bytes to results2csv output.
// (Wire the fixtures by mirroring tests/features/infra/*.unit.spec.ts that import es/commons.ts.)
test.describe('lines-pipeline parity', () => {
  test('streamJson deep-equals prepareResultItem output; streamCsv byte-equals results2csv', async () => {
    assert.ok(true) // implementer builds the concrete fixture + reference and the two assertions
  })
})
```

- [ ] **Step 2: Run → FAIL / placeholder.** Replace the `assert.ok(true)` with the real fixture + assertions before implementing (this is the parity contract for the whole feature).

- [ ] **Step 3: Implement `lines-pipeline.ts`** — per-hit `prepareResultItem` + streamed serialize, honoring backpressure.

```ts
import { getFlatten } from '../utils/flatten.ts'
import * as esUtils from '../es/index.ts'
import * as outputs from '../utils/outputs.ts'
import { attachQueryHint } from '../../misc/utils/query-advice.ts'
import { reqDataset } from '../../misc/utils/req-context.ts'

const write = (res: any, s: string | Buffer): Promise<void> =>
  res.write(s) ? Promise.resolve() : new Promise(resolve => res.once('drain', resolve))   // backpressure

export async function collect (source: any): Promise<any[]> { const a: any[] = []; for await (const h of source.hits) a.push(h); return a }

export async function streamJson (req: any, res: any, source: any, ctx: any): Promise<void> {
  const dataset = reqDataset(req); const query = req.query
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = esUtils.prepareResultContext(dataset, query)
  // head: build the envelope prefix WITHOUT results, then splice results in
  const head: any = {}; if (source.total != null) head.total = source.total
  if (ctx.nextHref) head.next = ctx.nextHref
  res.type('json').status(200)
  let first = true; let started = false
  for await (const hit of source.hits) {
    if (!started) { const h = JSON.stringify(head); await write(res, (h === '{}' ? '{' : h.slice(0, -1) + ',') + '"results":['); started = true }
    const row = esUtils.prepareResultItem(hit, dataset, query, flatten, ctx.publicBaseUrl, resultCtx)
    await write(res, (first ? '' : ',') + JSON.stringify(row)); first = false
  }
  if (!started) { const h = JSON.stringify(head); await write(res, (h === '{}' ? '{' : h.slice(0, -1) + ',') + '"results":[') }
  await write(res, ']')
  // tail: totalCollapse + hint (attachQueryHint mutates an object → compute its added fields)
  const tail = await source.tail()
  const extra: any = {}
  if (query.collapse && tail.aggregations?.totalCollapse) extra.totalCollapse = tail.aggregations.totalCollapse.value
  attachQueryHint(req, ctx.esSearchDurationMs, extra)          // adds extra.hint when applicable
  for (const k of Object.keys(extra)) await write(res, ',' + JSON.stringify(k) + ':' + JSON.stringify(extra[k]))
  res.end('}')
}

export async function streamCsv (req: any, res: any, source: any): Promise<void> {
  // reuse outputs.csvStreams (already a per-row Transform) as the row serializer, driven by our source
  const dataset = reqDataset(req); const query = req.query
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = esUtils.prepareResultContext(dataset, query)
  const [transform] = outputs.csvStreams(dataset, query)      // Transform: object row -> csv chunk
  res.type('text/csv').status(200)
  transform.on('data', (chunk: Buffer) => { /* piped below */ })
  transform.pipe(res, { end: false })
  for await (const hit of source.hits) {
    const row = esUtils.prepareResultItem(hit, dataset, query, flatten, undefined, resultCtx)
    if (!transform.write(row)) await new Promise(r => transform.once('drain', r))
  }
  await new Promise<void>(r => transform.end(r))
  res.end()
}
```

> Note: `streamJson` must match the current envelope EXACTLY (deep-equal): `{ total, next?, results:[…],
> totalCollapse?, hint? }`. Verify field-for-field against `read.ts:268-307` and `attachQueryHint`. The
> CSV path reuses the existing `csvStreams` per-row Transform so CSV formatting stays identical. The
> parity test (Step 1) is the guard — get it green before wiring into `readLines`.

- [ ] **Step 4: Run parity test → PASS** (both streamed outputs match the current buffered outputs).
- [ ] **Step 5: Commit** — `git commit -m "feat(datasets): shared streamed json/csv pipeline + collect"`

---

## Task 4: `experimental.streamReadLines` flag + heuristic threshold (default off)

**Files:** Modify `api/config/default.cjs`, `api/config/custom-environment-variables.cjs`, `api/config/type/schema.json`

- [ ] **Step 1: Add to `default.cjs`** (top-level):

```js
experimental: {
  streamReadLines: false,                  // stream /lines hits to collapse peak memory (see docs/plans/2026-07-01-streaming-read-lines-*.md)
  streamReadLinesMinRows: 2000             // stay buffered below this size (streaming's overhead isn't worth it)
},
```

- [ ] **Step 2: Add env overrides to `custom-environment-variables.cjs`**:

```js
experimental: {
  streamReadLines: { __name: 'EXPERIMENTAL_STREAM_READ_LINES', __format: 'json' },
  streamReadLinesMinRows: { __name: 'EXPERIMENTAL_STREAM_READ_LINES_MIN_ROWS', __format: 'json' }
},
```

- [ ] **Step 3: Add to `api/config/type/schema.json`** the `experimental` object with `streamReadLines` (boolean, default false) and `streamReadLinesMinRows` (integer, default 2000), not required. Run `npm run build-types`; confirm the generated config type includes them.
- [ ] **Step 4: Commit** — `git commit -m "feat(config): experimental.streamReadLines flag + min-rows heuristic"`

---

## Task 5 (RISKY — behavior-preserving): Refactor `readLines` onto the buffered source + pipeline

Refactor `readLines` so the json/csv path goes through `streamJson`/`streamCsv` fed by a **buffered
source**, and the geo/tile/sheet/wkt formats go through `collect`. Flag stays OFF. This must be exactly
behavior-preserving — the existing `/lines` api suite is the gate.

**Files:** Modify `api/src/datasets/routes/read.ts`
**Test:** the existing `/lines` api suite.

- [ ] **Step 1: Read `readLines` fully** (`api/src/datasets/routes/read.ts:45-307`). Note the current
  structure: search → `esResponse`; `nextLinkURL`; geojson/shp (`:223`), wkt (`:244`), mvt (`:253`) branches
  consume `esResponse`; the json result build (`:268-281`); csv (`:283`), xlsx/ods (`:291-303`); json send (`:306`).

- [ ] **Step 2: Introduce the source at the search point.** After `esResponse` is obtained (`:200`),
  create `const source = bufferedSource(esResponse)`. Leave the geo/wkt/tile/xlsx/ods branches UNCHANGED
  (they already have `esResponse`; do not reroute them — they are the collect cases and buffered already
  gives them the array). Import `bufferedSource`, `streamJson`, `streamCsv`, `collect` from the new modules.

- [ ] **Step 3: Replace the json result-build + send (`:268-281`, `:306-307`)** with:

```ts
const esSearchDurationMs = ... // keep the existing timing variable used by attachQueryHint
await streamJson(req, res, source, { publicBaseUrl, nextHref: nextLinkURL?.href, esSearchDurationMs })
return
```

- [ ] **Step 4: Replace the csv branch (`:283-288`)** with:

```ts
if (query.format === 'csv') { observe.reqStep(req, 'streamCsv'); res.setHeader('content-disposition', contentDisposition(dataset.slug + '.csv')); await streamCsv(req, res, source); return }
```

Keep xlsx/ods (`:291-303`) as-is (they call `outputs.results2sheet(req, result.results)` — build
`result.results` for them via `await collect(source)` mapped through `prepareResultItem`, OR keep the
existing `result.results` build ONLY for the sheet formats). Simplest: before the sheet branches, if
`query.format` is `xlsx`/`ods`, build `const rows = (await collect(source)).map(h => prepareResultItem(...))`
and pass `rows`. Do NOT build `result.results` for json/csv anymore.

- [ ] **Step 5: Run the existing `/lines` api suite** — `npx playwright test tests/features/datasets --project api --grep -i "lines"`. Expected: PASS (flag off, buffered source → identical behavior). This is the gate; if anything differs, the refactor changed behavior — fix until green. Also run any csv/geojson/xlsx `/lines` tests.

- [ ] **Step 6: Commit** — `git commit -m "refactor(datasets): route readLines json/csv through the shared source pipeline"`

---

## Task 6: Streamed source (`asStream` + gunzip + splitter)

**Files:**
- Create: `api/src/datasets/es/search-stream.ts`
- Test: `tests/features/infra/search-stream.unit.spec.ts` (synthetic stream) + api coverage via Task 8.

**Interfaces:**
- Consumes: `createHitSplitter` (Task 1), `LinesSource` (Task 2), `prepareQuery`/`aliasName` (`./commons.ts`), the ES client, `EsAbortContext`.
- Produces: `export async function searchStream(client, dataset, query, abortContext?): Promise<LinesSource>` — issues the same `_search` as `search` but `asStream`, wires splitter, returns `{ total, hits, tail }`. `hits` yields each hit (parsed via `JSON.parse` in batches of K, default 500); `tail()` resolves the envelope skeleton when the stream ends.

- [ ] **Step 1: Write a unit test with a synthetic stream** — feed a hand-built ES response through a
  `Readable` in small chunks to a splitter-backed source; assert hits + total + tail. (Reuse the Task 1
  envelope helper.) Assert the async `hits` yields all hits and `tail()` returns the envelope.

- [ ] **Step 2: Implement `search-stream.ts`** — mirror `search`'s request with `asStream: true`; feed
  chunks (gunzip if `content-encoding: gzip`) to the splitter; expose `hits` as an async generator that
  drains a bounded queue the splitter fills, batching `JSON.parse`; `tail()` awaits stream end then
  `splitter.envelope()`. Keep `allow_partial_search_results:'false'` + timeout + abort like `search`.
  (Full implementation: mirror the sibling Rust effort's `searchRaw` for the request/gunzip parts, plus
  an async-generator bridge over the splitter callbacks.)

- [ ] **Step 3: Run the unit test → PASS.**
- [ ] **Step 4: Commit** — `git commit -m "feat(es): streamed _search source (asStream + splitter + envelope)"`

---

## Task 7: Mode selection — flag + heuristic + eligibility + `?_stream` opt-in

**Files:** Modify `api/src/datasets/routes/read.ts`
**Test:** Task 8 api tests.

- [ ] **Step 1: Add a `streamEligible(dataset, query)` helper** — returns true for json/csv formats and
  NOT the collect formats/params that need the whole array in a way streaming can't help (geojson, shp,
  wkt, mvt/vt/pbf, xlsx, ods are format-gated already; also exclude the multi-search sampling/vector path
  and `arrays`=preserve edge if needed). Conservative: when unsure, buffered.

- [ ] **Step 2: At the search point, choose the source:**

```ts
const streamOn = (config as any).experimental?.streamReadLines === true ||
  (process.env.NODE_ENV !== 'production' && query._stream === 'true')
const wantStream = streamOn && streamEligible(dataset, query) &&
  Number(query.size || 0) >= ((config as any).experimental?.streamReadLinesMinRows ?? 2000)
const source = wantStream
  ? await esUtils.searchStream(req.app.get('es'), dataset, query, esAbortContext)
  : bufferedSource(await esUtils.search(req.app.get('es'), dataset, query, publicBaseUrl, vtPrepared && xyz.join('-'), esAbortContext))
```

Place this so the geo/tile/wkt/sheet branches still get a buffered `esResponse` (those are ineligible →
always buffered). For eligible json/csv, `source` may be streamed. `nextLinkURL` for the streamed case:
the last hit's `sort` isn't known until the stream ends — for the `next` link, either (a) compute it in
`streamJson` from the last emitted hit before writing the tail, or (b) restrict streaming eligibility to
requests without a next page. Choose (a): track the last hit in `streamJson` and set the `Link` header +
`next` field from it (matches `read.ts:210-219`).

- [ ] **Step 3: Run the existing suite (flag off) — still green (no behavior change when off).**
- [ ] **Step 4: Commit** — `git commit -m "feat(datasets): stream/buffered mode selection (flag + heuristic + eligibility)"`

---

## Task 8: Parity fuzz + api equivalence + backpressure/abort tests

**Files:** Create `tests/features/infra/lines-stream-parity.unit.spec.ts`, `tests/features/datasets/stream-read-lines.api.spec.ts`

- [ ] **Step 1: Parity fuzz (unit)** — generate random datasets/queries (incl derived-field params:
  highlight, truncate, html, thumbnail off/on as applicable), build a synthetic ES response, run BOTH
  `bufferedSource` and a splitter-backed source (fed the same response as chunks) through `streamJson`/
  `streamCsv` into fake `res` sinks; assert JSON deep-equal + CSV byte-equal. This proves the two sources
  produce identical output through the shared pipeline.

- [ ] **Step 2: Api equivalence** — on a finalized dataset (copy fixture setup from
  `tests/features/datasets/csv-output.api.spec.ts`): compare `?_stream=true` vs default for
  `format=json&size=5000` (deep-equal `results`, equal `total`, equal `next`/`Link`, equal `hint`),
  `format=csv&size=5000` (byte-equal), an aggregation request (`totalCollapse` present + equal), and a
  hard format (`format=geojson`) still correct with `?_stream=true` (falls back to buffered).

- [ ] **Step 3: Backpressure/abort (api)** — a slow-reading client sees correct full output (no loss);
  a client that aborts mid-stream causes the ES stream to be destroyed (assert via no hanging handles /
  the abort context fired). Keep this test focused; if hard to assert deterministically, assert at least
  that a normal large streamed response completes and matches buffered.

- [ ] **Step 4: Run all** — unit parity + api specs green.
- [ ] **Step 5: Commit** — `git commit -m "test(datasets): stream-vs-buffered parity, api equivalence, backpressure"`

---

## Task 9: Docs + quality gate

**Files:** Create `docs/architecture/streamed-read-lines.md`; modify `AGENTS.md`; run the gate.

- [ ] **Step 1: Write `docs/architecture/streamed-read-lines.md`** — the source abstraction, the splitter +
  envelope skeleton, mode selection (flag + heuristic + `?_stream` non-prod opt-in), the collect-for-hard-
  formats rule, the streaming error/backpressure model, the parity contract, and the staging go/no-go (the
  buffered mode remains default + fallback). Add it to the `AGENTS.md` architecture list.
- [ ] **Step 2: Quality gate** — `npm run lint && bash dev/check-types-ratchet.sh`; then the new unit +
  api specs; then the `/lines` regression sweep with the flag OFF. All green; ratchet not regressed.
- [ ] **Step 3: Commit** — `git commit -m "docs(datasets): streamed read-lines architecture + gate fixups"`

---

## Self-Review

**Spec coverage:** §3.1 source (Tasks 2,6) · §3.2 envelope skeleton (Task 1) · §3.3 shared transform+serialize (Task 3) · §3.4 hard-case collect (Tasks 3,5) · §4 mode selection/flag/heuristic (Tasks 4,7) · §5 error/backpressure (Task 3 `write` drain + Task 6 abort/gunzip + Task 8 tests) · §6 parity (Tasks 3,8) · §7 modules (all) · §8 testing (Tasks 1,3,8) · §9 rollout (Task 9 docs; the actual staging measurement is out of plan scope, correctly) · §10 risk: buffered refactor isolated as Task 5 with the existing suite as gate.

**Placeholder scan:** the one `assert.ok(true)` (Task 3 Step 1) and the prose-described fixtures (Task 8) are the unavoidable live-fixture points, explicitly flagged for the implementer to wire from a named neighboring spec — the parity CONTRACT and assertions are spelled out. All new-module code is real. Tasks 6 and 7's larger integrations give the exact request/selection code + the named references (searchRaw for asStream/gunzip; read.ts line anchors) rather than re-inlining 300 lines the implementer must edit against the live file.

**Type consistency:** `LinesSource { total, hits, tail() }`, `createHitSplitter(onHit).{write,end,envelope}`, `bufferedSource(esResponse)`, `searchStream(...)→LinesSource`, `streamJson(req,res,source,ctx)`, `streamCsv(req,res,source)`, `collect(source)` are used identically across tasks. K batch default 500 (Task 6). Flag `experimental.streamReadLines` + `streamReadLinesMinRows` consistent (Tasks 4,7).

**Known deferrals (not gaps):** the JIT serializer optimization (spec non-goal — the pipeline uses existing serialize semantics); the staging measurement / final benchmark (spec §9 — the user's "last benchmark session", after this lands flag-off); removing the buffered path (never — it's the default + fallback).
