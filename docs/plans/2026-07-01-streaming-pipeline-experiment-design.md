# Design — end-to-end streaming parse pipeline experiment

**Status:** design / spec (approved in discussion; no implementation yet)
**Branch / worktree:** `perf-streaming-read-lines`
**Date:** 2026-07-01

## 1. Why (what the bake-off missed)

The parser bake-off (`2026-07-01-streaming-parse-bakeoff-*.md`, `benchmark/results/streaming-parse-bakeoff.md`)
measured **total bytes allocated** per iteration and found V8's `JSON.parse`+build+`JSON.stringify`
allocates least — no JS-tokenizer substrate beat it. But that answered the wrong question. The
production pain (first investigation: RSS 3.9GB, V8 heap 7.7GB reserved, GC 19% of active CPU,
event-loop lag) is about **peak memory and GC *cost*, not total churn**. And the bake-off never tested
the one design that targets peak: **stream the hits, using V8's `JSON.parse` per hit (or per small
batch) rather than parsing the whole response at once.**

Key distinction, established in discussion:
- You can't beat V8 on *total bytes* (delegating to `JSON.parse` forces one substring per hit) or on
  raw parse CPU. Those are settled.
- But processing hits **a batch at a time** holds only K hits' objects live instead of all N, and
  those objects die in **young-gen** (cheap scavenge) instead of a giant graph promoted to old-gen
  (expensive mark-sweep). Combined with **streamed output**, peak drops from ~3× payload to ~epsilon.
- Ruled out (discussion): **simdjson per hit** (native boundary + tape overhead per small hit, no
  memory win); **object pools** (`JSON.parse` gives no allocation hook; pooling plain objects fights
  V8's generational GC — the streaming design's young-gen churn is already the optimal pattern).

## 2. Goal & non-goals

**Goal:** measure whether an end-to-end streaming pipeline (split envelope + batched `JSON.parse` +
streamed serialize) cuts **peak memory and GC-pause** vs the buffered V8 path at an acceptable CPU
cost (≤~1.5×), and find the batching sweet spot K. Produce a clear verdict.

**Non-goals (this experiment):**
- No wiring into the real `/lines` endpoint — that is a later step *if* the numbers land.
- No simdjson-per-hit, no object pool (both ruled out in discussion).
- Not chasing total-bytes — this experiment is about peak + GC cost.

## 3. The pipeline under test

```
chunked byte stream → incremental splitter → batched JSON.parse (K hits) → transform → streamed serialize → sink
                                                                                              │ backpressure
```

- **Incremental splitter** — a state machine over the byte stream tracking `inString` (toggle on
  unescaped `"`, honoring `\` escape) and brace `depth` (only when not in a string). It:
  1. buffers the small envelope prefix until the `hits.hits` array `[` opens, extracting `total`;
  2. emits each complete hit `{…}` byte-slice as its matching close-brace arrives, buffering a partial
     hit across chunk boundaries;
  3. buffers the small tail after the array `]` (for `aggregations` etc.) to parse once.
  It has its OWN fuzz tests: over randomized hit content (strings with braces/brackets, escaped quotes,
  unicode), the concatenation of its slices re-parsed must deep-equal `JSON.parse` of the whole array.
- **Batching knob K ∈ {1, 100, 1000, whole}** — accumulate K hit slices, wrap `'['+join+']'`,
  `JSON.parse` the batch → K objects, transform, serialize, drop, next batch. K=1 is per-hit; K=whole
  is the degenerate single-parse (peak = all). The knob trades peak against parse-call/substring
  overhead.
- **transform** — the shared schema-driven `extract` (flatten + multivalue) from the bake-off.
- **streamed serialize** — write each row's JSON/CSV fragment to the sink as produced (never build the
  whole output string), so the output side is also O(one batch).
- **sink** — a writable that counts bytes and discards (or a null stream), so we measure the pipeline,
  not socket I/O.

## 4. Baseline & variants (all gated for equivalence)

- **buffered-v8** — the current path: read whole stream → `JSON.parse(whole)` → build all rows →
  `JSON.stringify(whole)`. The peak/CPU reference.
- **streaming-K1 / K100 / K1000 / Kwhole** — the pipeline above at each batch size.

Every variant must produce output that is **deep-equal (JSON) / byte-equal (CSV)** to the buffered-v8
reference (reuse the bake-off V8 oracle + `checkEquivalence`), or it is disqualified. Same descriptor.

## 5. Source

- **Primary: synthetic chunked stream** — `Readable` over the bake-off's synthetic buffers +
  the captured real buffer, emitted in realistic ~64KB chunks (deterministic; no ES dependency;
  reproducible). Exercises the chunk-boundary splitting.
- **Secondary (optional): real ES `asStream`** — validate the splitter/pipeline against a live ES
  `_search` stream (with the `zlib.createGunzip()` step if compression is on — the client bypasses
  auto-decompress under `asStream`, as found in the sibling Rust effort). Only if dev ES is up.

## 6. Metrics (peak + GC cost, NOT total-bytes)

Per variant × buffer, `--expose-gc`:
1. **Peak memory (primary)** — sample `heapUsed + external + arrayBuffers` at high frequency during ONE
   run (e.g. every N batches / a tight sampler), take the max, after a `global.gc()` baseline. Report
   peak MB. This is the number the whole experiment is about.
2. **Capped-heap survival (primary, robust)** — a stress variant: process a LARGE payload under a small
   `--max-old-space-size=N` (e.g. 128MB) and record which variants COMPLETE vs OOM. Expectation:
   streaming (small K) survives where buffered-v8 OOMs on a big enough response. A binary survive/OOM
   result is less noisy than sampled peak and is the most compelling demonstration.
3. **GC-pause (secondary)** — total GC pause time via the `perf_hooks` GC observer over the run (this
   now fires at scale, unlike the bake-off at 2k rows).
4. **CPU (the cost)** — ms/iter, to confirm the peak win doesn't cost more than ~1.5× vs buffered-v8.

Scale: run at 10k+ rows (≥ `maxPageSize`) so peak/GC are meaningful; the capped-heap test uses a
deliberately large payload (e.g. 50–100MB response) to force the OOM contrast.

## 7. Decision rule

The streaming design **wins** if, at some batch size K, it **cuts peak memory ≥2×** vs buffered-v8
(and/or **survives the capped-heap test where buffered-v8 OOMs**) at **≤~1.5× the ms/iter**, with GC
pause no worse. Report the K that best trades peak vs CPU. If no K achieves a meaningful peak cut
within the CPU budget, that is an honest negative — streaming's bookkeeping overhead isn't worth it,
and the serialization-only optimization (already planned) stands alone.

## 8. Deliverables & layout

Under `benchmark/src/streaming-parse/` (mirrors the bake-off):
- `streaming/splitter.ts` — the incremental byte-stream splitter (+ `splitter.test.ts` fuzz tests).
- `streaming/pipeline.ts` — the streaming variant (splitter → batched parse → transform → serialize →
  sink), parameterized by K; and the buffered-v8 baseline for reference.
- `streaming/bench.ts` — runs baseline + K-variants over the buffers with the equivalence gate; reports
  peak / GC-pause / ms; plus the capped-heap survival mode.
- `benchmark/results/streaming-pipeline-experiment.md` — peak/GC/CPU table, the survival results, the
  sweet-spot K, and the verdict (win → recommend wiring into `/lines`; or honest negative).

## 9. Pointers

- Bake-off (V8 oracle, descriptor, `extract`, `checkEquivalence`, buffers): `benchmark/src/streaming-parse/`.
- Sibling Rust effort (searchRaw + gunzip caveat, envelope/error-handling notes): `perf-rust-read-lines`
  worktree, `docs/architecture/rust-read-serializer.md`.
- Real capture: `benchmark/src/streaming-parse/capture-real.ts`.
