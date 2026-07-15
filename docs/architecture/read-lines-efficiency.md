# `/lines` read efficiency — the choices and why

The dataset `/lines` endpoint is the API's hottest path — its main consumers are pure API clients reading
our clients' datasets (embedded apps and maps come on top). This document records the design choices that
keep it efficient, including what was **rejected**, so none of it gets re-litigated. Raw measurements live
in `benchmark/results/streaming-*.md` and `benchmark/results/compiled-serializer.md`.

**The problem being solved:** the historical path parsed the whole ES `_search` response into objects, ran
a per-hit transform into a second object graph, then serialized everything — peak ≈ 4–5× the payload, with
the transient graph promoted to old-gen. Production symptom: high RSS + GC at ~19% of CPU. The symptom is
**peak memory and GC**, not throughput — V8's `JSON.parse`/`JSON.stringify` is near-optimal on total bytes
(the parser bake-off and a Rust prototype both lost to it, see the table below); the win comes from never
holding all N objects at once.

## The central choice: stream the source, not the response

Streaming the HTTP *output* (`res.write`, headers first) was rejected: it cannot carry the `Link: next`
header (the `search_after` cursor is the last hit's `sort` — CSV's only pagination signal, used by the UI
download loop) nor a content-derived ETag (ours is weak-format, `W/"…"` — see BodyAccumulator). Instead the **source and the processing stream, and the fully-determined
body is then written out sequentially**:

- ES is read with `asStream` + an incremental hits splitter, so the raw response is never held whole;
- each row is serialized on the fly and the transformed object discarded — only the serialized bytes
  accumulate (flat allocations that die young, no old-gen graph);
- the complete body is determined before the first byte: every HTTP semantic (`Link` + body `next`, the
  weak content-derived ETag, `Content-Length`, `304`, HEAD, exact key order) is preserved with **zero
  observable change**.

The assemble-then-send contract needs the body fully *determined*, not *contiguous* — so the accumulated
~64 KB parts are never `Buffer.concat`'d (except tiny bodies: at or below one flush threshold the parts
collapse to a single part, one write on the dominant small page — the exact pre-refactor profile).
`BodyAccumulator.finish()` returns `{ parts, length, etag }` (the sha1 was fed incrementally per part;
`Content-Length` is the sum; the parts array is consumed destructively by the send — ownership moves) and
`sendPreparedParts` (`lines-pipeline.ts`) hands the parts to `res.endParts` (installed by
`res.throttleEnd`, `rate-limiting.ts`), which pipes a `Readable` over a shifting generator through the
SAME `res.throttle()` bandwidth Transform the raw-download routes use — no bespoke write loop: the pipe
provides the backpressure, `res.throttle` the token bucket + send-slot queue-full teardown, the streams'
high-water marks bound read-ahead to ~1 MB, and the generator's `shift()` releases each part as the pipe
pulls it. Together they keep the whole pre-refactor wire contract: the charset suffix `res.send(string)`
used to append, `req.fresh` → 304 (delegated back to express's `res.send` with an empty chunk), HEAD,
explicit `Content-Length`, and — previously the wrapped `res.end`'s job, not `res.send`'s — the
bandwidth throttling. The old 2×-body concat transient is gone **and memory decreases during the send**
instead of pinning ~1× body for the duration of a slow-client throttled download (the prod heap
profile's "transient assemble-then-send body/Buffer" spike, ~1.2 GB external).

Peak drops to ~1× the payload at assembly time (bounded per request by `maxPageSize`), decaying during
the send. Going lower would require true output streaming, i.e. giving up the response contract — the
deliberate trade is to stop at ~1×.

Because the buffered↔streamed choice cannot change any client-visible output, it is safe behind a flag:
`experimental.streamReadLines` (default off), with a non-prod `?_stream=true` opt-in for tests. Rollout is a
staging memory/GC measurement, not a behavior gate. There is **no size threshold** — the splitter overhead
is negligible for small responses, so eligible requests always stream.

## The streamed source

- **Splitter** (`es/hits-splitter.ts`, the only custom-parsing surface): slices the byte stream into a
  prefix (through `"hits":[` — located with a string/depth-aware scan that fails loudly on an unexpected
  envelope), each hit's bytes, and a tail. **The envelope is never parsed incrementally**: prefix ends `[`,
  tail starts `]`, so `JSON.parse(prefix + tail)` at end of consumption recovers the whole skeleton
  (`hits.total`, `aggregations`, …) with an empty hits array.
- **Batched parse** (`es/hits-stream.ts`): complete hit slices accumulate to ~20 KB, then one
  `Buffer.concat` + one `JSON.parse` yields the batch as a bulk — amortizes per-parse overhead (CPU flat
  ~4–100 KB, degrades past ~256 KB per the threshold sweep) while keeping peak at one batch of bytes.
- **Nothing is consumed at creation and nothing needs `total` before the hits are drained** — the
  `LinesSource` interface is just `{ hits: AsyncIterable<bulk>, tail(), destroy?() }` and consumers read
  `total` from `tail().hits.total?.value`. This matters: `after=` pages and `count=false` set
  `track_total_hits:false`, so ES omits `hits.total`; any "wait until total is known" step would silently
  buffer those responses whole (a first iteration did exactly that).
- **Hot-loop discipline**: bulks (not per-hit async steps — thousands of microtasks saved per page),
  synchronous per-row serializers inside one shared `consumeHits` loop (500-row `setImmediate` yield),
  byte-assembly in the config-free `lines-body.ts` so the output contract is unit-testable without config.

Both sources flow through the **same single pipeline per format** — the source is the only difference, so
byte-parity holds by construction. It is enforced by a 120-seed parity fuzz
(`lines-stream-parity.unit.spec.ts`), a live api equivalence suite (`stream-read-lines.api.spec.ts`,
including `count=false`/`after=` pages and the error path), and a `FORCE_STREAM=1` harness
(`tests/support/axios.ts`) that pushes any api suite through the streamed source — run it before flipping
the flag. That end-to-end harness caught a real bug static review missed: `_attachment_url` must be
rewritten at the **top** of `prepareResultItem`, before derived fields (thumbnails) consume it.

## Per-format routing

- **json / csv / geojson → streamed source** (flag-gated). Each hit maps independently to output; geojson's
  `bbox` is a separate `bboxAgg` that runs concurrently with hit consumption; csv rows go through the same
  compiled serializer as the buffered export.
- **pbf tiles (neighbors, non-vtPrepared), shp, wkt, xlsx / ods → zero-copy raw-buffer-to-worker** (always
  on, byte-identical). These render/serialize whole pages, so the main thread used to parse ES and either
  run the serialization itself (wkt: one monolithic `geojsonToWKT`, ~220ms at 10k polygons) or
  structured-clone a big object graph across the thread boundary (tiles/shp: the geojson; sheets: the
  prepared rows array, 38–234ms at 10k rows). Now `searchRaw` keeps the raw bytes and transfers the
  Buffer's own ArrayBuffer (`utils/worker-transfer.ts`; copy only for small pooled buffers), and the worker
  wraps the transferred bytes without copying — the main thread does no parse, no per-row prep and no
  clone. Two flavors of the `_attachment_url` question: shp/tiles are *gated off* requests selecting it
  (their geojson build can't rewrite it → buffered fallback), while the sheet worker runs the full
  `prepareResultItem` with `ctx.rewriteAttachmentUrl = true` — the same shared-function contract the
  streamed json/csv/geojson modes rely on (pinned by `sheet-zero-copy.unit.spec.ts` /
  `wkt-zero-copy.unit.spec.ts`). Workers that report page pagination (wkt, sheets) return
  `count + lastHitSort` so read.ts emits the exact `Link` header the buffered path produced.
- **vtPrepared / max-sampling tiles → still buffered.** `max` fetches up to 4 sequential pages where each
  `after` cursor comes from the *parsed* last hit of the previous page — a raw-buffer path would have to
  parse on the main thread anyway. Bounded: the concat is capped at 10 MB of ES content (~47ms worst-case
  clone, measured). vtPrepared rides the same path (`max` is its default sampling) and additionally needs
  `script_fields` shaping that `searchRaw` deliberately omits.

## Errors and limits

Everything resolves **before the first byte is written**: an ES non-200, a transform throw, or a
mid-stream read error becomes a clean HTTP error with no partial body. Any error while iterating destroys the source stream
(`LinesSource.destroy`) so the ES transport connection is released; client abort destroys it via the
`esAbortContext` signal. Bandwidth throttling (`res.throttleEnd()`) and all caching layers (pre-query
`finalizedAt` 304, `?finalizedAt=` cache, ETag 304) apply identically to both sources. Gzip from ES is
piped through `createGunzip` (asStream bypasses auto-decompression).

## Rejected and shelved (measured — do not re-litigate)

| Idea | Verdict | Why (record) |
|---|---|---|
| Stream the HTTP response | **Rejected** | Loses `Link: next` + the content-derived ETag — the response contract is worth more than the last ~1× of peak. This rejection is about streaming *while consuming ES* (headers before the body is known); writing the assembled parts sequentially **after** the body is fully determined (`sendPreparedParts`, 2026-07) keeps every header byte-identical and does not contradict it — it refines it. |
| Streaming/SIMD JSON parsers (`@streamparser/json`, `jsonparse`, `stream-json`, `simdjson`) | **Negative** | V8 allocates least and is fastest on total bytes — `benchmark/results/streaming-parse-bakeoff.md`. Total-bytes was the wrong axis; peak-live was the right one (same code, opposite conclusion). |
| Rust napi hot path | **Negative** | v1 ~2.3× slower; `serde_json::Value` can't beat V8. |
| Compiled fused `(hit)→jsonString` serializer | **Shelved** | ~1.41× on the plain slice only; rich requests are dominated by `marked`/`sanitize-html` — `benchmark/results/compiled-serializer.md`. |
| Size threshold for streaming (500 KB content-length gate, `streamReadLinesMinBytes`) | **Dropped** | The gate was designed for the earlier streamed-*output* model, where streaming a response also changed its HTTP semantics — small responses were spared that plus streaming's *relative* CPU tax (~1.0–1.3× fat rows … ~2.7–4× tiny rows, `benchmark/results/streaming-threshold-sweep.md`). The assemble-then-send pivot removed the semantics difference entirely, and the only responses a threshold can exempt are small ones — where the absolute overhead is negligible. The relative tax on *large* tiny-row responses exists with or without a gate (it's the memory-for-CPU trade itself; watch CPU in the staging measurement). No gate also means one single code path per format once the flag is retired. |
| Synthetic pre-query ETag (skip ES on `If-None-Match`) | **Shelved** | The pre-query `finalizedAt`/`Last-Modified` 304 already covers most of it. |
| xlsx zero-copy worker | **Done (2026-07)** | Un-shelved by the stall audit: the rows-array clone measured 38–234ms of main-thread stall per export. Shipped as raw-buffer + in-worker `prepareResultItem` (not `aoa`-transfer): the worker parses the transferred ES bytes and preps rows itself, so the per-row cost leaves the loop too. |
| pbf `max`/vtPrepared zero-copy | **Rejected (2026-07)** | Sequential `after` pagination needs the parsed last hit per page — raw-buffer transfer can't avoid the main-thread parse. Bounded at ~47ms by the 10 MB concat cap. |

## Key modules

`es/hits-splitter.ts` · `es/hits-stream.ts` · `es/search-stream.ts` (one `openSearchStream` shared by
`searchStream`/`searchRaw`) · `routes/lines-source.ts` · `routes/lines-pipeline.ts` ·
`routes/lines-body.ts` · `utils/worker-transfer.ts` · `routes/read.ts` (`readLines` mode selection).

## Monitoring

Two Prometheus metrics (`misc/utils/observe.ts`) track detailed `/lines` usage — how much traffic actually
goes through an optimized path, per format, in requests and in bytes:

- `df_read_lines_total{format, mode, status}` — request counter. `format` is normalized to a bounded set
  (`json`/`csv`/`geojson`/`xlsx`/`ods`/`wkt`/`shp`/`pbf`/`other`); `mode` is the **outcome** of mode
  selection: `streamed` (asStream source), `raw-worker` (zero-copy tile/shp), `cache` (vt-cache hit, no ES
  query), `buffered` (the non-optimized baseline); `status` is the class (`2xx`…`5xx`).
- `df_read_lines_bytes{format, mode}` — histogram of successful response body sizes (Content-Length set by
  `res.send`), buckets 10 KB → 50 MB with a 500 KB edge (the once-considered streaming threshold), so the
  share of large reads — the population the streamed source exists for — is directly visible.

Durations per format remain on `df_req_step_seconds{routeName="…/lines?format=…", step}`. Grafana: row
« Lectures de données (/lines) » in the koumoul dashboard (`infrastructure/manifests/misc/grafana-koumoul.yaml`).

## Rollout

Enable `experimental.streamReadLines` in staging, measure RSS / heap / GC overhead / event-loop lag under
representative large responses (`/cpu-profile`, `/heap-profile`), keep it on if they improve without a
latency regression — the `df_read_lines_*` metrics above give the before/after view per mode. The buffered
source remains the default and the fallback regardless.
