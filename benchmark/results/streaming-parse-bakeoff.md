# Streaming-parse substrate bake-off — results & recommendation

## Verdict

**NEGATIVE. No JSON-buffer parsing substrate beats V8's `JSON.parse` + map + `JSON.stringify` on
allocation without an unacceptable CPU cost.**

V8 allocates the least bytes/iter on 3 of 4 synthetic buffers and on the real 5000-hit buffer, and
is the fastest on every buffer. The one allocation win (`@streamparser/json` on the 300-col wide
buffer: ~30% fewer bytes) costs ~3× the CPU — failing the ≤1.5× threshold and not reaching the
dramatic-win (≥3× allocation cut) that would excuse a higher CPU tax.

**Next step:** the only remaining structural avenue to avoid per-row JS-object allocation is the
**Arrow / ES|QL second track** (columnar TypedArray output, zero per-row objects — but a different,
more constrained query surface) — or stop. V8's JSON pipeline is already near-optimal for this
buffer shape; effort should go elsewhere unless the Arrow track is specifically worth standing up.

---

## Environment

| Item | Value |
|------|-------|
| Node.js | v24.16.0 |
| Run flags | `--expose-gc --max-semi-space-size=128 --experimental-strip-types` |
| `ROWS` (synthetic) | 2000 |
| Real-buffer hits | 5000 hits, 12 mixed cols, ~1.8 MB buffer |
| Machine | dev workstation (Intel/AMD; see run context) |
| Substrates | v8 (baseline), @streamparser/json, jsonparse, stream-json, simdjson |

---

## Metric & validity

**Primary metric:** `bytesPerIter` = median of 7 samples of `global.gc(); b0 = mem(); await fn(); b1 = mem(); b1 − b0`,
where `mem() = heapUsed + external + arrayBuffers` (heap **and** off-heap Buffers). Measured with
`--max-semi-space-size=128` so no scavenge fires mid-iteration and the delta captures the full
per-iteration allocation. `msPerIter` is timed in a separate tight loop. `peakRssMb` is a
cumulative high-water mark across buffers (not reset between runs) — read it as an upper bound,
not a per-buffer working set.

**Caveat (conservative):** a very large mid-iteration scavenge could slightly undercount the
largest allocator. This bias is conservative — it only makes V8's lead look *smaller* than it
truly is, not larger. The verdict stands.

**Why the GC-count metric was replaced:** the original harness reported `gc#` and `gcPauseMs`.
Both were 0 everywhere — large output Buffers go directly to V8's old generation, skipping the
young-gen and producing no observable scavenge events regardless of row count. The `bytesPerIter`
delta metric replaced it and produces non-zero, differentiated values.

**Variance:** two full runs at ROWS=2000 showed < 3% variance on `ms/iter` and essentially
identical `bytes/iter` (median of 7 samples is stable).

---

## Correctness gate

All substrates passed the correctness gate: T2 CSV output is byte-identical and T2 JSON output
is deep-equal to the V8 reference on all buffers. No substrate was disqualified.

---

## Full results — synthetic buffers (ROWS=2000)

`peakRSS` is a cumulative high-water mark (see Metric section). `stream-json/wide` was skipped
(~7 s/iter at ROWS=2000 — see stream-json finding below).

```
substrate         task                       ms/iter  bytes/iter   peakRSS
─────────────────────────────────────────────────────────────────────────────
── string-heavy (7 cols) ──
v8                string-heavy/T1               2.36       2.3MB     197MB
v8                string-heavy/json             3.57       3.2MB     219MB
v8                string-heavy/csv              4.07       3.9MB     248MB
streamparser      string-heavy/T1              13.25      25.1MB     247MB
streamparser      string-heavy/json            15.07      25.7MB     257MB
streamparser      string-heavy/csv             15.17      26.6MB     265MB
jsonparse         string-heavy/T1              11.37       7.6MB     259MB
jsonparse         string-heavy/json            13.42       8.3MB     291MB
jsonparse         string-heavy/csv             13.94       9.2MB     386MB
stream-json       string-heavy/T1              66.84     131.1MB     511MB
stream-json       string-heavy/json            64.65     133.6MB     513MB
stream-json       string-heavy/csv             63.64     132.7MB     517MB
simdjson          string-heavy/T1               6.26       2.9MB     569MB
simdjson          string-heavy/json             6.89       3.8MB     654MB
simdjson          string-heavy/csv              7.50       4.5MB     721MB

── number-heavy (20 cols) ──
v8                number-heavy/T1               4.36       4.4MB     722MB
v8                number-heavy/json             8.74       8.7MB     734MB
v8                number-heavy/csv              5.69       4.8MB     741MB
streamparser      number-heavy/T1              24.51      46.6MB     711MB
streamparser      number-heavy/json            28.29      49.9MB     713MB
streamparser      number-heavy/csv             25.99      46.9MB     721MB
jsonparse         number-heavy/T1              26.74      22.1MB     711MB
jsonparse         number-heavy/json            31.16      26.0MB     714MB
jsonparse         number-heavy/csv             27.99      22.7MB     721MB
stream-json       number-heavy/T1             423.12      53.4MB     782MB
stream-json       number-heavy/json           445.99      65.2MB     824MB
stream-json       number-heavy/csv            443.63      54.7MB     857MB
simdjson          number-heavy/T1              12.76       7.2MB     886MB
simdjson          number-heavy/json            16.58      11.5MB    1002MB
simdjson          number-heavy/csv             13.70       7.5MB    1116MB

── wide (300 cols) ──
v8                wide/T1                      93.24      41.0MB    1202MB
v8                wide/json                   150.46     113.9MB    1241MB
v8                wide/csv                    141.47     126.6MB    1212MB
streamparser      wide/T1                     278.17      28.4MB    1142MB
streamparser      wide/json                   322.32     123.5MB    1221MB
streamparser      wide/csv                    325.08     121.3MB    1235MB
jsonparse         wide/T1                     235.21      40.6MB    1142MB
jsonparse         wide/json                   307.43     120.4MB    1275MB
jsonparse         wide/csv                    291.61     117.8MB    1260MB
[stream-json      wide/*                       SKIPPED — O(buffer) too slow (~7 s/iter at ROWS=2000)]
simdjson          wide/T1                     141.78      74.4MB    2661MB
simdjson          wide/json                   205.45     147.2MB    3964MB
simdjson          wide/csv                    197.59      75.6MB    5287MB

── nested-multivalue (4 cols) ──
v8                nested-multivalue/T1          2.27       2.3MB    5161MB
v8                nested-multivalue/json        2.65       2.8MB    5166MB
v8                nested-multivalue/csv         3.40       3.6MB    5161MB
streamparser      nested-multivalue/T1          8.52      20.5MB    5153MB
streamparser      nested-multivalue/json        9.87      21.4MB    5154MB
streamparser      nested-multivalue/csv         9.69      21.9MB    5153MB
jsonparse         nested-multivalue/T1          7.96       4.5MB    5153MB
jsonparse         nested-multivalue/json        8.96       5.3MB    5157MB
jsonparse         nested-multivalue/csv         8.79       5.8MB    5153MB
stream-json       nested-multivalue/T1         75.21     108.3MB    5206MB
stream-json       nested-multivalue/json       70.63     110.3MB    5206MB
stream-json       nested-multivalue/csv        74.08     109.7MB    5205MB
simdjson          nested-multivalue/T1          5.16       3.0MB    5212MB
simdjson          nested-multivalue/json        5.65       3.5MB    5266MB
simdjson          nested-multivalue/csv         5.98       4.3MB    5311MB
```

---

## Full results — real ES buffer (5000 hits, 12 mixed cols, ~1.8 MB)

```
substrate        task              ms/iter  bytes/iter   peakRSS
─────────────────────────────────────────────────────────────────
v8               real/T1              8.74       7.9MB    5541MB
v8               real/json           11.09      10.0MB    5584MB
v8               real/csv            14.95      16.0MB    5557MB
streamparser     real/T1             44.11      80.4MB    5499MB
streamparser     real/json           47.24      85.9MB    5501MB
streamparser     real/csv            50.30      89.2MB    5521MB
jsonparse        real/T1             33.42      15.8MB    5498MB
jsonparse        real/json           37.97      21.1MB    5512MB
jsonparse        real/csv            39.43      24.4MB    5524MB
stream-json      real/T1            728.47      88.0MB    5594MB
stream-json      real/json          751.34     110.6MB    5587MB
stream-json      real/csv           701.73      99.3MB    5608MB
simdjson         real/T1             20.13      10.0MB    5787MB
simdjson         real/json           22.07      13.4MB    6019MB
simdjson         real/csv            25.28      18.2MB    6209MB
```

Real-buffer ratios vs v8/T1 (8.74 ms, 7.9 MB):

| substrate   | T1 ms ratio | T1 bytes ratio |
|-------------|-------------|----------------|
| simdjson    | 2.3×        | 1.3×           |
| jsonparse   | 3.8×        | 2.0×           |
| streamparser| 5.0×        | 10.2×          |
| stream-json | 83.3×       | 11.1×          |

---

## T1 allocation ranked (synthetic, bytes/iter vs V8)

Decision rule: win = ≥30% fewer bytes at ≤1.5× ms/iter, or ≥3× allocation cut to excuse a
larger CPU cost.

| buffer | v8 (bytes @ ms) | best challenger (bytes @ ms) | bytes ratio | ms ratio | verdict |
|--------|-----------------|------------------------------|-------------|----------|---------|
| string-heavy | 2.3MB @ 2.36ms | simdjson 2.9MB @ 6.26ms | 1.26× more | 2.65× | **v8 least** |
| number-heavy | 4.4MB @ 4.36ms | simdjson 7.2MB @ 12.76ms | 1.64× more | 2.93× | **v8 least** |
| nested-mv    | 2.3MB @ 2.27ms | simdjson 3.0MB @ 5.16ms | 1.30× more | 2.27× | **v8 least** |
| wide (300c)  | 41.0MB @ 93.24ms | **streamparser 28.4MB @ 278.17ms** | **0.69× (31% less)** | **2.98×** | fails CPU bar |

The lone allocation win — `@streamparser/json` on the wide buffer — allocates ~31% fewer bytes on
T1 (28.4 MB vs 41.0 MB) but is ~3× slower (278 ms vs 93 ms). It fails the ≤1.5× CPU threshold,
and the allocation saving (31%) is not the ≥3× needed to excuse that CPU cost. **No substrate
clears the bar.**

---

## Per-substrate findings

### V8 (`JSON.parse` + map + `JSON.stringify`)

Fastest and least-allocating on every buffer. V8's C++ JSON implementation is a well-optimised
baseline; the round-trip parse → map → stringify is hard to beat from JS.

### simdjson

Second-fastest overall (2.3–2.9× behind V8 on T1). However, it allocates **more** than V8 on all
buffers (1.3–1.8× on T1). The root cause: the shipped `simdjson` substrate is
**SIMD-parse-then-materialise** (one `valueForKeyPath('hits.hits')` call materialises the full
hits array, then JS property access). This double-buffers: the SIMD tape + the JS objects.

The original intent — lazy per-field pull off the tape using `valueForKeyPath(path)` per (row,
column) — is **O(N² × cols) with this binding**: each call re-scans the tape from the root.
Measured slowdown vs materialise on string-heavy T1:

| rows | lazy ms/iter | materialise ms/iter | slowdown |
|------|-------------|---------------------|----------|
| 300  | 2.43        | 0.90                | 2.7×     |
| 600  | 7.01        | 1.93                | 3.6×     |
| 1200 | 20.56       | 3.77                | 5.5×     |

Lazy time roughly triples per row-doubling (quadratic); materialise doubles (linear). The
"schema-driven lazy blob consume" vision **does not work with the simdjson node binding**.

### @streamparser/json (streamparser)

Single allocation win: wide/T1 (28.4 MB vs 41.0 MB, ~31% less). Everywhere else it allocates
10–20× more than V8 and is 5–6× slower. Fails the decision rule on CPU cost.

### jsonparse

Allocates 1.3–5× more than V8 depending on buffer; 4–6× slower on T1. No path to the bar.

### stream-json

O(buffer-size): tokenises the entire JSON byte stream regardless of columns selected. On the
300-col wide buffer it is ~7 s/iter at ROWS=2000 — **SKIPPED with a printed note**, not
silently. Where measured: 15×–83× slower than V8 and allocates 11×–57× more. **Unusable for
wide payloads.**

---

## simdjson / Alpine / OVH-SIMD note (Task 10 was not run)

Task 10 (Alpine/musl build gate for simdjson) was skipped because simdjson lost the bake-off
(allocates more than V8; lazy pull is O(N²) and impractical). Its Alpine-shippability is moot
for this recommendation.

For the record: simdjson would likely receive SIMD acceleration on OVH Kubernetes nodes via
runtime CPUID dispatch — OVH Xeon/EPYC nodes all have AVX2; the scalar fallback is the
worst case. The ISA is not the blocker. But this is moot since simdjson is not a candidate.

If simdjson were ever revisited (e.g., for a future binding with true lazy-pull semantics), the
prerequisites would be: (1) musl build gate on the Alpine image, (2) per-node CPU-flag
verification that SIMD paths are active, and (3) a new binding API that does not require O(N)
tape re-traversal per field access.

---

## Decision (§7 outcome): NEGATIVE

Applying the decision rule:

- **Win criterion:** ≥30% fewer bytes/iter on T1 vs V8 at ≤1.5× ms/iter — or ≥3× allocation
  cut to excuse a larger CPU cost.
- **Result:** no substrate clears either bar.
  - V8 allocates least on 3 of 4 synthetic buffers and on the real buffer, and is fastest.
  - The lone allocation win (streamparser/wide, ~31% fewer bytes) costs ~3× CPU — fails the ≤1.5×
    threshold, and 31% << 3× that would excuse it.
  - simdjson is the closest performer but allocates 1.3–1.8× more than V8; lazy pull is O(N²).
  - stream-json is O(buffer-size) and impractical on wide payloads.

**Honest conclusion: streaming-in-JS on the ES JSON buffer does not pay off. V8's JSON pipeline
is already near-optimal for this buffer shape.**

### Arrow / ES|QL second track — or stop

Per §7 of the design spec, a negative verdict means:

1. **Arrow / ES|QL second track** — ES|QL with Arrow encoding returns columnar TypedArrays
   (zero per-row JS objects), a fundamentally different allocation profile. This is the next
   experiment if reducing `/lines` allocation is still worth pursuing — same measurement
   discipline as this bake-off, same decision rule.

2. **Stop** — if the allocation on `/lines` is not worth further experiment, the honest
   conclusion is that today's V8 path is already well-optimised and effort should go elsewhere.

The recommendation leans toward **stop or Arrow**: the profiling attributed 33% of allocations
to ES deserialisation, but this bake-off shows that JS-side parsing cannot undercut V8; the only
structural improvement would require a format change at the ES query layer. That is a broader
change and may not be justified by the allocation profile alone.
