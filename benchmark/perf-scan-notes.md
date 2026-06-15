# API performance scan — finding catalog (2026-06)

Static scan of the API hot paths (GET `/lines`, REST write/indexing, shared middlewares, the
`@data-fair/lib-*` deps as used on hot paths). This is the catalog the **T-ids** used in
`results/BASELINE.md`, `results/EXPERIMENTS.md` and `README.md` refer to. Measured outcomes and the
evidence behind each verdict live in `results/EXPERIMENTS.md`; correctness side-findings (C1–C5)
are tracked in `../docs/plans/2026-06-12-bugs-found-during-perf-scan.md`.

The headline of the scan: the remaining big levers are *not* in the ES query — they are in per-hit
result preparation, the auth layer, and the write/indexing pipeline.

## Status

| T | Finding | Status |
|---|---|---|
| T1 | `prepareResultContext` not wired — `/lines` ran the legacy O(hits×schema) path | **done** (wired + legacy path removed) |
| T2 | Full RS256 JWT verify per request, uncached (lib-node) | **partly adopted** — always-on KeyObject/cookie/ajv fixes land via lib release; session-state cache + freeze validated but **rejected** for data-fair (minority traffic, shared-lib mutation invariant) |
| T3 | AJV validator compiled per write request + unbounded ajv cache leak | **done** (memoized on `id:updatedAt:adminMode`) |
| T4 | `MarkIndexedStream` did one Mongo `findOne` per indexed line | **done** (batched `$in` per bulk) |
| T5 | Express default weak ETag = MD5 over every response body | **rejected** (~3.5% CPU on the worst workload; caching-contract risk) |
| T6 | Duplicate `_id` in a bulk: early flush + 100 ms sleep + O(n²) scan | T6a **done** (Set dedup); T6b (the sleep) **abandoned** (write throughput not a goal) |
| T7 | application-key middleware: up to 3 sequential uncached Mongo queries | **done** (memoized, 30 s TTL, cloned on use) |
| T8 | API-key auth: uncached `settings.findOne` per request | **done** (memoized, 30 s TTL, invalidated on writes) |
| T9 | ES bulk flush threshold below ES sweet spot | **reverted** (no local gain; was config surface only) |
| T10 | O(n²) scans + `$or`-of-1000 in `applyTransactions` | open — not pursued (patch/delete-heavy bulks only) |
| T11 | Per-line indexing costs; ARC4 `_rand` per line dominated | **done** (FNV hash; cumulative with T4: indexing ×4.1) |
| T12 | Single-line writes capped by `refresh: wait_for` | measured (×20 ceiling); per-request opt-out is a product decision |
| T13 | JSON response is one synchronous `JSON.stringify` of the page | open — merges into the T15 passthrough end-game |
| T14 | Event-loop yields used `setTimeout(0)` (≥1 ms clamp) | **done** (`setImmediate`) |
| T15 | ES transport/parse overhead on large pages (no `filter_path`, full `_source`) | **open / top read lever** — easy parts (filter_path, plain-JSON parse) measured and rejected; only raw `_source` passthrough remains |
| T16 | Schema-derived per-request work in `prepareQuery` & friends | open — not pursued (worthwhile as one batched "schema context" change) |
| T17 | `_score: null` serialized into every row | open — low (needs API-compat check) |
| T18 | Cookie header parsed twice | **done** (lib reuses pre-parsed `req.cookies`, part of T2 always-on) |
| T19 | Mongo cursor `batchSize(100)` feeding 2000-line ES bulks | open — low |
| T20 | History revisions bulk serialized after main bulk | open — low (`rest.history` only) |
| T21 | No ES index tuning (`refresh_interval`/replicas) during full reindex | open — medium, well-trodden ES practice, needs care |
| T22 | events-log per-line dynamic `import()` + stringify before level check | open — low (lib) |
| T23 | rate-limiting re-derives client IP up to 2×/request | open — low |
| T24 | body parser mounted before auth (1 MB POSTs parsed before 401) | open — hardening more than perf |
| T25 | `/ping` does 4–5 live dependency probes, uncached | open — low (matters only with aggressive polling) |
| T26 | `/embed` tracking `datasets.findOne` per page load, uncached | open — low |
| T27 | publicationSite middleware residual per-request object/URL work | open — low (cache itself is good) |
| T28 | vector-tile neighbours: 9 Mongo-cached count probes per tile | open — low-medium (tiles only) |
| T29 | ws-server fan-out re-stringifies the doc once per subscriber | open — low (lib, only with many subscribers) |

## Notes on advanced strategies

Allocation churn is **not** the dominant cost (V8 young-gen GC handles short-lived per-hit objects
well). Flat/zero-copy thinking pays in only two places, both gated on profiles still showing them
dominant after the done work: (1) **ES response handling** (T15+T13) — operate on raw `_source` and
emit JSON parts without intermediate objects (the CSV-JIT approach applied to JSON); (2) **index
pipeline** (T11 residue) — serialize each line once into a reusable Buffer chain and ship
pre-serialized NDJSON to the bulk API. Object pooling proper is not recommended (objects escape into
Express/JSON serialization with unclear lifetimes).
