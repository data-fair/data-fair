# Read hot-path optimization — decisions & journey

This is the **why** behind the `/lines` read path. For the **what/how of the shipped code**, see
[streamed-read-lines.md](streamed-read-lines.md); for raw measurements, see `benchmark/results/streaming-*.md`
and `benchmark/results/compiled-serializer.md`. This document exists so a future maintainer understands the
*decisions* — especially the ones that look surprising — without re-deriving them from scattered experiments.

## 1. The problem

A production pod serving `/lines` (dataset data reads, heavily used by embedded apps and maps) showed high
RSS, a ~7.7 GB reserved V8 heap, **GC at ~19% of active CPU**, and event-loop lag. Root cause: `/lines`
parsed the entire ES `_search` response into objects, ran a per-hit transform into a *second* object graph,
then serialized the whole result — peak ≈ `raw response + all parsed hits + all transformed rows + output
string` (~4–5× the payload). That transient object graph is promoted to old-gen and drives mark-sweep. The
symptom is **peak memory + GC cost**, not throughput.

## 2. The central decision: stream the *source*, not the *response*

The instinct "stream the output to `res`" is wrong here, and understanding why is the key to the whole design:

- A **streamed HTTP response** (`res.write`, headers flushed first) **cannot carry the `Link: next` header**
  (the `search_after` cursor is the last hit's `sort`, unknown until the stream ends) **nor a strong ETag**.
  `Link` is CSV's *only* pagination signal and is consumed by the UI's large-download loop; losing it is an
  unacceptable regression. (See the pivot that removed the earlier streamed-output implementation.)
- So we **stream the input and the processing, but assemble the body and `res.send` it**: read ES with
  `asStream` + an incremental splitter (raw response never held whole), serialize each row on the fly and
  **discard the transformed object immediately** (only the serialized bytes accumulate — flat allocations, no
  object graph), then `res.send` the complete body.

Result: peak drops from ~4–5× to ~1× the payload, the old-gen object graph that caused the GC spike is
eliminated, and because we `res.send` a finished body **every HTTP semantic is preserved with zero observable
change** — `Link` + body `next`, strong ETag, `Content-Length`, `304` on `If-None-Match`, exact key order.
The buffered↔streamed *source* choice is now purely an internal memory/CPU decision; it never changes output.

This is not the "epsilon peak" of true output streaming — the assembled body (~1× payload, bounded per request
by `maxPageSize`) is held briefly before send. That is the deliberate trade: **address the GC/RSS symptom with
zero API regression**, rather than chase a lower peak at the cost of the response contract.

## 3. What was tried, and the verdicts

Measure-first discipline; every negative result is kept as a record so it isn't re-litigated.

| Investigation | Verdict | Why |
|---|---|---|
| **Parser bake-off** (`@streamparser/json`, `jsonparse`, `stream-json`, `simdjson` vs V8) — `benchmark/results/streaming-parse-bakeoff.md` | **Negative** | V8's `JSON.parse`+build+`JSON.stringify` allocates least and is fastest on *total bytes*. But total-bytes was the wrong axis. |
| **Rust napi module** for the hot path | **Negative** | v1 ~2.3× slower — `serde_json::Value` DOM can't beat V8; the win would need columnar/borrowed parsing, not worth it. |
| **Streaming pipeline experiment** — `benchmark/results/streaming-pipeline-experiment.md` | **Positive** | You can't beat V8 on total churn, but you *can* collapse PEAK by never holding all N objects: process hits in batches so they die young in the scavenger instead of a giant graph promoted to old-gen. Peak collapses >4×–>410× at ~1× CPU (wide) / up to ~2.7× (tiny). This is the basis of the shipped design. |
| **Threshold sweep** — `benchmark/results/streaming-threshold-sweep.md` | Informative | Streaming's CPU overhead is a **shape-dependent tax, never zero**: ~1.0–1.3× for heavy/fat rows, ~2.2× moderate, up to ~2.7–4× tiny. So it's a memory-for-CPU trade. (Originally drove a content-length size gate; the gate was later dropped — the splitter overhead is negligible in absolute terms for small responses, and once output is always `res.send` there's no reason to branch on size.) |
| **Compiled fused `(hit)→jsonString` serializer** — `benchmark/results/compiled-serializer.md` | **Shelved** | ~1.41× on the plain path only, and only 33% of that path is the transform. Rich requests (`html=true`) are ~41× the plain path, dominated by `marked`+`sanitize-html` — the serializer is noise there. Not worth a second JIT generator + a hard byte-identity contract for a slice that isn't a proven hot spot. Prototype kept under `benchmark/`. |

## 4. The format sweep — which path each format takes, and why

Once the core pattern existed, each `/lines` format was routed to the treatment that fits it:

- **json / csv / geojson → streamed source + assemble-then-`res.send`.** Each hit maps independently to
  output (geojson's `bbox` is a separate `bboxAgg`), so all three serialize row-by-row and discard. geojson
  was *not* fundamentally a "hard" format — it only *looked* like one because it consumed `esResponse`
  directly.
- **pbf vector tiles (neighbors, non-vtPrepared) and shp → zero-copy raw-buffer-to-worker.** These already
  render/build in a worker thread, but the main thread parsed ES and structured-cloned a big object graph
  (geojson / rows) across the thread boundary — on the **hot** tile path, every request. Instead: `searchRaw`
  collects the raw ES bytes and **transfers them zero-copy** (`transferList`) to the worker, which parses +
  `result2geojson` + renders/`ogr2ogr` in-thread. Main thread does no parse and no clone. Gated off
  `_attachment_url`-selecting requests (the worker has no config to rewrite that URL → those stay buffered).
- **xlsx / ods → left buffered (deliberately).** The move *is* valid but low-ROI here: exports are **rare**
  (a user click, not a continuous map), so the same per-request saving is multiplied by far fewer requests,
  and the event-loop protection that makes it a systemic win on a hot path is just an occasional blip. The
  worker would also be **heavy** (xlsx runs the *rich* `prepareResultItem` → `marked`/`sanitize-html`). A
  CSV-string interchange was considered and rejected: the sheet has **typed cells** (numbers, dates via
  `new Date` + `aoa_to_sheet`), and CSV is all-strings — it would produce a text-only spreadsheet. If ever
  optimized, the right shape is transferring the **2D value array (`aoa`)** the worker already builds
  (compact *and* type-preserving), not CSV and not the heavy worker.
- **max-sampling / vtPrepared tiles, wkt → buffered (unchanged).** Multi-search concat / `_vt` script_fields
  / niche format — out of scope; no clear win.

## 5. Shelved / not done (with reasons)

- **Compiled serializer/transform** — §3; 1.41× on an already-fast, plain-only slice; not a proven hot spot.
- **xlsx zero-copy** — §4; rare + typed-cell constraints; `aoa`-transfer is the shape if it ever surfaces.
- **Synthetic pre-query ETag** — a `TODO` in `read.ts`. `res.send` already gives every response a strong
  ETag; a validator derived from `finalizedAt` + normalized query + shaping params would let `If-None-Match`
  return `304` *before* the ES query (on top of the existing `finalizedAt`/`Last-Modified` pre-query 304 in
  the `resourceBased` middleware). Secondary — the cheap 304 already covers most of it.

## 6. Cross-cutting guarantees

- **Zero observable change.** Streamed and buffered sources produce byte-identical output (json key order via
  a head-object-splice matching `JSON.stringify`; csv via the same `csvStreams` serializer; geojson/shp via a
  shared config-free `result2geojson`). Verified by parity fuzz + api equivalence tests, and by running the
  whole api suite through the streamed path (`FORCE_STREAM=1`, see below).
- **The `_attachment_url` ordering subtlety.** `search()` rewrites `hit._source._attachment_url` *up front*,
  so derived fields (the thumbnail hashes it when `attachmentsAsImage`) see the rewritten URL. The streamed
  path must therefore rewrite at the **top** of `prepareResultItem`, before highlight/thumbnail/html/truncate —
  not after. Getting this wrong 404'd thumbnails for virtual datasets; it's the kind of bug only an
  end-to-end forced-streaming run catches.
- **Rollout.** `experimental.streamReadLines` (default off) gates the json/csv/geojson streamed source; the
  tile/shp zero-copy paths are byte-identical and **not** flag-gated (always on). The go/no-go is a staging
  memory/GC measurement — it cannot change client-visible output, so the risk is purely operational.
- **`FORCE_STREAM=1` regression harness** (`tests/support/axios.ts`) appends `?_stream=true` to every `/lines`
  GET, so any api suite runs through the streamed source. Use it before flipping the flag and after any change
  to the streamed path.

## 7. Measurement lessons (the meta, worth carrying forward)

- **Measure the right axis.** Total-bytes said "V8 is optimal, give up." Peak-live + GC cost said "stream the
  source." Same code, opposite conclusion — pick the metric that matches the symptom.
- **Peak-LIVE, not heap occupancy.** An early metric read heap-used *including uncollected garbage* and was
  confounded; sampling peak only after a forced `global.gc()` fixed it.
- **A synchronous micro under-measures async overhead.** The threshold sweep is CPU-only; it can't see the
  per-hit async-generator step and per-row `await write` the real pipeline pays, so it's a *lower bound* — the
  production hot loop is leaner than its numbers suggest, and the bulk-iteration change closed part of that gap.
- **End-to-end beats static review for behavior parity.** The forced-streaming run found a real
  attachment/thumbnail regression that no amount of reading the diff would have surfaced.
