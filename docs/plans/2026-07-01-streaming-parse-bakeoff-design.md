# Design — streaming ES-response parse substrate bake-off

**Status:** design / spec (approved in brainstorming; no implementation yet)
**Branch / worktree:** `perf-streaming-read-lines`
**Author:** Alban Mouton (with Claude)
**Date:** 2026-07-01

## 1. Why

The `/lines` read hot path is a **parse → transform → re-serialize** round trip. Profiling a
production pod attributed most active CPU to GC (19%), ES JSON parse (15%), and `res.json` stringify
(11%), with allocations dominated by ES `deserialize` → JS objects (239 MB / 33%) and the output
stringify (143 MB / 20%). See the sibling effort's record in the `perf-rust-read-lines` worktree
(`docs/plans/2026-06-30-rust-read-lines-*.md`).

That sibling effort built a Rust napi serializer and **measured it**: fair + release, the naive Rust
path (parse into `serde_json::Value` then emit) was **~2.3–2.4× slower** than today's JS path,
because **V8's `JSON.parse` + `JSON.stringify` is an extremely fast C++ baseline** and a generic DOM
parse cannot beat it. The decisive lesson: *measure the substrate before building on it.*

This effort takes the other angle the profiling pointed at — **start at the source**: consume the raw
ES response bytes with an allocation-efficient parser and emit output driven by the known schema,
avoiding the full object DOM (the 239 MB) and the full re-stringify (the 143 MB). The user's framing:
optimize primarily for **allocation efficiency** (fewer bytes → less GC), with CPU gains welcome
chiefly through reduced GC; the ideal is a **schema-driven, precomputed/JIT consumer** of a streaming
parser or a data-blob (simdjson tape / Arrow columns) — the same philosophy already applied to CSV
(`csv-jit`), flatten (`flatten.ts`), and per-request context (`prepareResultContext`).

Before designing a streaming endpoint, we must know **which parsing substrate actually wins on
allocation without an unacceptable CPU cost.** This document specifies that measurement bake-off.

## 2. Goal & non-goals

**Goal:** by measurement, select the JSON-buffer parsing substrate on which to build a future
streaming `/lines` endpoint — optimizing allocation/GC first, CPU second — or produce an honest
negative verdict if none beats V8.

**Non-goals (this spec):**
- Not building the streaming endpoint yet — that is the next effort, informed by the winner.
- Not JIT-compiling the consumers yet — JIT (csv-jit-style codegen) is an optimization applied to the
  *winning* substrate later; the bake-off uses straightforward schema-driven consumers so the
  comparison reflects the parser's allocation profile, not the emitter's.
- Not the Arrow / ES|QL track yet — it consumes a different input (an Arrow stream from an ES|QL
  query, not the JSON `_search` buffer), so it is not apples-to-apples with the buffer substrates.
  It is a **second track**, stood up only if no buffer substrate clears the bar (§7).
- Not touching the production `/lines` path — this lives entirely in the `benchmark/` workspace.

## 3. The uniform task (fair comparison)

Every substrate performs the **same work on the same input** and must produce **identical output**.

- **Input:** a raw ES `_search` response **buffer**, shape
  `{ hits: { total, hits: [ { _source, _id, _score, sort }, … ] } }` — exactly what `searchRaw`
  returns in the sibling effort.
- **Descriptor:** one precomputed, schema-driven descriptor shared by all substrates — ordered
  columns with `{ sourceKey (possibly dotted), outKey, type, separator }`, plus `selectIncludesId`.
  Mirrors the sibling effort's `ResultDescriptor` shape; built once per buffer, outside the timed loop.
- **Two sub-tasks per substrate:**
  - **T1 — parse + read:** parse the buffer and, per hit, pull every descriptor field (flattening
    dotted keys, joining multivalue), consuming each value into a running checksum. Isolates the
    **parse + field-extraction allocation** — the 239 MB we are attacking — with no output cost.
  - **T2 — full pipeline:** parse → emit the JSON rows-array output bytes; and (separate run)
    parse → emit the CSV bytes. The realistic endpoint work (parse + transform + serialize).
- **Correctness gate:** each substrate's T2 output must be **byte-identical CSV** and **deep-equal
  JSON** against a reference (V8-path output). A substrate that cannot produce correct output is
  disqualified — we only compare valid implementations.

## 4. Substrates

All consume the same JSON buffer, so they are directly comparable:

| Substrate | Notes |
|---|---|
| **V8 `JSON.parse` + map + `JSON.stringify`** | Baseline to beat; includes the parse (Task-10 fairness rule). This *is* today's path. |
| **`@streamparser/json`** | Modern streaming tokenizer. Needs install (add to `benchmark` devDeps). |
| **`jsonparse`** | Already in tree (`1.3.1`). Older SAX tokenizer. |
| **`stream-json`** | Already in tree (`1.9.1`). `Pick` + `StreamValues`. |
| **`simdjson` On-Demand** | Native SIMD; navigate a tape, pull only known fields. **Native-addon risk** — see §6. |

Driven off the ES buffer, SAX substrates run a schema-aware state machine that writes values straight
to output/checksum without building per-row objects; simdjson uses its On-Demand navigation to pull
descriptor fields off the tape.

## 5. Workload

- **Synthetic, seeded, deterministic**, ~10k rows (matches `config.elasticsearch.maxPageSize`),
  across the axes that drive allocation:
  - **string-heavy** (many / long string fields),
  - **number-heavy**,
  - **wide** (many fields) vs **narrow** (few),
  - **nested-dotted + multivalue** (exercises flatten + separator join).
- **One real capture:** a raw ES `_search` buffer from a `dev-fixtures` dataset (`npm run
  dev-fixtures`), saved as a fixture, for realism against synthetic shapes. **This worktree is fresh
  from `master` and has no `searchRaw`** (that lives on the sibling `perf-rust-read-lines` branch) — so
  the capture is obtained independently in the harness (a direct `_search` via the `@elastic` client,
  or `curl` against the dev ES on the `.env` port), saving the raw response bytes. Only the buffer
  *shape* matters, not the sibling code.

## 6. Metrics, native-addon & Alpine gate

**Measured per substrate × sub-task** (`--expose-gc`, W warmup + N timed iterations, `global.gc()`
between phases):
- **Allocation (primary):** GC event count + total GC pause time via a `perf_hooks`
  `PerformanceObserver` on `gc` entries, and `heapUsed` growth across a no-forced-gc window
  (allocation-churn proxy). Lower is better.
- **Peak RSS** during the run.
- **CPU:** ms/iter (throughput).

Report a ranked table, allocation-efficiency first, with the V8 baseline as the reference row.

**Native-addon gate (simdjson, and any native substrate):**
1. **Builds/loads in dev.** If it will not install/build cleanly on the dev platform after a
   reasonable attempt, it drops out — documented, no rabbit-holing.
2. **Runs on Alpine/musl.** Our production image is Alpine (musl libc). A substrate that wins in dev
   but **cannot load and run inside the Alpine image** is **disqualified as a shippable substrate**
   (glibc-only prebuilds won't load on musl; unlike our own Rust module, which builds an explicit
   `x86_64-unknown-linux-musl` napi target, a third-party addon may ship no musl binary and may not
   compile there). This is validated by loading the module + running T1 on a small buffer inside the
   Alpine image (a throwaway `node:alpine`-based check, or the project's existing image base). A
   dev-only win is recorded but flagged **not shippable** until the Alpine check passes.

## 7. Decision rule

A substrate **wins** if it **materially cuts allocation/GC vs V8** — target **≥30% fewer bytes / GC
pause on the parse-side T1** — **without a CPU regression worse than ~1.5×**. Memory is primary, but a
hot endpoint cannot pay an unbounded CPU tax; a **>1.5× CPU cost disqualifies unless the allocation
win is dramatic (≥3×)**. A native winner must also pass the **Alpine gate (§6)** to be recommendable
for shipping.

**Outcomes:**
- **A buffer substrate clears the bar** → recommend it; it becomes the basis for the streaming
  endpoint design (a separate spec).
- **None clears the bar** → honest negative verdict for streaming-in-JS on the JSON buffer; then
  stand up the **Arrow / ES|QL second track** and measure it the same way, or stop — same discipline
  as the Rust verdict.

## 8. Deliverables & layout

In the existing `benchmark/` workspace (mirrors `benchmark/rust-read-lines.bench.mjs`):
- `benchmark/streaming-parse/` — the harness, the shared descriptor + reference output, the seeded
  synthetic buffer generator + the captured real fixture, and one consumer module per substrate.
- A results writeup `benchmark/results/streaming-parse-bakeoff.md` — the ranked table (allocation, GC,
  peak RSS, ms/iter per substrate × T1/T2), the correctness-gate status, the simdjson dev + Alpine
  results, and the substrate recommendation (or negative verdict) with the L1/Arrow next-step framing.
- The Alpine validation script/notes for any native substrate.

## 9. Pointers

- Sibling effort (context, the Rust verdict, `searchRaw`, descriptor shape, parity harness):
  `perf-rust-read-lines` worktree, `docs/plans/2026-06-30-rust-read-lines-*.md`,
  `docs/architecture/rust-read-serializer.md`.
- Raw ES buffer *shape* reference: `searchRaw` in `api/src/datasets/es/search.ts` on the sibling
  branch (not present here — reference only for how the raw `_search` bytes look; capture independently
  per §5).
- Schema/descriptor reference: `prepareResultContext` / `prepareQuery` in
  `api/src/datasets/es/commons.ts`; `csv-jit.ts`, `flatten.ts`.
- Observer for real profiling later: `@data-fair/lib-node` `/cpu-profile`, `/heap-profile`.
