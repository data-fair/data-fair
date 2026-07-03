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
download loop) nor a strong ETag. Instead the **source and the processing stream, and the assembled body is
`res.send`'d**:

- ES is read with `asStream` + an incremental hits splitter, so the raw response is never held whole;
- each row is serialized on the fly and the transformed object discarded — only the serialized bytes
  accumulate (flat allocations that die young, no old-gen graph);
- the complete body is assembled and sent: every HTTP semantic (`Link` + body `next`, strong ETag,
  `Content-Length`, `304`, exact key order) is preserved with **zero observable change**.

Peak drops to ~1× the payload (bounded per request by `maxPageSize`). Going lower would require true output
streaming, i.e. giving up the response contract — the deliberate trade is to stop at ~1×.

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
- **pbf tiles (neighbors, non-vtPrepared) and shp → zero-copy raw-buffer-to-worker** (always on,
  byte-identical). These render in a worker anyway; the main thread used to parse ES and structured-clone a
  big geojson graph across the thread boundary on every tile. Now `searchRaw` keeps the raw bytes and
  transfers the Buffer's own ArrayBuffer (`utils/worker-transfer.ts`; copy only for small pooled buffers),
  and the worker wraps the transferred bytes without copying — the main thread does no parse and no clone.
  Gated off `_attachment_url`-selecting requests (the worker can't rewrite that URL → buffered path).
- **xlsx / ods → deliberately buffered.** Exports are rare (a click, not a map), the worker would be heavy
  (rich `prepareResultItem` → `marked`/`sanitize-html`), and CSV-string interchange would lose typed cells.
  If ever optimized: transfer the 2D value array (`aoa`), not CSV.
- **wkt, vtPrepared / max-sampling tiles → unchanged** (niche / multi-search / script_fields).

## Errors and limits

Everything resolves **before** `res.send`: an ES non-200, a transform throw, or a mid-stream read error
becomes a clean HTTP error with no partial body. Any error while iterating destroys the source stream
(`LinesSource.destroy`) so the ES transport connection is released; client abort destroys it via the
`esAbortContext` signal. Bandwidth throttling (`res.throttleEnd()`) and all caching layers (pre-query
`finalizedAt` 304, `?finalizedAt=` cache, ETag 304) apply identically to both sources. Gzip from ES is
piped through `createGunzip` (asStream bypasses auto-decompression).

## Rejected and shelved (measured — do not re-litigate)

| Idea | Verdict | Why (record) |
|---|---|---|
| Stream the HTTP response | **Rejected** | Loses `Link: next` + strong ETag — the response contract is worth more than the last ~1× of peak. |
| Streaming/SIMD JSON parsers (`@streamparser/json`, `jsonparse`, `stream-json`, `simdjson`) | **Negative** | V8 allocates least and is fastest on total bytes — `benchmark/results/streaming-parse-bakeoff.md`. Total-bytes was the wrong axis; peak-live was the right one (same code, opposite conclusion). |
| Rust napi hot path | **Negative** | v1 ~2.3× slower; `serde_json::Value` can't beat V8. |
| Compiled fused `(hit)→jsonString` serializer | **Shelved** | ~1.41× on the plain slice only; rich requests are dominated by `marked`/`sanitize-html` — `benchmark/results/compiled-serializer.md`. |
| Size threshold for streaming | **Dropped** | Splitter overhead negligible; with assemble-then-send there is nothing to branch on — `benchmark/results/streaming-threshold-sweep.md`. |
| Synthetic pre-query ETag (skip ES on `If-None-Match`) | **Shelved** | The pre-query `finalizedAt`/`Last-Modified` 304 already covers most of it. |
| xlsx zero-copy worker | **Shelved** | Rare + typed cells; `aoa`-transfer is the shape if it ever surfaces. |

## Key modules

`es/hits-splitter.ts` · `es/hits-stream.ts` · `es/search-stream.ts` (one `openSearchStream` shared by
`searchStream`/`searchRaw`) · `routes/lines-source.ts` · `routes/lines-pipeline.ts` ·
`routes/lines-body.ts` · `utils/worker-transfer.ts` · `routes/read.ts` (`readLines` mode selection).

## Rollout

Enable `experimental.streamReadLines` in staging, measure RSS / heap / GC overhead / event-loop lag under
representative large responses (`/cpu-profile`, `/heap-profile`), keep it on if they improve without a
latency regression. The buffered source remains the default and the fallback regardless.
