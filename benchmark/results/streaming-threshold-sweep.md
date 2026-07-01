# Streaming `/lines` — threshold sweep (activation size + batch byte-size)

Harness: `benchmark/src/streaming-parse/streaming/threshold-sweep.ts`
Run: `node --expose-gc --experimental-strip-types --disable-warning=ExperimentalWarning benchmark/src/streaming-parse/streaming/threshold-sweep.ts`
Node v24.16.0, RELEASE, strip-types (no native build). Self-re-execs with a **large** young gen
(`--max-semi-space-size=256`) applied uniformly to every cell so young-gen GC does not distort ms.
Median of 9 runs/cell, 3 warmups. Representative row ≈ **238 bytes** (`benchSchema` via `generateRows`:
str1 sentence, str2 category, num1/num2, date1, lat, lon — a moderate string/number mix).

Variants:
- **buffered** = `bufferedV8`: `JSON.parse(whole).hits.hits` → build rows → one `JSON.stringify` (the current path).
- **streamed** = `streamingBytes`: splitter → **byte-adaptive** batching (accumulate hit slices until
  combined bytes ≥ target, then `JSON.parse('['+slices.join(',')+']')`, transform, serialize incrementally,
  drop; running byte counter reset per flush; fresh array per flush — no `Array.shift` O(n²) drain).

**Equivalence gate:** for every cell the streamed JSON output is `assert.deepEqual`-compared to the
buffered/v8 reference before timing. All cells passed (no DISQUALIFY).

---

## Axis 1 — response SIZE sweep (streamed batch = 64KB), median of 9, 3 runs

| target | rows | actual | buffered ms | streamed ms | **ratio str/buf** | buf peak MB | str peak MB |
|-------:|-----:|-------:|------------:|------------:|------------------:|------------:|------------:|
| 10KB   |   43 |  10KB  | 0.11–0.12   | 0.44–0.49   | **~4.0** (3.7–4.4) | 0.03 | ~0.02 |
| 25KB   |  108 |  25KB  | 0.22–0.24   | 0.95–0.99   | **~4.3** (4.1–4.5) | 0.08 | ~0.03 |
| 50KB   |  216 |  50KB  | 0.40–0.44   | 1.55–1.76   | **~3.9** (3.9–4.0) | 0.15 | ~0.03 |
| 100KB  |  431 |  99KB  | 0.74–0.78   | 1.87–2.33   | **~2.7** (2.5–3.1) | 0.30 | ~0.07 |
| 250KB  | 1078 | 249KB  | 2.08–2.35   | 5.11–5.35   | **~2.4** (2.3–2.5) | 0.76 | ~0.00 |
| 500KB  | 2156 | 500KB  | 3.92–4.26   | 9.43–9.96   | **~2.4** (2.3–2.4) | 1.51 | ~0.00 |
| 1MB    | 4415 | 1.00MB | 7.17–7.50   | 17.06–17.94 | **~2.4** (2.3–2.5) | 3.29 | ~0.00 |
| 2MB    | 8829 | 2.01MB | 13.66–14.28 | 29.75–32.15 | **~2.2** (2.2–2.25)| 6.57 | ~0.00 |
| 5MB    |22073 | 5.06MB | 32.59–32.84 | 71.88–75.00 | **~2.26** (2.2–2.3)|16.61 | ~0.00 |

### Activation threshold — honest reading

The task looked for the size where streamed/buffered CPU ratio drops to **≤1.10** ("effectively free").
**That threshold is never reached for this pipeline and data shape.** The ratio improves as fixed
per-request costs amortize, then **flattens at ~2.2–2.4x** — a persistent, real CPU tax of streaming.

- Where the ratio **stops improving (flattens)**: **~100–250KB**. Below 100KB the ratio is worse (≈3.9–4.4x),
  so streaming is especially unattractive for small responses (fixed splitter/batch startup cost dominates).
  At ≥250KB the ratio is stable at ~2.2–2.4x and only drifts slightly toward 2.2 at 2–5MB.
- Streaming is a **memory optimization, not a CPU one.** The ~2.2x is inherent: the byte-by-byte JS
  splitter scan, per-hit `Buffer.from` copy + reparse, and **incremental per-field serialization**
  (many small `JSON.stringify` calls vs one native `JSON.stringify(rows)` in buffered) all cost extra.

### Peak memory — the real motivation (CONFIRMED)

- **Buffered peak grows ~linearly with response size**: 0.03 → 0.30 → 1.51 → 3.29 → 6.57 → **16.61 MB**
  (10KB → 100KB → 500KB → 1MB → 2MB → 5MB). It holds the whole parsed object graph + the full output.
- **Streamed peak stays flat** at ≈0 (≤0.07 MB, below measurement resolution) for every size — only one
  ~64KB batch of hits is ever live. This is the entire point of streaming.

**Practical activation rule:** activate streaming by **response size as a memory-pressure gate**, not by a
CPU crossover. A sensible floor is **~500KB–1MB**: below it buffered peak is small (≤1.5MB) and streaming
just costs ~2.2–4x CPU for little memory win; at/above it buffered peak (1.5MB → 16MB and climbing) is
worth avoiding under concurrency, and the streamed CPU tax is at its most-amortized (~2.2–2.4x). Below
~100KB, always buffer (streaming ratio ≈4x, memory saving negligible).

---

## Axis 2 — BATCH byte-size sweep (fixed response 2.01MB, 8829 rows), median of 9, 3 runs

Buffered reference on the same response: ~13.0–13.9 ms, peak 6.57 MB.

| batch  | streamed ms (3 runs) | vs buffered | within best % | peak MB |
|-------:|---------------------:|------------:|--------------:|--------:|
| 4KB    | 30.9 / 31.4 / 32.5   | ~2.3x       | ~0–4%         | ~0.00 |
| 8KB    | 31.8 / 31.6 / 31.9   | ~2.3x       | ~7% / ~0%     | ~0.00 |
| **20KB**| **29.9 / 31.6 / 32.5**| **~2.3x**  | **~0.8–2%**   | **~0.00** |
| 64KB   | 29.7 / 32.4 / 31.8   | ~2.3x       | ~0% (best)    | ~0.00 |
| 100KB  | 30.1 / 32.3 / 31.6   | ~2.3x       | ~1.5%         | ~0.00 |
| 256KB  | 34.7 / 34.2 / 33.5   | ~2.5x       | **~15–17% worse** | ~0.00 |
| 512KB  | 34.2 / 33.8 / 35.8   | ~2.5x       | ~15% worse    | ~0.00 |

### Recommended batch byte-size

**~20KB** (validates the hypothesis). CPU is **flat across 4KB–100KB** (all within a few % of the best,
which floats between 20KB and 64KB run-to-run); it then **degrades ~15%** at ≥256KB, because a larger
batch materializes more rows per `JSON.parse` at once (bigger transient arrays, worse cache locality).

20KB is the recommended sweet spot: it is comfortably inside the flat region (within ~1–2% of best),
large enough to fully amortize per-`JSON.parse` call overhead (going smaller to 4–8KB adds parse calls
with no ms benefit and slightly noisier timings), and keeps the live batch small so peak stays minimal.
Peak was below measurement resolution for every batch size at this response, so batch choice is a pure
CPU/parse-overhead tradeoff here — but at much larger responses a bigger batch is what would grow peak,
so keeping it at 20KB is the safe low-peak choice.

---

## Caveats / integrity notes

- **The pure-CPU crossover to "effectively free" does not exist for this pipeline** — streaming plateaus at
  a ~2.2x CPU cost. Report this plainly: streaming's justification is bounded peak memory, not CPU parity.
- This is an **in-memory** bench: it excludes the `asStream` socket/backpressure setup fixed cost that the
  real HTTP path pays once per request. That fixed cost makes streaming *relatively worse* for small
  responses, so the real activation size floor should carry a **margin above** the pure-CPU picture — i.e.
  the ~500KB–1MB memory-gate recommendation should be treated as a floor, not a hair-trigger.
- Variance: buffered ms spread is tight (≤±10%); streamed ms is noisier (±10–15% at large sizes) but the
  ratio and the batch-size ranking are stable across all 3 runs. Ratios above are given as run ranges.
- The ~2.2x includes an avoidable sliver: `emitRowJson` re-`JSON.stringify`s the constant column keys per
  row. Precomputing key JSON once per column would shave a few % off the streamed side but does not change
  the conclusion (still well above 1.10). Left as-is to measure the *current* pipeline faithfully.
