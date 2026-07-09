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
| T11 | Per-line indexing costs; ARC4 `_rand` per line dominated | **done** (`Math.random()`; `_rand` is stored + tie-breaks on unique `_i`, so the seed was vestigial; cumulative with T4: indexing ×4.1) |
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

## 2026-07 stall audit (S-ids)

Complementary scan: synchronous main-thread tasks > ~10ms *outside* the /lines hot path (occasional
event-loop stalls rather than steady-state throughput). Measured evidence in
`benchmark/src/micro/stall-audit.bench.ts` (each section = the sync work ONE request triggers).

| S | Finding (measured) | Status |
|---|---|---|
| S1 | `format=wkt`: monolithic `geojsonToWKT` of the page on the main thread (~220ms @ 10k polygons) + buffered ES parse | **done** (zero-copy raw-buffer → shp-pool `wkt` export; Link header reproduced from worker `count`/`lastHitSort`) |
| S2 | `wkt=true`: per-row `JSON.parse` of the raw (uncapped) geometry + 2× `geojsonToWKT` (~600ms per 500-row batch @ 5k-vertex polygons) | **mitigated** (pipeline yields every 50 rows when `wkt=true`; a single huge geometry can still be multi-ms — bounding it means deriving from the vertex-capped `_geoshape`, a fidelity change, not taken) |
| S3 | xlsx/ods: structured clone of the prepared-rows array into piscina (38ms @ 10k×50 cols, 234ms @ 300 cols) + main-thread per-row prep | **done** (raw-buffer transfer + in-worker `prepareResultItem`) |
| S4 | pbf `max`/vtPrepared: main-thread geojson build + clone (~47ms @ 10 MB cap) | **rejected** (sequential `after` pagination needs parsed last hits; bounded by the 10 MB cap) |
| S5 | `_bulk_lines` patch/delete: O(N²) `operations.find` + no yields in result loops (~44ms per 1000-op chunk, dominated by `getLineHash` + spreads — the O(N²) itself was only ~2ms at N=1000) | **done** (Map index + per-100 yields) |
| S6 | ODS `date_format()`: per-value `dayjs.tz` + format regexes (19ms per 500-row export batch) | **done** (cached-Intl offset + memoized format rewrite → ~3.4ms; `Z`/`z` formats keep the historical dayjs.tz path) |
| S7 | `values_agg`: `combinedMaxSize *= size` zeroed by `size=0` → 1M-bucket queries evade warning AND future block; ~40ms measured @ 100k buckets (ES parse 24 + stringify 12 + walk 3) | **warning fixed** (`Math.max(size,1)`); blocking deliberately deferred (product decision) |
| S8 | `geo_agg`: up to 100k `prepareResultItem` calls with no yield (~10-15ms plain, much more with `wkt=true`) | **done** (per-500 yields) |
| S9 | Measured **below** the 10ms bar (evidence in the bench): 1 MB pre-auth body parse 5.2ms (T24 stays hardening), DCAT 10k stringify 4.3ms, etag sha1 2ms/4.4MB, parse5 app-page rewrite 0.6ms, T22/T23/T29 all ≪1ms | no action |

Side-finding (not touched here): the shp zero-copy path never sets the `Link` header the buffered shp
fallback still emits (the shared Link block reads `esResponse`, undefined on the raw path) — pre-existing
since the shp zero-copy work; wkt/sheets reproduce it via worker-returned `count`/`lastHitSort`.
