# Streamed-source `/lines` — Architecture

**Status:** flag off by default; go/no-go is a staging memory/GC measurement (no behavior risk — see §6).
**Key modules:**
- `api/src/datasets/es/hits-splitter.ts`
- `api/src/datasets/es/hits-stream.ts`
- `api/src/datasets/es/search-stream.ts`
- `api/src/datasets/routes/lines-source.ts`
- `api/src/datasets/routes/lines-pipeline.ts`
- `api/src/datasets/routes/lines-body.ts` (config-free pure body/link builders)
- `api/src/datasets/routes/read.ts` (`readLines` handler)
- `api/src/datasets/utils/worker-transfer.ts` (zero-copy transfer plumbing for the tile/shp workers)

## 1. Why — and what we deliberately do NOT do

`/lines` historically parses the entire ES `_search` body into objects, applies per-hit transforms into a
second object graph, then serializes the whole result. Peak ≈ `raw response + all parsed hit objects + all
transformed row objects + output string` (~4–5× the payload), and that object graph is promoted to old-gen
and drives mark-sweep — the production symptom was GC at ~19% + high RSS on large responses.

**We do NOT stream the HTTP response.** Streaming the output (`res.write`, headers flushed first) was
evaluated and rejected: a streamed response cannot carry the `Link: next` header (CSV's only pagination
signal; also used by the UI download loop) nor a strong ETag, because both depend on the last hit / full
body which aren't known until the end. Losing them is an unacceptable regression.

**What we do instead — stream the SOURCE and the PROCESSING, then `res.send` the assembled body:**
- read ES with `asStream` + the hits-splitter, so the raw response is never held whole;
- serialize each row on the fly and **discard the transformed objects** — only the serialized bytes
  accumulate (flat allocations, never the object graph);
- assemble the complete body and `res.send` it.

Peak drops to ~1× the payload (the output buffer) and the old-gen object graph is eliminated, so the GC/RSS
symptom is addressed. Because we `res.send` a complete body, **every HTTP semantic is preserved with zero
observable change**: the `Link` header + body `next`, a strong Express ETag, `Content-Length`, and `304` on
`If-None-Match`. The buffered/streamed *source* choice is purely internal — it changes peak memory, never
the response.

## 2. The `LinesSource` abstraction

All per-hit processing routes through one interface; `hits` yields **bulks** (arrays), not individual hits,
to avoid an async-generator step per hit (mirrors the codebase's `iterHits`):

```ts
interface LinesSource {
  hits: AsyncIterable<any[]>   // each yielded array is a bulk of hits
  tail(): Promise<any>         // the full envelope (once hits are exhausted)
}
```

There is deliberately **no `total` property**: the body is assembled before `res.send`, so nothing needs the
total before the hits are drained — consumers read it from the tail envelope (`tail().hits.total?.value`,
absent when `track_total_hits:false`: `after=` pages, `count=false`). This is what keeps the streamed source
fully incremental for those responses (an earlier design pre-pumped the stream until the total was known,
which silently buffered whole no-total responses).

- **`bufferedSource(esResponse)`** — wraps a fully-parsed response; yields its whole `hits.hits` array as a
  single bulk; `tail()` is the esResponse itself, so the envelope reads are shared with the streamed source.
  Used for flag-off requests and every hard format (their esResponse comes from `search()`).
- **streamed source (`streamToSource(stream)`)** — built from an ES `asStream` body via the splitter.
  Creation consumes nothing; `hits` is a pull-based generator yielding one ~20 KB **parse batch** per step
  (see §3); at most one chunk of hit bytes is held. `tail()` drains the rest and returns the envelope
  skeleton.

## 3. The hits splitter, batching, and envelope skeleton

`createHitSplitter(onHit)` is the only custom-parsing surface: find the hits-array boundaries in the byte
stream and slice each hit's bytes. Three phases — **prefix** (accumulate until `"hits":[`, capture through
`[`), **array** (a brace-depth/in-string/escape state machine emits each `{…}` hit to `onHit`, then `]` →
tail), **tail** (accumulate the rest).

**Byte-adaptive batching (`hits-stream.ts`):** the bridge accumulates complete hit slices until ~20 KB,
assembles them as one Buffer (`[h0,h1,…]`, a single `Buffer.concat` + one decode — no per-hit `toString`),
and `JSON.parse`s the batch, yielding the resulting array as one bulk. This amortizes per-`JSON.parse`-call
overhead (CPU is flat ~4 KB–100 KB, degrades beyond ~256 KB per `benchmark/results/streaming-threshold-sweep.md`)
while keeping peak bounded — fat rows collapse to one hit per batch, skinny rows pack many. 20 KB is not
configurable. The drain uses an index cursor (no O(n²) `Array.shift`).

**Envelope skeleton** (`splitter.envelope()`): `JSON.parse(Buffer.concat([prefix, ...tail]))`. prefix ends
with `[`, tail starts with `]`, so their concatenation is `…"hits":[…]…` with an empty array — valid JSON
that V8 parses in full, recovering `hits.total` (when ES computed it), `_shards`, `aggregations`,
`totalCollapse`, etc. with no custom envelope parser. The splitter's whole interface is
`{ write, end, envelope }` — everything envelope-related is read once, at the end of consumption.

## 4. Mode selection

```
readLines
  ├─ neighbors/non-vtPrepared pbf tiles, and shp → searchRaw (raw ES bytes) → transferred zero-copy to the
  │       geojson2pbf/geojson2shp worker (parses + result2geojson + renders/ogr2ogr in-thread). Gated off
  │       `_attachment_url`-selecting requests (the worker can't rewrite that URL) → those fall to search().
  ├─ other hard formats (wkt/mvt+vt+pbf-max/vtPrepared/xlsx/ods) → buffered search() (+ collect for sheets)
  ├─ experimental.streamReadLines ON  AND  format json/csv/geojson  (eligible) → searchStream: asStream +
  │                                                                        splitter → streamed LinesSource
  └─ (flag off / ineligible) → search() → bufferedSource(esResponse)
          ↓
  shared pipeline: streamJson / streamCsv / streamGeojson  →  assemble body  →  res.send
```

**Flag:** `config.experimental.streamReadLines` (default `false`). Non-production per-request opt-in
`?_stream=true` (gated `NODE_ENV !== 'production'`) is equivalent to the flag and lets api tests exercise the
streamed source deterministically. `_stream` is dropped from the query copy so it never leaks into the
`next` link. There is **no size threshold** — eligible json/csv always use the streamed source (the splitter
overhead is negligible in absolute terms for small responses, and the output is `res.send` either way, so
there is no reason to choose based on size). `streamEligible`: `json`/`csv`/`geojson` (default = json) —
geojson qualifies because each hit maps independently to one Feature (`geo.hit2feature`) and its `bbox` is a
separate `bboxAgg` call, so `streamGeojson` serializes Features on the fly exactly like json. Hard
formats need the whole array (bbox, tile rendering, sheets) and stay on `search()`.

## 5. Shared per-hit pipeline (`lines-pipeline.ts`)

Both sources flow through **one path** per format — the source is the only difference, so parity holds by
construction. No `buffered`-vs-`streamed` output branch exists.

All three formats iterate through one shared **`consumeHits(source, perRow)`** loop: a SYNCHRONOUS per-row
serializer (no per-row await — that would reintroduce the microtask-per-hit overhead the bulk design
removed), a `setImmediate` yield every 500 rows so a synchronous (buffered) source doesn't starve the event
loop, count/lastHit tracking, and **destroy-on-error** (see §7). The pure byte-assembly lives in the
config-free `lines-body.ts` (`buildJsonBody` / `buildGeojsonBody` / `nextLinkHref`), unit-tested without
loading the app config.

**`streamJson`:** for each row `rows.push(JSON.stringify(prepareResultItem(hit, …)))` and drop the object.
Then `await source.tail()`, read `total` from the envelope, build the head object in the exact pre-refactor
key order `{ hint?, total?, next?, totalCollapse? }` and splice it with the rows (`buildJsonBody`). This is
**byte-identical** to `JSON.stringify` of the equivalent object (same key order, `JSON.stringify` per
value) → same ETag. `next` (a full page: `count === size`) is set both in the body and as the `Link` header.

**`streamCsv`:** the same compiled per-row serializer the buffered export uses (`outputs.compileForRequest`
→ `prologue` + `row(item)` strings, byte-equal to `results2csv`); no stream machinery — a serializer throw
propagates synchronously, before anything is sent. `parts.join('')` is the body.

**`collect(source)`** flattens the bulks into an array for the hard formats (xlsx/ods materialize + build).

Because the whole body is assembled before `res.send`, the last hit is always known → the `Link` header +
body `next` work for both formats and both sources. `res.send` gives ETag / Content-Length / `304`.
Bandwidth throttling is handled by the `res.throttleEnd()` wrapper set at the top of `readLines` (it
throttles the Buffer body), exactly as the pre-refactor buffered path did.

The read.ts pagination block still sets the `Link` header for the **hard formats** (shp/wkt/tiles, which read
`esResponse` directly and `res.send`); json/csv/geojson build their own inside the pipeline (from the
source's last hit, before `res.send`). Both call the same `nextLinkHref` in `lines-body.ts` — one pagination
contract. For geojson, read.ts starts the `bboxAgg` round trip without awaiting and `streamGeojson` awaits
it only after the hits are drained, so the two ES calls overlap (same idea for the shp raw path:
`Promise.all(searchRaw, bboxAgg)`).

## 6. No observable difference — this is the whole point

There is intentionally **no behavioral asymmetry** between the buffered and streamed sources. For the same
request, the response is identical either way: same body bytes, same body `next`, same `Link` header, same
ETag / `Content-Length`, same `304` behavior, same key order. The only difference is peak memory and CPU.
This is what makes the flag safe to flip: it cannot change what any client sees.

Caching is unaffected: the `finalizedAt`/`Last-Modified` `304` short-circuit in the `resourceBased`
middleware (runs before `readLines`, skips the query entirely), the `?finalizedAt=` timestamped 1-week
cache, and the Express ETag `If-None-Match` `304` all apply to every `/lines` response regardless of source.

## 7. Error handling and backpressure

**Everything resolves before `res.send`.** Because the body is assembled and only sent at the end, any
failure — an ES non-200 (surfaced by `search-stream.ts` as an `httpError` before `streamToSource`), a
transform error in `prepareResultItem`, or a mid-stream ES read error — throws *before* the first byte is
written and becomes a clean HTTP error status via the normal handler path. There is no partial/torn body and
no `df_internal_error` bookkeeping to distinguish anomalies from client aborts (that machinery, needed only
for incremental output, was removed).

**Mid-iteration errors release the ES connection.** Any error while iterating (a per-row transform throw or
a mid-stream ES read error) destroys the source stream (`LinesSource.destroy`, wired inside `consumeHits`
and the tail drain) before rethrowing — without this the handler would unwind with the ES response stream
still open, pinning a transport connection until the server times it out.

**Client abort.** The decoded ES stream is destroyed when the `esAbortContext` signal fires (request
timeout / client disconnect wiring in `createEsRequestOptions`); the source's async iterator then throws and
the handler unwinds, releasing ES resources.

**Backpressure.** `res.send` writes the assembled Buffer through the `throttleEnd` wrapper, which applies
the same bandwidth throttling the buffered path always used.

**Gunzip.** When ES negotiates gzip, the `asStream` body bypasses auto-decompression; `search-stream.ts`
detects `content-encoding: gzip` and pipes through `node:zlib.createGunzip()` before `streamToSource`. (By
default the client requests identity encoding.)

## 8. Parity contract

For the same request the streamed source and the buffered source produce byte-identical output — guaranteed
by construction (single pipeline path) and enforced by:

- **Unit fuzz (120 seeds × 2 formats, `lines-stream-parity.unit.spec.ts`):** randomized schemas, hit shapes,
  query params, and chunk sizes; the same `esResponse` fed through `bufferedSource` and
  `streamToSource(chunked(buf, size))` must match (`deepEqual` JSON / hex-identical CSV). Plus an
  `_attachment_url` rewrite-parity case (plain + virtual datasets).
- **Api (`stream-read-lines.api.spec.ts`):** a live 2500-row dataset — `?_stream=true` vs default on json,
  csv, collapse, hint, geojson (hard fallback), the error path, and a full-transfer no-truncation check,
  asserting the same results / total / body `next` / **Link header** either way.
- **Regression (flag off):** the existing `/lines` api suite (search, cache-headers, csv-output, …) passes
  unchanged — the pipeline output is byte-identical to the pre-refactor `res.send`.

## 9. Bounded-memory property

Streamed source: the splitter pulls the next chunk only when the consumer pulls the next bulk, so at most
one ~20 KB batch of hit bytes is parsed at a time — the raw response is never held whole and no full
object graph is built. What remains held is the accumulating serialized output (the `rows` string array →
joined body, or the CSV chunk buffers), i.e. ~1× the payload plus a transient copy at `res.send`. Peak is
therefore bounded by the **output size**, not by `raw + object-graph + output`. Per-request output is itself
bounded by `maxPageSize`, and under concurrency the eliminated old-gen object graph is the main GC win.

Buffered source (flag off / hard formats): the full response is parsed as today; the pipeline still
serializes-and-discards, so it holds the parsed array + the output but not a second transformed-object graph.

## 10. Rollout — a memory/GC measurement, not a behavior gate

The flag is off by default. Since the streamed source cannot change any client-visible output (§6), the
go/no-go is purely operational:

1. Enable `experimental.streamReadLines: true` in staging.
2. Measure on the real pod under representative large responses: RSS, heap, GC overhead, event-loop lag
   (`/cpu-profile`, `/heap-profile` observer endpoints).
3. Keep it on if peak-memory and GC/lag improve without a throughput/latency regression.

The buffered source remains the default and the fallback regardless.
