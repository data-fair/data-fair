# Design — production streaming `/lines` (buffered ⇄ streamed, converged)

**Status:** design / spec (approved in discussion). Production implementation.
**Date:** 2026-07-01
**Depends on / validated by:** the streaming-pipeline experiment
(`docs/plans/2026-07-01-streaming-pipeline-experiment-*.md`, `benchmark/results/streaming-pipeline-experiment.md`):
streaming the hits collapses peak-live memory (>4× to >410× across shapes) at ~1.0× CPU on large/wide
responses, independently confirmed by a capped-heap survival test and validated on a real ES `asStream`.

## 1. Why

`/lines` today parses the whole ES `_search` response into objects, transforms, and serializes the
whole output — peak memory ≈ raw response + all row objects + full output string. On large responses
this drives the production symptom (RSS, 7.7GB reserved heap, ~19% GC, event-loop lag). Streaming the
hits (never holding all N objects) removes that peak, at an acceptable CPU cost on large payloads.

## 2. Goal & non-goals

**Goal:** a production `/lines` that can run in a **streamed** mode which collapses peak memory, behind
an experimental flag, with a small-payload heuristic that stays buffered where streaming doesn't pay.
The buffered and streamed modes **share one transform/serialize pipeline** — they differ only in the
hit *source*.

**Non-goals (this effort):**
- Not removing the buffered path — it remains a first-class mode AND the fallback for hard cases.
- Not the JIT-compiled serializer optimization — orthogonal; can layer on later. Streamed serialize
  reuses the existing serialization semantics adapted to a per-row sink.
- Not enabling streaming by default — flag off; the go/no-go is a staging measurement (§9).

## 3. Architecture — one pipeline, swappable source

The core refactor: `readLines` stops thinking in "parse whole → array" and thinks in **a source of
hits + an envelope**, consumed identically by both modes.

### 3.1 The hit source

```ts
interface LinesResponse {
  head: EnvelopeHead              // { total?, took?, ... } — known at the START
  hits: AsyncIterable<EsHit>      // each hit, streamed or replayed
  tail: () => Promise<EnvelopeTail> // { aggregations?, totalCollapse? } — resolved at END
}
```

- **buffered source** — `JSON.parse(wholeBuffer)`; `head`/`tail` filled immediately from the parsed
  object; `hits` is an async generator over `parsed.hits.hits`. (This is the "buffered behaves as if it
  were a stream" convergence.)
- **streamed source** — ES `asStream` → optional gunzip → **hits splitter** (below). `head` resolves as
  soon as the hits-array prefix is seen; `hits` yields each hit slice (parsed by `JSON.parse` per hit,
  in batches of K≈100–1000); `tail` resolves when the stream ends.

### 3.2 The envelope skeleton (no custom envelope parsing)

The splitter captures the response text **before and after** the hits array and hands it to `JSON.parse`:
- `prefix` = bytes from start **through the `[`** (inclusive); `tailBytes` = from the **`]`** (inclusive)
  to end. `JSON.parse(prefix + tailBytes)` splices `[` + `]` → an empty `hits.hits: []` and returns the
  **entire envelope** (`total`, `_shards`, `aggregations`, `totalCollapse`, …) parsed by V8.
- Consequence: the **only** custom-parsing responsibility is finding the hits array boundaries and
  slicing each hit; every semantic part of the response goes through battle-tested `JSON.parse`. Robust
  to envelope key order (we keep everything except the hits content).
- Streaming order: `head` (incl `total`) from the prefix is available early; `tail` (incl
  `aggregations`) only after all hits — which matches the `/lines` JSON write order
  (`{"total":N,...,"results":[` → hits → `],"aggregations":…}`).

### 3.3 Shared transform + streamed serialize

For every hit from the source (either mode), the SAME per-hit path runs: `flatten` +
`prepareResultItem` (the existing derived-field logic — `_id`/`_score`, highlight, thumbnail, markdown,
truncate, attachment-url, geo distance) → serialize one row to a **sink**:
- JSON: write `{"total":…,"results":[` (head), then each row's JSON fragment, then `]` + tail envelope
  fields + the query hint, then `}`. Honor `res.write` backpressure (await drain).
- CSV: header (from the compiled csv serializer) then each row, streamed.
Because the per-hit transform is JS (unchanged from today), **all derived-field cases (html, thumbnail,
highlight, truncate) can stream** — unlike the Rust effort, streaming does not restrict them.

### 3.4 Hard cases — collect, then proceed as today

Formats that genuinely need the full array — **geojson (bbox over all), mvt/vt/pbf vector tiles
(`geojson2pbf`), shp, xlsx/ods (piscina)** — consume the source into an array first
(`const all = await Array.fromAsync(hits)`), then run exactly the current logic. Streamed source, but
materialized at a single, explicit point. No logic fork.

## 4. Mode selection

```
readLines
  ├─ validate, auth, permissions, build esQuery                      (unchanged)
  ├─ format needs the whole array (geojson/mvt/shp/xlsx/ods)? ──▶ buffered/collect source
  ├─ experimental.streamReadLines flag ON  AND  request eligible  AND  payload likely large?
  │      ├─ yes ─▶ STREAMED source (asStream → gunzip? → splitter)
  │      └─ no  ─▶ BUFFERED source (JSON.parse whole)               ← default, always correct
  └─ shared pipeline: head → per-hit transform+serialize → tail
```

- **Flag:** `experimental.streamReadLines` (default `false`), with a non-production per-request opt-in
  (`?_stream=true`, gated `NODE_ENV !== 'production'`) for api tests, mirroring the sibling Rust effort.
- **Small-payload heuristic:** stay buffered when the response is small (streaming's CPU overhead isn't
  worth it). Threshold on the cheapest available signal — `size`/page count, and/or the ES response
  `content-length` (available once the stream starts) — pick a conservative default (e.g. stream only
  when `size` ≥ N rows or content-length ≥ M bytes), configurable. Small payload → buffered.
- **Eligibility to stream:** json/csv formats. Ineligible → buffered. Rich derived fields are NOT
  excluded (they stream fine). Aggregation/collapse requests: the envelope skeleton recovers
  `aggregations`/`totalCollapse`, so they can stream too; if any prove awkward, they fall back to
  buffered (conservative predicate — when in doubt, buffer).

## 5. Error handling & backpressure

- **ES errors resolve before the first byte.** The stream is only started after the ES request returns
  200 (same `allow_partial_search_results:'false'` + timeout as today); ES failures surface as clean
  HTTP errors as now. Only *after* the first byte is written can we not send a clean status.
- **Total serializer:** the per-hit serialize is total (never throws on data; falls back to a generic
  encoder), so a mid-stream throw is designed out. On any residual mid-stream failure, `res.destroy(err)`
  + log + metric; the **enveloped JSON** makes truncation detectable (unterminated → client parse error,
  not silent loss).
- **Backpressure:** honor `res.write() === false` → await `'drain'`; and propagate client abort to the ES
  stream (destroy it) — reuse the existing `esAbortContext` wiring.
- **gunzip:** if the ES client negotiates gzip (compression option), `asStream` bypasses auto-decompress
  — pipe through `zlib.createGunzip()` (as found in the Rust effort's `searchRaw`).

## 6. Parity contract

Streamed-mode output must be **deep-equal (JSON) / byte-equal (CSV)** to buffered-mode output for the
same request. Enforced by: a property/fuzz harness comparing the two sources through the shared pipeline
over randomized datasets/queries (including derived-field params), plus api tests hitting `?_stream=true`
vs the default on a live dataset. The splitter keeps its own byte-level fuzz test (boundary correctness).

## 7. Key modules (production)

- `api/src/datasets/es/hits-splitter.ts` — the incremental byte splitter (boundary-finding + hit slices
  + prefix/tail capture for the envelope skeleton). Fuzz-tested. Promoted/hardened from the experiment's
  `benchmark/src/streaming-parse/streaming/splitter.ts`.
- `api/src/datasets/es/search.ts` — a streamed search returning `{ head, hits, tail }` via `asStream`
  (+ gunzip), alongside the existing `search`. Reuses `prepareQuery`, querystring, abort/timeout.
- `api/src/datasets/routes/read-lines-pipeline.ts` (new) — the shared consumer: given a source and the
  request context, run per-hit `prepareResultItem` + streamed serialize (json/csv) to `res`, or
  `Array.fromAsync` for hard formats. Buffered mode wraps `JSON.parse(whole)` as a source.
- `api/src/datasets/routes/read.ts` — `readLines` refactored to: pick the source (mode selection §4),
  delegate to the pipeline. Existing geo/wkt/tile/sheet branches call the collect path.
- `api/config/*` — `experimental.streamReadLines` flag (+ heuristic thresholds), default off.

## 8. Testing

- Splitter byte-fuzz (boundary correctness) + envelope-skeleton test (JSON.parse of prefix+tail recovers
  `total`/`aggregations`).
- Pipeline parity fuzz: buffered-source vs streamed-source through the shared pipeline → identical output,
  across shapes and derived-field params.
- Api: `?_stream=true` vs default on a live dataset — json deep-equal, csv byte-equal, hint parity,
  `next` link parity, an aggregation request, and a hard-format request (geojson) still correct.
- Regression: the full existing `/lines` api suite passes with the flag OFF (buffered refactor is
  behavior-preserving) — the buffered refactor is the risky part; the suite is the guard.
- Backpressure/abort: a slow-client and a client-abort test confirm the ES stream is paused/destroyed.

## 9. Rollout & the go/no-go

Flag off by default. After parity is green and the existing suite passes with the refactor, enable in
staging/controlled prod and measure on the real pod (observer `/cpu-profile`, `/heap-profile`, RSS, GC,
event-loop lag) on representative large responses — **the "last benchmark session."** Keep the streamed
mode only if the peak-memory/GC/lag win materializes without a throughput/latency regression that hurts.
The buffered mode remains the default and the safety net regardless.

## 10. Honest risk register (carried from the design discussion)

- **The buffered refactor is the highest risk** — rewriting the default path to consume the shared
  pipeline must be exactly behavior-preserving. The existing api suite is the gate; do it first and
  independently, flag untouched.
- **The splitter is the only custom-parsing surface** — kept small (boundary-finding), fuzz-tested; the
  envelope goes through V8.
- **Streaming error model + backpressure** — designed for (ES resolves pre-stream; total serializer;
  enveloped truncation detection; drain/abort), but must be implemented with discipline.
