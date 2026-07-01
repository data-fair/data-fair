# Streaming pipeline experiment — results & verdict

## Verdict: POSITIVE

> **Decision rule (§7 of the design):** win = peak-live cut ≥2× at ≤~1.5× ms/iter, and/or survival where buffered-V8 OOMs.
>
> All three criteria are met:
>
> 1. **Peak-live collapse:** stream-K1/K100/K1000 → 0.0 MB on all narrow datasets; 0.3–0.7 MB on wide (300 cols) vs buffered-V8's 287 MB — from >4× (real, 12-col) to >410× (wide, 300-col) lower depending on dataset.
> 2. **Capped-heap survival:** at 96 MB heap / 200k rows, buffered-V8 and stream-Kwhole OOM; K1/K100/K1000 SURVIVE — a physical allocator signal, not a profiler artifact.
> 3. **CPU cost on wide (the high-memory case):** K1–K1000 run at 0.96–1.23× ms/iter — essentially tied with buffered-V8.
>
> **Recommendation:** wire the streaming pipeline (ES `asStream` → gunzip if needed → splitter → batched `JSON.parse` at K≈100–1000 → transform → streamed serialize → response) into the `/lines` endpoint as a separate implementation effort, composed with the serialization optimization already committed.

---

## Environment

| Item | Value |
|------|-------|
| Node.js | v24.16.0 (same worktree as bake-off) |
| Run flags | `--expose-gc --experimental-strip-types` |
| ROWS (synthetic) | 10,000 |
| CHUNK size | 65,536 bytes |
| Runs | 3 independent runs × 5 iterations each |
| Peak metric | Peak-live (gc-before-sample — see §Metric journey) |

---

## Peak-live memory

"Peak-live" = peak of `heapUsed + external + arrayBuffers` after a forced `global.gc()` before each memory
sample, so dead-but-uncollected garbage is excluded from the reading. See §Metric journey for why this
correction matters.

### Summary (all 3 runs consistent; values = stable median)

| dataset (cols) | buffered-v8 | K1 | K100 | K1000 | ratio (K1 vs buffered) |
|---|---|---|---|---|---|
| string-heavy (7) | 7.4 MB | 0.0 MB | 0.0 MB | 0.0 MB | >7× lower |
| number-heavy (20) | 17.4 MB | 0.0 MB | 0.0 MB | 0.0 MB | >17× lower |
| wide (300) | 287.0 MB | 0.3–0.7 MB | 0.0 MB | 0.0 MB | >410× lower |
| nested-multivalue (4) | 5.5 MB | 0.0 MB | 0.0 MB | 0.0 MB | >5× lower |
| real (12 cols, 10k rows) | 4.5 MB | 0.0 MB | 0.0 MB | 0.0 MB | >4× lower |

Buffered-v8 is stable at exactly these values in all 3 runs. Stream-K1/K100/K1000 reads 0.0 MB on every
narrow dataset in every run. Stream-K1 on wide varies 0.3–0.7 MB across runs (still <1 MB vs 287 MB);
K100/K1000 read 0.0 MB.

**stream-Kwhole** is excluded from the verdict: it accumulates all hit buffers before parsing, so peak is
degenerate and variable (0.0–50 MB across runs on wide, driven by V8 JIT timing of reference release). It
also OOMs in the survival test. Do not ship this variant.

### Raw peak-live data — 3 runs (peakLiveMB)

#### Run 1

```
=== string-heavy (7 cols) ===   === number-heavy (20 cols) ===  === wide (300 cols) ===
buffered-v8   7.4 MB            buffered-v8   17.4 MB           buffered-v8  287.0 MB
stream-K1     0.0 MB            stream-K1      0.0 MB           stream-K1      0.3 MB
stream-K100   0.0 MB            stream-K100    0.0 MB           stream-K100    0.0 MB
stream-K1000  0.0 MB            stream-K1000   0.0 MB           stream-K1000   0.0 MB

=== nested-multivalue (4 cols) ===                              === real (12 cols) ===
buffered-v8   5.5 MB                                            buffered-v8    4.5 MB
stream-K1     0.0 MB                                            stream-K1      0.0 MB
stream-K100   0.0 MB                                            stream-K100    0.0 MB
stream-K1000  0.0 MB                                            stream-K1000   0.0 MB
```

#### Run 2

```
=== wide (300 cols) ===
buffered-v8  287.0 MB
stream-K1      0.4 MB
stream-K100    0.0 MB
stream-K1000   0.0 MB
(all narrow datasets: identical to Run 1)
```

#### Run 3

```
=== wide (300 cols) ===
buffered-v8  287.0 MB
stream-K1      0.7 MB
stream-K100    0.0 MB
stream-K1000   0.0 MB
(all narrow datasets: identical to Runs 1 and 2)
```

---

## CPU cost (ms/iter)

### Wide (300 cols) — the high-memory case

| variant | Run 1 | Run 2 | Run 3 | vs buffered |
|---|---|---|---|---|
| buffered-v8 | 942 ms | 891 ms | 832 ms | — |
| K1 | 906 ms | 933 ms | 871 ms | 0.96× / 1.05× / 1.05× |
| K100 | 996 ms | 926 ms | 1001 ms | 1.06× / 1.04× / 1.20× |
| K1000 | 1039 ms | 985 ms | 1022 ms | 1.10× / 1.11× / 1.23× |

**Wide-dataset CPU is essentially tied:** K1–K1000 all run within 0.96–1.23× of buffered-V8. No K exceeds
the 1.5× budget. This is where memory matters most (287 MB vs <1 MB), and the peak win costs nothing
in CPU.

### Narrow datasets (representative: string-heavy, 7 cols)

| variant | Run 1 | Run 2 | Run 3 | vs buffered |
|---|---|---|---|---|
| buffered-v8 | 22.6 ms | 18.2 ms | 22.6 ms | — |
| K1 | 39.9 ms | 38.7 ms | 39.4 ms | 1.77× / 2.13× / 1.74× |
| K100 | 32.9 ms | 32.4 ms | 33.0 ms | 1.46× / 1.78× / 1.46× |
| K1000 | 35.3 ms | 34.8 ms | 34.9 ms | 1.56× / 1.91× / 1.54× |

K100/K1000 on string-heavy: 1.46–1.78×. Number-heavy and nested-multivalue show better ratios at K100
(1.14–1.50×; 1.16–1.40×). The "real" 12-col dataset shows ~2.3× at K100 and ~2.5–2.7× at K1000 (25.5–28.6 ms vs 10.8–11.3 ms baseline)
— proportionally high because the baseline is very short (11 ms). Both K100 and K1000 on this small
12-col dataset are the worst-case CPU ratios; however, the absolute memory there is trivial (4.5 MB),
so the CPU cost matters least where it is highest. On narrow datasets broadly, the absolute memory is
already trivial (0.0 MB vs 4.5–17.4 MB), so the CPU trade is less critical.

GC pause (`gcMs`) was 0.0 ms in every run and every variant — V8's GC was not triggered during the 5
measured iterations (working sets fit within young-gen; the benchmark forces a GC only in the peak-live
pass, not the timing pass).

---

## Capped-heap survival

ROWS=200,000 (string-heavy), payload=46.4 MB written to a temp file in the uncapped parent process,
children spawned with `--max-old-space-size=96`.

```
capped-heap survival: --max-old-space-size=96MB, 200000 rows (string-heavy, buf=46.4MB)
  buffered-v8  OOM
  whole        OOM
  1000         SURVIVED
  100          SURVIVED
  1            SURVIVED
```

**Calibration note:** at HEAP=128 MB, buffered-v8 survived (GC keeps peak-live below the cap at that
headroom). The clean OOM contrast required HEAP=96 MB, found by empirical tuning. At 96 MB, buffered-V8
exhausts the heap because it holds all N=200k parsed hit objects + all transformed row objects +
the serialized output string simultaneously. Streaming K≤1000 survives because it holds at most K hit
objects live at any moment, then drops them before fetching the next batch.

This result is mechanism-independent: it is V8's own allocator firing, not a profiler sample or
instrumented measurement.

---

## Real ES `asStream` validation

Validated the splitter and pipeline against a live ES `_search` stream on the dev ES instance:

```
real-es: emitted 5000 hits, splitter.total=5000
real-es OK
```

Index: `dataset-benchmark-perf-capture` (5000 docs). No gzip decompression was needed
(`accept-encoding: identity` was sufficient — no compression observed). All 5000 hit byte-slices
parsed cleanly by `JSON.parse`; `splitter.total` (extracted from the envelope `"total":{"value":5000}`)
matched `count` exactly. The splitter's state machine (brace-depth tracking + in-string flag +
partial-hit buffer across chunk boundaries) handles real ES wire format correctly.

Source: `benchmark/src/streaming-parse/streaming/real-es.ts`.

---

## Metric journey — the honest correction

### What the initial metric showed (before fix wave 1)

The first implementation of `measureRun` sampled `heapUsed + external + arrayBuffers` without forcing GC
before each sample. On **narrow datasets**, this showed streaming with *higher* peak than buffered-V8:

| dataset | buffered-v8 (old peakMB) | K1 (old peakMB) | direction |
|---|---|---|---|
| string-heavy | 14.6 MB | 33.7 MB | streaming 2.3× HIGHER |
| number-heavy | 32.7 MB | 58.6 MB | streaming 1.8× HIGHER |
| nested-multi | 12.5 MB | 26.2 MB | streaming 2.1× HIGHER |
| real | 9.7 MB | 22.1 MB | streaming 2.3× HIGHER |
| wide | 320.0 MB | 70.9 MB | streaming 4.5× lower (confirmed) |

This was a confound. The streaming pipeline churns more transient garbage: per-chunk `Buffer.subarray`
slices, batch join strings (`'[' + hits.join(',') + ']'`), per-hit objects that were already dead at
sample time but not yet collected by a scavenge. The heap-occupancy metric captured this dead garbage
in-flight, not the live set.

### The fix

`measureRun` was split into two passes:

1. **Timing pass** — no forced GC; records `ms/iter` and `gcMs`. Running the pipeline at full speed, no
   GC interference.
2. **Peak-live pass** — calls `global.gc()` before each memory sample, throttled to ≤50 GC calls per
   run via `stride = max(1, floor(N/50))`, with a final gc+read at the end. The column was renamed
   `peakLiveMB`.

After the fix, the direction on narrow datasets **completely reversed**:

| dataset | buffered-v8 (peakLiveMB) | K1 (peakLiveMB) | direction |
|---|---|---|---|
| string-heavy | 7.4 MB | 0.0 MB | streaming lower |
| number-heavy | 17.4 MB | 0.0 MB | streaming lower |
| nested-multi | 5.5 MB | 0.0 MB | streaming lower |
| real | 4.5 MB | 0.0 MB | streaming lower |
| wide | 287.0 MB | 0.3–0.7 MB | streaming dramatically lower |

The confound hypothesis was fully confirmed. Streaming's transient objects live and die in young-gen
between scavenges; the live set at any sample point is only the current batch (K objects), which is
tiny or already collected by the time the GC + sample fires.

The capped-heap survival test (§Capped-heap survival) independently confirms this via V8's own OOM
signal — a cross-check that is immune to profiler confounds by design.

**Implementation note:** `global.gc?.()` requires `--expose-gc`. This flag is present in the bench
runner environment and must not be added to the production process. The survival test uses a capped
child subprocess (`--max-old-space-size=N`) without `--expose-gc`, making it a cleaner
production-representative stress test.

---

## Contrast with the bake-off

The earlier parser bake-off (`benchmark/results/streaming-parse-bakeoff.md`) reached a **NEGATIVE**
verdict: no JS streaming substrate beats V8's `JSON.parse` + map + `JSON.stringify` on **total bytes
allocated** per iteration. The one partial allocation win (`@streamparser/json` on the 300-col wide
buffer: ~31% fewer bytes/iter) costs ~3× CPU, failing the ≤1.5× threshold.

These two results are **not contradictory**. They answer different questions:

| Experiment | Primary metric | Verdict | Winner |
|---|---|---|---|
| Parser bake-off | Total bytes allocated per iteration | NEGATIVE | V8 (`JSON.parse`) |
| This experiment | Peak-live memory during processing | POSITIVE | Streaming (K≤1000) |

Both findings are correct simultaneously:

- **You cannot beat V8 on total allocation churn.** Parsing the whole response in one C++ call
  produces a minimal object tree. Streaming's per-batch substrings and repeated `JSON.parse` calls
  unavoidably allocate more total bytes per iteration — the bake-off settled this.

- **You CAN collapse peak-live memory** by never holding all N hit objects simultaneously. With K=100,
  at most 100 hit objects exist live at any moment; they are born, transformed, serialized, and die in
  young-gen (cheap minor GC / scavenge). The old-gen promotion that produces the multi-GB heap
  described in the original production profile (RSS 3.9 GB, V8 heap 7.7 GB reserved, GC 19% of active
  CPU) is avoided entirely.

The production pain is driven by **peak** — not by total churn per response, but by the GC having to
collect a giant promoted old-gen object graph built from N=10k+ hits all alive at the same time. The
bake-off's total-allocation metric was orthogonal to that pain. This experiment targets it directly.

---

## Recommendation and sweet spot

**Decision: POSITIVE. Recommend wiring the streaming pipeline into `/lines`.**

**Sweet spot: K ≈ 100–1000.**

### Why K=1 is suboptimal

K=1 achieves the same peak-live win as K=100/K1000 (0.0 MB on narrow; <1 MB on wide), but runs
at 1.7–2.1× ms on narrow datasets (vs K=100 at 1.5–1.8×). The per-batch overhead (build
`'[' + slice.join(',') + ']'`, one `JSON.parse`, one `transform`, one `serialize`) is amortized over
K hits; K=1 pays it N=10k times per response, K=100 pays it 100 times.

### Why K=whole is disqualified

K=∞ accumulates all N hit slices before parsing — equivalent to buffered behavior with extra substring
joining overhead. Peak-live is unbounded and OOMs at 200k rows. Excluded.

### Why K=100–1000 is the sweet spot

- Same 0.0 MB peak-live result as K=1 (on all narrow datasets, in all runs).
- Wide-dataset peak: 0.0 MB at K=100/K1000, vs 0.3–0.7 MB at K=1 (all within <1 MB, so the
  practical difference is negligible — both are hundreds of times lower than 287 MB).
- CPU: within 0.96–1.23× on wide; within 1.1–1.9× on most narrow datasets. Stays near or within
  the 1.5× budget except on the "real" 12-col dataset (K100 ~2.3×, K1000 ~2.5–2.7×, driven by the short baseline).

### CPU trade (honest)

- **Wide (300 cols, the high-memory case):** CPU is essentially tied (0.96–1.23×). The 287 MB → <1 MB
  peak collapse is free in CPU terms.
- **Narrow (4–20 cols):** K100/K1000 adds ~1.1–2.7× CPU depending on dataset and K (worst cases:
  K100 ~2.3× and K1000 ~2.5–2.7× on the small "real" 12-col dataset, where the baseline is very short
  at ~11 ms); absolute peak is already trivial (0.0 MB vs 4.5–17.4 MB). The CPU cost is highest
  exactly where the absolute memory matters least. The overhead is real but the memory win is less
  critical at these absolute sizes.

In production, the problematic responses are large-payload wide-column exports — exactly where the
CPU cost is lowest and the memory win is largest.

### Suggested implementation path (separate effort)

```
ES asStream
  → zlib.createGunzip()  // only if Content-Encoding: gzip — ES bypasses auto-decompress under asStream
  → HitSplitter          // byte-stream state machine; already built and fuzz-tested
  → batch(K = 100–1000)  // accumulate K hit byte-slices
  → JSON.parse('[' + batch.join(',') + ']')  // K hit objects; die in young-gen after transform
  → transform(hit → row) // schema-driven extract — same as today
  → streamed serialize   // write each row fragment; never hold all N rows in memory
  → Node.js response     // pipeline() for backpressure
```

This composes with the serialization-side optimization already committed to the branch.

**Gates before shipping:** equivalence test vs buffered-V8 reference output (the bench harness already
has this gate on all synthetic + real buffers); `benchmark/src/streaming-parse/streaming/real-es.ts`
as a smoke test against the dev ES instance.
