# Event-loop stall fixes (zero behavior change) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate or bound the >10ms synchronous main-thread stalls found by the 2026-07 stall audit, with byte-identical API responses (headers included).

**Architecture:** Two families of change: (a) scheduling — add the established `setImmediate`-every-N yield idiom to unyielded loops; (b) zero-copy worker offload — route `format=wkt` and `format=xlsx/ods` through the existing `searchRaw` → `transferableRawBuffer` → piscina render-worker pattern already used by shp/tiles, with the worker returning `count` + last-hit `sort` so the `Link` header stays identical.

**Tech Stack:** Node 24 (`--experimental-strip-types`), Express 5, piscina worker threads, Elasticsearch client raw transport, playwright test projects (`unit` needs no infra, `api` needs `npm run test-deps`).

## Global Constraints

- **Zero behavior change**: every response (status, headers incl. `Link`, body bytes) must be identical. Log-only changes (the values_agg warning) are allowed. The values_agg 100k **throw condition must NOT change**.
- Follow the zero-copy conventions of `api/src/datasets/utils/worker-transfer.ts` (read its comments — pooled-Buffer transfer rules are subtle).
- Commit style: `perf(datasets): …` / `fix(datasets): …`, one commit per task, ending with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`.
- Run only related tests per task (`npx playwright test <file> --project unit|api`); the push hook runs the full suite.
- Branch: `perf-api-stalling` (current worktree). One PR at the end.

## Explicitly out of scope (decided, do not re-open)

- pbf `sampling=max` / vtPrepared zero-copy: pages are sequentially dependent on the parsed last hit (`after`), so raw-buffer transfer is impossible without a main-thread parse; bounded at ~47ms by the 10MB concat cap. Documented in Task 8.
- values_agg blocking at 100k (`size=0` loophole becomes a **warning** fix only).
- The shp zero-copy `Link` header inconsistency (pre-existing; reported separately to the user).

---

### Task 1: `_bulk_lines` patch/delete loops — Map index + yields

**Files:**
- Modify: `api/src/datasets/utils/rest.ts` (applyTransactions: patch-previous loop ~491-528, delete-previous loop ~533-549, create/update existence loop ~624-653)
- Test: existing `tests/features/datasets/rest/*.api.spec.ts`

**Interfaces:** none exported; internal to `applyTransactions`.

- [ ] **Step 1: read the three loops in full** (`sed -n '460,680p' api/src/datasets/utils/rest.ts`) and locate the existing yield idiom used at the build loop (~469) and validation loop (~561) to copy its exact style.
- [ ] **Step 2: add a first-occurrence Map index** right after the `operations` array is fully built (after the build loop, before the patch-previous block):

```ts
// index for the result-processing loops below (operations.find was O(N) per result → O(N²) per chunk);
// keep the FIRST occurrence per _id, matching operations.find semantics if a chunk ever carries duplicates
const operationsById = new Map<string, any>()
for (const op of operations) {
  if (op._id !== undefined && !operationsById.has(op._id)) operationsById.set(op._id, op)
}
```

Replace all six `operations.find(op => op._id === _id)` call sites (patch ×2, delete ×2, create/update ×2 — grep `operations.find` to catch them all) with `operationsById.get(_id)`.

- [ ] **Step 3: add yields to the three result-processing loops.** In each `for await (const … of c.find(…))` body and each `for (const _id of missing…)` loop, add a counter + the repo idiom:

```ts
let i = 0
// inside the loop body:
if (i++ % 100 === 99) await new Promise(resolve => setImmediate(resolve))
```

(The `for (const _id of missing…)` loops inside a sync context: check they are inside the async function — they are — so the same `await` works. The create/update existence loop at ~624 gets the same treatment.)

- [ ] **Step 4: run the REST dataset API tests**

Run: `npx playwright test tests/features/datasets/rest --project api --max-failures=1`
Expected: PASS (behavior identical; requires test-deps running — check `bash dev/status.sh` first, report to user if infra down).

- [ ] **Step 5: commit** — `perf(datasets): index bulk ops by id and yield in applyTransactions result loops`

### Task 2: values_agg — `size=0` no longer evades the combined-size warning

**Files:**
- Modify: `api/src/datasets/es/values-agg.ts:82` (`combinedMaxSize *= size`)
- Test: `tests/features/datasets/query/values-agg.api.spec.ts`

- [ ] **Step 1: change the multiplication** (log-only change; the throw on line 84 keeps its exact `size > 100 &&` condition — for `size > 100`, `Math.max(size, 1) === size`, so the throw is bit-identical):

```ts
  // size=0 must not zero the product: the warning below tracks the BUCKET volume the query can return
  combinedMaxSize *= Math.max(size, 1)
```

- [ ] **Step 2: run** `npx playwright test tests/features/datasets/query/values-agg.api.spec.ts --project api --max-failures=1` — Expected: PASS
- [ ] **Step 3: commit** — `fix(datasets): values_agg size=0 no longer evades the combined-size warning`

### Task 3: geo_agg — yield during top-hit preparation

**Files:**
- Modify: `api/src/datasets/es/geo-agg.ts` (`prepareGeoAggResponse`, ~line 56)

**Interfaces:** `prepareGeoAggResponse` becomes `async`; its only caller is the `return prepareGeoAggResponse(…)` in the same file's exported (already async) function — add `await`.

- [ ] **Step 1: convert the `.map` to a loop with a per-prepared-hit yield** (same 500 cadence as `consumeHits`):

```ts
const prepareGeoAggResponse = async (esResponse: any, dataset: any, query: Record<string, any>, publicBaseUrl: string, flatten: any) => {
  const response: any = { total: esResponse.hits.total.value }
  const resultCtx = prepareResultContext(dataset, query)
  response.aggs = []
  let prepared = 0
  for (const b of esResponse.aggregations.geo.buckets) {
    const center = geohash.hash2coord(b.key)
    const results = []
    if (b.topHits) {
      for (const hit of b.topHits.hits.hits) {
        // agg_size × size can legally reach 100000 prepared hits: yield like the /lines pipeline does
        if (prepared++ % 500 === 499) await new Promise(resolve => setImmediate(resolve))
        results.push(prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, resultCtx))
      }
    }
    const aggItem: any = {
      total: b.doc_count,
      value: b.key,
      centroid: b.centroid.location,
      center: { lat: center[1], lon: center[0] },
      bbox: geohash.hash2bbox(b.key),
      results
    }
    if (b.metric) aggItem.metric = b.metric.value
    response.aggs.push(aggItem)
  }
  return response
}
```

Keep the response object key order EXACTLY as today (total/value/centroid/center/bbox/results, metric appended after) — the JSON body must be byte-identical.

- [ ] **Step 2: run the geo api tests** — `npx playwright test tests/features/datasets/upload/geo-files.api.spec.ts --project api --max-failures=1` — Expected: PASS
- [ ] **Step 3: commit** — `perf(datasets): yield during geo_agg top-hit preparation`

### Task 4: ODS `date_format()` — drop per-value dayjs.tz (TDD)

**Files:**
- Modify: `api/src/api-compat/ods/operations.ts` (`date_transform`, ~line 208; reuse the existing `getDtf`/`parseOffset` helpers ~line 107)
- Test: `tests/features/datasets/compat/compat-ods-operations.unit.spec.ts`

**Interfaces:** `transforms.date_transform(dateStr, timezone, format)` — signature and outputs unchanged.

- [ ] **Step 1: write the failing/parity test first.** Add to `compat-ods-operations.unit.spec.ts` a reference copy of the OLD implementation and compare exhaustively:

```ts
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone.js'
import utc from 'dayjs/plugin/utc.js'
import { transforms } from '../../../../api/src/api-compat/ods/operations.ts'
dayjs.extend(utc); dayjs.extend(timezone)

const referenceDateTransform = (dateStr: string, tz?: string, format?: string) => {
  const dayjsFormat = format?.replace(/yy/g, 'YY').replace(/d/g, 'D')
  return dayjs(dateStr).tz(tz ?? 'utc').format(dayjsFormat)
}

test('date_transform matches the historical dayjs.tz output', () => {
  const dates = [
    '2024-01-15T10:30:45.123Z', '2024-06-15T23:45:00Z',
    '2024-03-31T00:30:00Z', '2024-03-31T01:30:00Z', // Europe/Paris DST spring-forward
    '2024-10-27T00:30:00Z', '2024-11-03T05:30:00Z', // fall-back (Paris + New York)
    '1969-12-31T23:59:59Z'
  ]
  const timezones = [undefined, 'utc', 'UTC', 'Europe/Paris', 'America/New_York', 'Asia/Kolkata'] // Kolkata = +05:30
  const formats = [undefined, 'yyyy-MM-dd', 'dd/MM/yy HH:mm:ss', 'YYYY [d] HH', 'd MMM YYYY, Z']
  for (const d of dates) for (const tz of timezones) for (const f of formats) {
    assert.equal(transforms.date_transform(d, tz, f), referenceDateTransform(d, tz, f), `${d} ${tz} ${f}`)
  }
})
```

- [ ] **Step 2: run it** — `npx playwright test tests/features/datasets/compat/compat-ods-operations.unit.spec.ts --project unit` — Expected: PASS against the current implementation (it IS the reference). This is the safety net.
- [ ] **Step 3: implement the fast path** in `operations.ts`, reusing `getDtf`/`parseOffset`:

```ts
// date_format() used to run dayjs(dateStr).tz(tz) per value (~38µs each — the same per-value Intl cost
// isoWithOffset had, see comment above getDtf). Resolve the instant's offset via the cached Intl
// formatter instead, then format from a fixed offset — identical output, ~10x cheaper. The format-string
// rewrite is also memoized (it ran two regexes per value).
const dayjsFormatCache = new Map<string, string | undefined>()
const odsFormat2dayjs = (format?: string) => {
  if (format === undefined) return undefined
  let f = dayjsFormatCache.get(format)
  if (f === undefined && !dayjsFormatCache.has(format)) {
    f = format.replace(/yy/g, 'YY').replace(/d/g, 'D')
    dayjsFormatCache.set(format, f)
  }
  return f
}
const tzOffsetMinutes = (date: Date, timezone: string) => {
  let offset = '+00:00'
  for (const part of getDtf(timezone).formatToParts(date)) {
    if (part.type === 'timeZoneName') { offset = parseOffset(part.value); break }
  }
  return (offset.startsWith('-') ? -1 : 1) * (Number(offset.slice(1, 3)) * 60 + Number(offset.slice(4, 6)))
}
```

and replace `date_transform`:

```ts
  date_transform: (dateStr, timezone, format) => {
    const dayjsFormat = odsFormat2dayjs(format)
    const tz = timezone ?? 'utc'
    // 'z' (tz abbreviation) needs the full tz plugin; every other token renders identically from a fixed offset
    if (dayjsFormat && /z/.test(dayjsFormat.replace(/\[[^\]]*\]/g, ''))) return dayjs(dateStr).tz(tz).format(dayjsFormat)
    if (tz.toLowerCase() === 'utc') return dayjs(dateStr).tz('utc').format(dayjsFormat)
    return dayjs(dateStr).utcOffset(tzOffsetMinutes(new Date(dateStr), tz)).format(dayjsFormat)
  }
```

NOTE: keep `.tz('utc')` (not `.utc()`) for the utc branch unless the parity test proves them identical — do not guess; if the parity test fails on any branch, keep dayjs.tz for that branch and note it.

- [ ] **Step 4: re-run the parity test** — Expected: PASS. Also run `npx playwright test tests/features/datasets/compat --project unit --max-failures=1`.
- [ ] **Step 5: commit** — `perf(api-compat): resolve date_format() offsets via the cached Intl formatter`

### Task 5: denser pipeline yields when `wkt=true`

**Files:**
- Modify: `api/src/datasets/routes/lines-pipeline.ts` (`consumeHits` signature; `streamJson` + `streamCsv` call sites)

**Interfaces:** `consumeHits(source, perRow, yieldEvery = 500)`.

- [ ] **Step 1: add the param**

```ts
export const consumeHits = async (source: LinesSource, perRow: (hit: any) => void, yieldEvery = 500): Promise<{ count: number, lastHit: any }> => {
  ...
        if (count % yieldEvery === yieldEvery - 1) await new Promise(resolve => setImmediate(resolve))
```

- [ ] **Step 2: pass it from `streamJson` and `streamCsv`** (geojson untouched — `wkt` does not apply to it):

```ts
  // wkt=true parses + WKT-serializes the raw geometry column per row (unbounded vertex counts): a 500-row
  // batch of large polygons measured ~600ms, so yield 10x more often for these requests
  const yieldEvery = query.wkt === 'true' ? 50 : 500
  const { count, lastHit } = await consumeHits(source, hit => { ... }, yieldEvery)
```

- [ ] **Step 3: run** `npx playwright test tests/features/datasets/upload/geo-files.api.spec.ts tests/features/datasets/query/search-basic.api.spec.ts --project api --max-failures=1` — Expected: PASS
- [ ] **Step 4: commit** — `perf(datasets): yield every 50 rows when wkt=true`

### Task 6: `format=wkt` — zero-copy render worker

**Files:**
- Modify: `api/src/datasets/threads/geojson2shp.ts` (add named export `wkt`)
- Modify: `api/src/datasets/utils/outputs.ts` (add `result2wktFromBuffer`)
- Modify: `api/src/datasets/routes/read.ts` (mode selection + wkt branch)
- Create: `tests/features/datasets/wkt-zero-copy.unit.spec.ts`
- Test: `tests/features/datasets/upload/geo-files.api.spec.ts` (existing wkt assertions)

**Interfaces:**
- Produces: `outputs.result2wktFromBuffer(rawBuffer: Buffer): Promise<{ wkt: Buffer, count: number, lastHitSort?: any[] }>`
- Worker export: `wkt({ rawBuffer }: { rawBuffer: Uint8Array }): { wkt: Buffer, count: number, lastHitSort?: any[] }` invoked via `geojson2shpPiscina.run(payload, { name: 'wkt', transferList })` (piscina named-export dispatch).

- [ ] **Step 1: write the parity unit test first** (mirror `tile-zero-copy.unit.spec.ts`): build a fake ES response with `_geoshape` polygons + a `_geopoint` hit + a geometry-less hit; OLD = `geo.result2wkt(esResponse)`; NEW = the worker's build over `JSON.parse(Buffer.from(JSON.stringify(esResponse)))`. Assert identical strings and that `lastHitSort`/`count` match `esResponse.hits.hits`. Import the worker's `wkt` export directly (it is a plain function).
- [ ] **Step 2: add the worker export** in `threads/geojson2shp.ts` (same file → same piscina pool, wkt shares the geo-render pool; note `config.ogr2ogr.skip` guard stays inside the default export only):

```ts
import { geojsonToWKT } from '@terraformer/wkt'

// format=wkt render (named piscina export sharing this pool): parse the TRANSFERRED raw ES bytes, build the
// GeometryCollection exactly like geo.result2wkt did on the main thread, serialize. count + lastHitSort go
// back so read.ts reproduces the exact Link header the buffered path emitted.
export const wkt = ({ rawBuffer }: { rawBuffer: Uint8Array }) => {
  const esResponse = JSON.parse(Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength).toString())
  const hits = esResponse.hits.hits
  const geometryCollection = {
    type: 'GeometryCollection',
    geometries: hits.map((hit: any) => {
      let geometry = hit._source._geoshape
      if (!geometry && hit._source._geopoint) {
        const [lat, lon] = hit._source._geopoint.split(',')
        geometry = { type: 'Point', coordinates: [Number(lon), Number(lat)] }
      }
      return geometry
    }).filter((geometry: any) => !!geometry)
  }
  return { wkt: Buffer.from(geojsonToWKT(geometryCollection)), count: hits.length, lastHitSort: hits[hits.length - 1]?.sort }
}
```

(Plain return — the worker→main clone of the WKT buffer is a memcpy, single-digit ms vs the 220ms serialize; matches the `geojson2pbfFromBuffer` return convention.)

- [ ] **Step 3: add `result2wktFromBuffer` to outputs.ts**

```ts
// Zero-copy wkt export (mirror of geojson2shpFromBuffer): transfer the RAW ES bytes to the render worker
// (named export sharing the shp pool) which parses + builds + geojsonToWKTs — the monolithic WKT serialize
// (~220ms for a 10k-polygon page) leaves the main thread entirely.
export const result2wktFromBuffer = async (rawBuffer: Buffer): Promise<{ wkt: Buffer, count: number, lastHitSort?: any[] }> => {
  const { payload, transferList } = transferableRawBuffer(rawBuffer)
  const res = await geojson2shpPiscina.run({ rawBuffer: payload }, { name: 'wkt', transferList })
  return { wkt: Buffer.from(res.wkt), count: res.count, lastHitSort: res.lastHitSort }
}
```

- [ ] **Step 4: rewire read.ts.** Mode selection — add a branch (before the generic `else`):

```ts
  } else if (query.format === 'wkt') {
    // Zero-copy wkt path (mirror of shp): wkt outputs only geometries (select is forced to _geoshape), so
    // there is no _attachment_url rewrite concern and EVERY wkt request can take the raw-worker path.
    try {
      observe.readLinesMode(req, 'raw-worker')
      rawWktBuffer = await esUtils.searchRaw(req.app.get('es'), dataset, query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
  }
```

(declare `let rawWktBuffer: Buffer | undefined` next to `rawShpBuffer`). Replace the wkt branch:

```ts
  if (query.format === 'wkt') {
    const { wkt, count, lastHitSort } = await outputs.result2wktFromBuffer(rawWktBuffer!)
    observe.reqStep(req, 'result2wkt')
    // reproduce the Link header the buffered path set from esResponse (the shared block above is skipped
    // because esResponse is undefined on this path)
    if (size && lastHitSort) {
      const href = nextLinkHref({ size, query, publicBaseUrl, datasetId: dataset.id as string }, count, { sort: lastHitSort })
      if (href) res.set('Link', linkHeaderValue(href))
    }
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.wkt'))
    res.type('text/plain')
    return res.status(200).send(wkt)
  }
```

Check `geo.result2wkt` remaining callers (only the parity test) — keep the function exported for the test/reference.

- [ ] **Step 5: run** `npx playwright test tests/features/datasets/wkt-zero-copy.unit.spec.ts --project unit` then `npx playwright test tests/features/datasets/upload/geo-files.api.spec.ts --project api --max-failures=1` — Expected: PASS (the api spec asserts `GEOMETRYCOLLECTION` output end-to-end through the real worker).
- [ ] **Step 6: verify header parity manually**: with dev api running, `curl -sI '…/lines?format=wkt&size=<page>'` on a geo dataset on master vs branch — same `Content-Type`, `Content-Disposition`, `Link`, `ETag` class. (Skip if dev infra is down; the api spec + unit parity carry the gate.)
- [ ] **Step 7: commit** — `perf(datasets): zero-copy worker render for format=wkt`

### Task 7: xlsx/ods — raw buffer into the sheet worker

**Files:**
- Modify: `api/src/datasets/threads/results2sheet.js` (accept `rawBuffer`, prepare rows in-worker, return `{ sheet, count, lastHitSort }`)
- Modify: `api/src/datasets/utils/outputs.ts` (`results2sheet` → `results2sheetFromBuffer`)
- Modify: `api/src/datasets/routes/read.ts` (xlsx/ods branch + mode selection)
- Create: `tests/features/datasets/sheet-zero-copy.unit.spec.ts`
- Test: `tests/features/datasets/query/export-cell-limit.api.spec.ts` (existing xlsx export coverage)

**Interfaces:**
- Produces: `outputs.results2sheetFromBuffer(req: ReqWithDataset, rawBuffer: Buffer, bookType?: string): Promise<{ sheet: Buffer, count: number, lastHitSort?: any[] }>`
- Worker input gains: `{ rawBuffer, publicBaseUrl }`; loses `results`.

- [ ] **Step 1: write the row-parity unit test first** (`sheet-zero-copy.unit.spec.ts`): fake ES response with `_attachment_url` in `_source` (raw stored form), dates, separators. OLD rows = search()-style rewrite (`hit._source._attachment_url = rewriteAttachmentUrl(url, dataset, publicBaseUrl)`) then `prepareResultItem(hit, …, ctx)` with `ctx.rewriteAttachmentUrl` unset; NEW rows = raw hits + `ctx.rewriteAttachmentUrl = true`. Assert `assert.deepEqual(newRows, oldRows)`. (Compares prepared ROWS, not xlsx bytes — xlsx embeds timestamps.) This re-pins the established streamed-mode URL parity for the worker context.
- [ ] **Step 2: rework the worker.** In `results2sheet.js`, add imports (worker threads load TS via strip-types like `threads/*.ts`; `commons.ts` needs config — piscina workers inherit the process env, same as `geojson2pbf.ts`'s config import):

```js
import { prepareResultItem, prepareResultContext } from '../es/commons.ts'
import { getFlatten } from '../utils/flatten.ts'
```

and change the handler head:

```js
export default ({ rawBuffer, bookType, query, dataset, publicBaseUrl, downloadUrl, labels, datasetsMetadata }) => {
  // Zero-copy path: the main thread transferred the raw ES bytes — parse here and run the SAME
  // per-hit preparation read.ts used to run (ctx.rewriteAttachmentUrl reproduces search()'s
  // _attachment_url rewrite — same shared function, same output URLs).
  const esResponse = JSON.parse(Buffer.from(rawBuffer.buffer, rawBuffer.byteOffset, rawBuffer.byteLength).toString())
  const hits = esResponse.hits.hits
  const flatten = getFlatten(dataset, query.arrays === 'true')
  const resultCtx = prepareResultContext(dataset, query)
  resultCtx.rewriteAttachmentUrl = true
  const results = hits.map(hit => prepareResultItem(hit, dataset, query, flatten, publicBaseUrl, resultCtx))
  const count = hits.length
  const lastHitSort = hits[hits.length - 1]?.sort
  … existing sheet build unchanged, using `results` …
  return { sheet: <existing return value>, count, lastHitSort }
}
```

- [ ] **Step 3: rework outputs.ts** — replace `results2sheet` with:

```ts
export const results2sheetFromBuffer = async (req: ReqWithDataset, rawBuffer: Buffer, bookType: string = 'xlsx'): Promise<{ sheet: Buffer, count: number, lastHitSort?: any[] }> => {
  const rawDataset = reqDataset(req) as Dataset & { __isProxy?: boolean, __proxyTarget?: Dataset }
  const dataset = rawDataset.__isProxy ? rawDataset.__proxyTarget as Dataset : rawDataset
  const settings = await mongo.db.collection('settings')
    .findOne({ type: dataset.owner.type, id: dataset.owner.id }, { projection: { datasetsMetadata: 1 } })
  const { payload, transferList } = transferableRawBuffer(rawBuffer)
  const res = await results2sheetPiscina.run({
    rawBuffer: payload,
    bookType,
    query: req.query,
    dataset,
    publicBaseUrl: reqPublicBaseUrl(req),
    downloadUrl: reqPublicBaseUrl(req) + req.originalUrl,
    labels: req.__('sheets'),
    datasetsMetadata: (settings as { datasetsMetadata?: any } | null)?.datasetsMetadata ?? {}
  }, { transferList })
  return { sheet: Buffer.from(res.sheet), count: res.count, lastHitSort: res.lastHitSort }
}
```

(import `transferableRawBuffer` there; check whether the full `dataset` doc still clones cleanly — it already crossed this boundary before, so it does.)

- [ ] **Step 4: rewire read.ts.** Mode selection — extend the wkt branch's sibling:

```ts
  } else if (query.format === 'xlsx' || query.format === 'ods') {
    // Zero-copy sheet path: raw ES bytes go to the sheet worker which runs the per-hit preparation
    // (identical via ctx.rewriteAttachmentUrl) + the sheet build off the main thread.
    try {
      observe.readLinesMode(req, 'raw-worker')
      rawSheetBuffer = await esUtils.searchRaw(req.app.get('es'), dataset, query, esAbortContext)
    } catch (err) {
      await manageESError(req, err)
    }
  }
```

Replace the xlsx/ods branch (the collect + prepare loop disappears):

```ts
  if (query.format === 'xlsx' || query.format === 'ods') {
    const { sheet, count, lastHitSort } = await outputs.results2sheetFromBuffer(req as outputs.ReqWithDataset, rawSheetBuffer!, query.format)
    observe.reqStep(req, query.format === 'xlsx' ? 'results2xlsx' : 'results2ods')
    // reproduce the Link header the buffered path set from esResponse
    if (size && lastHitSort) {
      const href = nextLinkHref({ size, query, publicBaseUrl, datasetId: dataset.id as string }, count, { sort: lastHitSort })
      if (href) res.set('Link', linkHeaderValue(href))
    }
    res.setHeader('content-disposition', contentDisposition(dataset.slug + '.' + query.format))
    res.type(query.format)
    return res.status(200).send(sheet)
  }
```

Keep the response identical: verify the old branch's exact `observe.reqStep` labels and header order and match them. Remove the now-unused `collect` import if nothing else uses it (`streamGeojson`/others may — check).

- [ ] **Step 5: run** `npx playwright test tests/features/datasets/sheet-zero-copy.unit.spec.ts --project unit` then `npx playwright test tests/features/datasets/query/export-cell-limit.api.spec.ts --project api --max-failures=1` (exercises real xlsx export through the worker) — Expected: PASS.
- [ ] **Step 6: commit** — `perf(datasets): zero-copy raw-buffer path for xlsx/ods exports`

### Task 8: docs, bench file, lint, PR

**Files:**
- Modify: `docs/architecture/read-lines-efficiency.md` (wkt + xlsx/ods join the zero-copy render-worker pattern; add the max-sampling rejected-alternative note: sequential `after` pagination requires parsed last hits, bounded ~47ms by the 10MB cap)
- Add: `benchmark/src/micro/stall-audit.bench.ts` (already written — evidence + regression tool)
- Modify: `benchmark/perf-scan-notes.md` — add a short "2026-07 stall audit" section pointing at the bench file and listing the findings fixed here vs deferred (pbf/max, values_agg blocking).

- [ ] **Step 1: write the doc updates** (keep the doc's existing voice: decisions + why, measured numbers).
- [ ] **Step 2: lint + types touched files**: `npm run lint` — Expected: clean (check-types is pre-existingly broken repo-wide; do not gate on it).
- [ ] **Step 3: run the full related api surface once**: `npx playwright test tests/features/datasets --project api --max-failures=1` (long; acceptable once before push).
- [ ] **Step 4: commit docs** — `docs: record the 2026-07 event-loop stall audit and zero-copy extensions`
- [ ] **Step 5: push + open the PR** with `gh pr create` — title `perf(datasets): eliminate >10ms event-loop stalls outside the /lines hot path`, body: summary table of measured before/after per item, the zero-behavior-change statement, the two deferred items (pbf/max rationale, values_agg blocking deferred by user decision), and the shp Link-header side-finding. End body with the 🤖 attribution line.

## Self-review notes

- Spec coverage: audit items 1 (wkt format→Task 6), 2 (wkt=true→Task 5), 3 (xlsx clone→Task 7), 5 (bulk loops→Task 1), 6 (ODS date→Task 4), 7 (values_agg warning→Task 2), 8 (geo_agg→Task 3); item 4 (pbf) consciously deferred (out-of-scope section + docs note).
- Type consistency: `result2wktFromBuffer`/`results2sheetFromBuffer` return `{ …, count, lastHitSort }` and read.ts consumes exactly those names in Tasks 6/7.
- All response-shaping code paths preserve key order and headers; the only observable-adjacent change is header *insertion order* for Link (semantically unordered).
