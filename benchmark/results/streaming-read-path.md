# Streaming `/lines` read path — benchmark summary

Perf investigation that fed the `experimental.streamReadLines` implementation in
`api/src/datasets/routes/read.ts` and the fused response serializer. The detailed harness
(parser-substrate bake-off, streaming-pipeline prototype, threshold sweep, compiled-serializer
bench) and its per-run tables were **removed after the decisions below were settled** — recover them
from git history (commits under `perf(streaming):` / `perf(bench):` on this branch) if a re-run is
needed.

Environment: Node v24.16, `--expose-gc --max-semi-space-size=128`, synthetic ES buffers
(string- / number- / nested- / wide-300-col) plus a captured real 5000-hit ~1.8 MB buffer,
equivalence-gated against a buffered-V8 reference output on every buffer.

## 1. JSON-parse substrate bake-off — VERDICT: NEGATIVE

Can any streaming/incremental JSON parser beat V8's `JSON.parse` + map + `JSON.stringify` on
**total bytes allocated per iteration** (the metric that drives GC pressure)?

Approaches tested: **v8** (`JSON.parse`, baseline) · **@streamparser/json** · **jsonparse** ·
**stream-json** · **simdjson**. Decision rule: win = ≥30% fewer bytes at ≤1.5× CPU, or ≥3× fewer
bytes to excuse a larger CPU cost.

V8 allocates the least on 3 of 4 synthetic buffers and on the real buffer, and is fastest on every
buffer. The lone allocation win — `@streamparser/json` on the 300-col wide buffer, ~31% fewer bytes
(28.4 vs 41.0 MB) — costs ~3× CPU (278 vs 93 ms), failing the bar. **No substrate clears it.** The
only remaining structural avenue to avoid per-row object allocation is a columnar Arrow / ES|QL track
(a different, more constrained query surface) — out of scope. V8's JSON pipeline is already
near-optimal for this buffer shape.

## 2. Streaming pipeline vs buffered-V8 — VERDICT: POSITIVE

Different metric: **peak *live* memory** (`heapUsed + external + arrayBuffers`, sampled after a
forced GC) — the working set, not total garbage. A negative bake-off on total bytes and a positive
result here are consistent: streaming bounds the working set, it does not reduce total allocation.

Approaches: **buffered-V8** (parse the whole response) vs **stream-K** (ES `asStream` → byte-splitter
→ batch K hits → `JSON.parse('[' + batch.join(',') + ']')` → transform → streamed serialize), for
K ∈ {1, 100, 1000, whole}.

- Peak-live collapses from 4.5 MB (real 12-col) / 287 MB (wide 300-col) to 0.0–0.7 MB for
  K1/K100/K1000 — from >4× to >410× lower.
- Under a 96 MB capped heap at 200k rows, buffered-V8 **OOMs** while K1/K100/K1000 **survive** (a
  physical allocator signal, not a profiler artifact).
- CPU on the wide (high-memory) case is essentially tied (0.96–1.23×); on narrow low-memory datasets
  streaming costs ~1.1–2.7× CPU — the CPU cost is highest exactly where absolute memory matters least.
- **stream-Kwhole is disqualified** (accumulates all slices → unbounded peak, OOMs — do not ship).
- Validated against live ES `asStream`.

**Sweet spots** (threshold sweep): batch **≈20 KB** (CPU flat 4–100 KB, degrades ~15% at ≥256 KB);
activation floor **≈500 KB–1 MB** response — below that the `asStream` fixed cost isn't worth it, so
treat it as a floor, not a hair-trigger. Streaming plateaus at ~2.2× CPU vs buffered; its
justification is bounded peak memory, not CPU parity. Shipped as `experimental.streamReadLines`.

## 3. Fused `(hit) → jsonString` serializer — VERDICT: kept, behind the plain-query fast path

Approaches: **baseline** (`flatten` + `prepareResultItem` transform + generic `JSON.stringify`) vs a
**fused JIT-compiled** serializer (bakes constant `"key":` prefixes, reads values straight off
`hit._source`, materializes no intermediate object), in two encoder variants — **json-encode**
(`JSON.stringify` per value) and **typed-encode** (inline typed ternary).

10k-row serialize: baseline 26.0 ms → fused json-encode 18.5 ms = **1.41×** (−29%). Two thirds of the
baseline is the generic `JSON.stringify` of the intermediate object; fusing removes the intermediate
but still pays `JSON.stringify` per string value for escaping, so the win caps at ~1.4×. The
**typed encoder is slower** (V8's per-primitive `JSON.stringify` is already optimal; the ternary only
adds branch overhead) and riskier on number formatting — **rejected**. Rich queries
(`html` / `truncate` / highlight / wkt …) are ~41× costlier per row, dominated by markdown rendering,
so the fast path applies to **plain** queries only and falls back to `prepareResultItem` otherwise.

Kept behind the plain-query fast path, memoized on `(datasetId, finalizedAt, select, arrays)` like
`flatten.ts`, under a hard byte-identity contract against `prepareResultItem` (`NaN`/`Infinity` →
`null`, etc.).
