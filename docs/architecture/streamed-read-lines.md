# Streamed `/lines` — Architecture

**Status:** production-ready (flag off by default); go/no-go is a staging measurement.
**Key modules:**
- `api/src/datasets/es/hits-splitter.ts`
- `api/src/datasets/es/hits-stream.ts`
- `api/src/datasets/es/search-stream.ts`
- `api/src/datasets/routes/lines-source.ts`
- `api/src/datasets/routes/lines-pipeline.ts`
- `api/src/datasets/routes/read.ts` (`readLines` handler)

## 1. Why

`/lines` historically parses the entire ES `_search` response body into objects, applies per-hit transforms, then serializes the whole result at once. On large responses this drives peak RSS ≈ raw-response-bytes + all row objects + full output string. The streaming pipeline eliminates that peak by pulling hits one at a time and writing each row to the response as it is produced — peak live memory drops to one chunk's worth of hits at a time.

## 2. The `LinesSource` abstraction

All per-hit processing routes through a single interface:

```ts
interface LinesSource {
  total: number | undefined   // total hit count, known before any hit is iterated
  hits: AsyncIterable<any>    // each ES hit, lazily or from an array
  tail(): Promise<any>        // the full envelope (once hits are exhausted)
}
```

Two implementations:

- **`bufferedSource(esResponse)`** — wraps a fully-parsed `JSON.parse` response. `total` and the full envelope are available immediately; `hits` iterates `esResponse.hits.hits` synchronously via an async generator. This is the default for all requests.
- **streamed source (`streamToSource(stream)`)** — built from an ES `asStream` body via the hits-splitter bridge. `total` is resolved as soon as the hits-array prefix is captured (before any hit is yielded). `hits` is a pull-based async generator: no chunk is read until the consumer pulls the next hit, so at most one chunk of hit bytes is held at once. `tail()` drains remaining chunks and returns the envelope skeleton.

## 3. The hits splitter and envelope skeleton

`createHitSplitter(onHit)` is the only custom-parsing surface. Its responsibility is narrow: find the hits array boundaries in the byte stream and slice each hit's bytes.

**Three phases:**
1. **prefix phase** — accumulates bytes until `"hits":[` is found. Everything up to and including `[` is captured as `prefix`.
2. **array phase** — scans the array with a minimal state machine (brace depth, in-string, escape) to find each `{…}` hit; emits each hit's bytes to `onHit`. On `]` transitions to tail.
3. **tail phase** — accumulates remaining bytes.

**Envelope skeleton** (`splitter.envelope()`): `JSON.parse(Buffer.concat([prefix, ...tail]))`. The prefix ends with `[` and the tail starts with `]`, so their concatenation forms `…"hits":[…]…` with an empty array — valid JSON that V8 parses in full. This recovers `total`, `_shards`, `aggregations`, `totalCollapse`, and every other envelope field without any custom envelope parser. The only custom responsibility is finding the boundaries.

**`total()` early availability:** the hits-array prefix already contains `hits.total`. The splitter closes the open objects/braces from the prefix to synthesize a complete JSON fragment and reads `hits.total.value` from it. This lets `streamToSource` resolve `total` and return the source before any hit is iterated, matching the `/lines` JSON write order (the envelope head with `total` is flushed before the results array).

## 4. Mode selection

```
readLines
  ├─ geo/tile/sheet formats (geojson/shp/wkt/mvt/vt/pbf/xlsx/ods) → buffered + collect
  ├─ experimental.streamReadLines ON  AND  format json/csv  AND  size ≥ streamReadLinesMinRows
  │    → STREAMED source (asStream → optional gunzip → splitter → streamToSource)
  └─ (default) → BUFFERED source (JSON.parse whole response)
          ↓
  shared pipeline: streamJson / streamCsv
```

**Flag:** `config.experimental.streamReadLines` (default `false`). Non-production per-request opt-in: `?_stream=true` (gated `NODE_ENV !== 'production'`) — used by api tests to compare streamed vs buffered output on the same request without enabling the flag globally. The `_stream` param is consumed and dropped before building the `next` pagination link so it never leaks into the link URL.

**Size heuristic (`streamReadLinesMinRows`):** streaming carries a small CPU overhead (per-hit JSON.parse on the splitter output); for small pages buffered is both simpler and fast enough. Default threshold: `size >= 2000` rows. Configurable via `config.experimental.streamReadLinesMinRows`.

**`streamEligible`:** only `json` and `csv` formats can be produced incrementally. geo/tile/sheet formats need the full hits array (bbox computation, vector tile rendering, spreadsheet building), so they always use `collect()` even when `?_stream=true` is passed.

## 5. Shared per-hit pipeline

Both modes route through the same pipeline functions in `lines-pipeline.ts`. The format branch determines the sink:

**JSON (`streamJson`):**
- Buffered mode (`ctx.buffered = true`): collects all rows into an object and calls `res.send()`. Express computes a strong ETag and can answer `304 Not Modified` for conditional requests. Key order: `{ hint?, total, next?, results, totalCollapse?, …}`.
- Streamed mode: writes the envelope head (`{"total":…,"results":[`) immediately, then each row's JSON fragment with `,` separators, then `]`, then optional `next` and `totalCollapse` from the tail, then `}`. Uses `res.throttle('dynamic')` for bandwidth throttling, honors `res.write()` drain for backpressure.

**CSV (`streamCsv`):**
- Buffered mode (`ctx.buffered = true`): collects all hits via `collect(source)`, applies `prepareResultItem` to each, and calls `outputs.results2csv(req, rows)` (same compiled serializer as `csvStreams`). The result is passed to `res.send()` — byte-identical to the pre-refactor path. Express computes a strong ETag and can answer `304 Not Modified` for conditional requests.
- Streamed mode: feeds each prepared row into the `csvStreams` Transform (same compiled serializer, same header emission, same empty-set header-only behavior). The Transform is piped through `res.throttle('dynamic')` into `res`.

**`collect(source)`:** materializes the whole `hits` iterable into an array for hard formats (xlsx/ods/geojson/shp/wkt/vector tiles). The xlsx/ods branch then iterates the collected hits with an event-loop yield every 500 items (`setImmediate`) to avoid blocking the event loop during large exports.

## 6. Documented limitations of streamed mode

Two behavioral asymmetries vs buffered mode are intentional and documented:

1. **No `Link: next` header in streamed mode.** The `Link` header must be set before any body bytes are written, but the last hit's `sort` value (needed to build the `after` cursor) is only known once the stream ends — by which time headers are already flushed. The body `next` field is preserved: it is appended to the JSON tail once the last hit is known, built identically to the buffered path.

2. **No ETag / `304 Not Modified` in streamed mode (json and csv).** Incremental writes via `res.write()` preclude `res.send()`, so Express cannot compute a strong ETag from the body. Cache-control headers for `cacheHeaders.resourceBased` are still set, but conditional-request caching (`If-None-Match`) does not apply to streamed responses. Buffered mode (the default for both json and csv) retains ETag/304 via `res.send()`.

Buffered mode retains both behaviors and remains the default.

## 7. Error handling and backpressure

**ES errors resolve before the first byte.** The `asStream` request uses the same `allow_partial_search_results: 'false'` and timeout as the buffered path. If ES returns a non-200 status, `search-stream.ts` reads the body, parses the error, and throws an `httpError` before `streamToSource` is called — the handler's `manageESError` surfaces it as a clean HTTP error. A partial body that is later truncated mid-stream is not possible for ES-level errors.

**Total serializer.** `prepareResultItem` is designed never to throw on data; it falls back gracefully. A residual mid-stream exception (after the first byte has been written, making a clean HTTP error impossible) is handled in two steps: (1) if it is a genuine anomaly (not a client disconnect), `internalError('stream-read-lines', err)` increments the `df_internal_error{errorCode="stream-read-lines"}` Prometheus counter and logs the error so on-call can investigate; (2) regardless of cause, `res.destroy(err)` tears down the connection so the client receives a truncated/broken body and can detect the failure rather than silently consuming partial data. **Client aborts are excluded from the counter**: a disconnect is detected via `req.aborted`, `res.destroyed`, `res.writableEnded`, `err.code === 'ERR_STREAM_PREMATURE_CLOSE'`, `err.name === 'AbortError'`, or `req.signal?.aborted` — these are expected in production and must not generate false alerts. The enveloped JSON format (opening `{` + `"results":[` … `]}`) makes truncation detectable by the client: an unterminated body causes a JSON parse error rather than silent data loss.

**Backpressure.** `streamJson` and `streamCsv` await the `drain` event when `res.write()` returns `false`, so the ES stream is paused until the client socket buffer clears. No hits accumulate behind a slow client.

**Client abort.** The decoded stream (gunzipped or raw) is destroyed when the `esAbortContext` signal fires (the same signal used by the request timeout and the client-disconnect wiring in `createEsRequestOptions`). This releases ES resources immediately on client disconnect.

**Gunzip.** When ES negotiates gzip encoding, the `asStream` body bypasses the client's auto-decompression. `search-stream.ts` detects `content-encoding: gzip` and pipes through `node:zlib.createGunzip()` before passing the decoded stream to `streamToSource`.

## 8. Parity contract

Streamed-mode output is **deep-equal (JSON) / byte-equal (CSV)** to buffered-mode output for the same request. Enforcement layers:

- **Unit fuzz (120 seeds × 2 formats, `lines-stream-parity.unit.spec.ts`):** randomized dataset schemas, hit shapes, query params (highlight, truncate, html, thumbnail, arrays, collapse, hint), and chunk sizes. The same `esResponse` is fed through both `bufferedSource` and `streamToSource(chunked(buf, chunkSize))`. Output must be `deepEqual` (JSON) / hex-identical (CSV).
- **Api tests (`stream-read-lines.api.spec.ts`):** a live 2500-row REST dataset. `?_stream=true` vs default on json, csv, collapse, geojson (hard fallback), error path, and a full-transfer no-truncation assertion.
- **Regression (flag off):** the full existing `/lines` api suite (`search-hint`, `cache-headers`, `csv-output`, `search-basic`, …) must pass unchanged — the buffered refactor (routing everything through the shared pipeline) must be exactly behavior-preserving.

## 9. Bounded-memory property

The streamed source is a pull-based bridge: `hits-stream.ts` only reads the next chunk from the ES stream when the consumer pulls the next hit. At any point, at most one chunk's worth of hit bytes is materialized as parsed objects. The rest of the response sits in the TCP receive buffer (OS) or the gunzip output buffer (one decompressor window), not in the Node process heap.

For the buffered source the memory model is unchanged: the full response is parsed, but this is the existing behavior and it keeps ETag/304 and the `Link` header.

## 10. Rollout — the go/no-go is a staging measurement

The flag is off by default. Before enabling in production:

1. Enable `experimental.streamReadLines: true` in staging.
2. Measure on the real pod under representative large responses: RSS, heap, GC overhead, event-loop lag (use `/cpu-profile` and `/heap-profile` observer endpoints).
3. Keep streamed mode only if peak-memory and GC/lag wins materialize without a throughput or latency regression.

The buffered mode remains the default and the safety fallback regardless of the staging outcome.
