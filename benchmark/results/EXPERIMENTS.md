# Experiments log — perf-api branch

Protocol per experiment: controlled A/B, fresh server process per arm (PID change + code-marker
asserted), back-to-back runs, scenarios from `benchmark/src/scenarios.ts`. Baselines and protocol
caveats in `BASELINE.md`. T-ids refer to `benchmark/perf-scan-notes.md`.

## Kept

| Exp | Change (commit) | Evidence | Verdict |
|---|---|---|---|
| T1 | wire `prepareResultContext` (c4868ebd2) | large-page-json ×2.0 (12→24 req/s), truncate ×3.8, wide-list ×2.2; responses byte-identical on 9 probes | **kept — biggest read-path win** |
| T14 | `setImmediate` yields (8667acf16) | single client: csv p50 205→120 ms (−41%), json 144→117 ms; under load: csv +11%, json neutral | **kept — export latency** |
| T4 | batch MarkIndexedStream `$in` (838d85347) | 100k-line ingest: indexing phase 35.3→17.7 s (×2.0), 2284→3831 lines/s; 0 `_needsIndexing` left both arms | **kept — biggest write-path win** |
| T3 | memoize `compileSchema` (857777612) | with `singleLineOpRefresh=false`: narrow +30% req/s, 300-col ×3.1 (50→157 req/s, p50 198→63 ms); also fixes the unbounded ajv-cache leak | **kept** |
| T6a | Set-based duplicate detection (857777612) | neutral on scenarios (sleeps dominate) | kept as hygiene |
| T9 | decouple index-stream flush config (af31932de) | 200 KB vs 4 MB bulks: indexing −5.6% only (local ES) | config kept (defaults unchanged), **bulk size is not a lever locally** |
| T11 | FNV hash replaces per-line ARC4 `_rand` (bb571419d) | CPU profile: random-seed = ~69% of indexing-thread busy CPU; A/B: indexing phase 17.7→8.6 s (×2.06), 3842→5856 lines/s; random-seed dep dropped | **kept — cumulative with T4: indexing ×4.1, ingest ×2.6** |

## Measured observations (no code change)

- **T12 quantified**: `singleLineOpRefresh: 'wait_for'` caps single-line writes at ~10 req/s
  (10 conns); with `false` the same load does 180–234 req/s (×20). Candidate: per-request opt-out
  param for fire-and-forget writers — product decision, not a pure perf fix.
- Concurrent `wait_for` waiters coalesce on one refresh (10 concurrent POSTs all ~0.94 s) — the
  refresh wall does not stack.

## Also done without dedicated measurement

- **T7 — application-key middleware lookups memoized** (30 s TTL, negative results cached,
  `matchingApplication` cloned on use because the datasetsFilters defaults mutate it): removes
  2-3 sequential mongo round trips in front of every data request from embedded apps/portals.
  Done on principle — the dedicated benchmark scenario (needs a configured application) was
  judged not worth the harness complexity. Caches cleared on applications/applications-keys
  writes and in test-env cleanup.
- **T8 — api-key settings lookup memoized** (same pattern as T7, 30 s TTL): removes the
  per-request mongo round trip behind `x-apiKey` auth (measured −9..−14% req/s vs anonymous
  before the fix). Cleared on settings writes, so same-node key revocation stays immediate —
  verified live: create key → 200 (miss) → 200 (cache hit) → revoke → immediate 401.

## Abandoned

- **T6b — the 100 ms inter-batch sleep** (duplicates ×13 vs unique ingest): mechanism understood —
  it separates `_i` time-buckets across batches (10 ms buckets in `timestamp3` mode + random
  per-batch `chunkRand`, so same-bucket batches can invert order); a fix would need monotonic
  per-stream batch timestamps validated against the rest test suite. **Abandoned by decision:
  write throughput is not a goal — the priority for writes is resource efficiency and not
  blocking the event loop, and the sleep is idle time, not CPU.**

## Profiling session findings (2026-06-12, after all fixes above)

Worker-thread profile during 100k ingest: see T11 (settled). Architectural note: the indexing
pipeline runs in Piscina worker threads (`api/src/workers/tasks.ts`) — bulk indexing never blocks
the HTTP event loop; only sync commits and single-line writes touch the main thread.

Main-thread profile under large-page-json/csv load (~17.6 s busy CPU), via the observer's
on-demand `GET /cpu-profile` (avoids the exit-flush problem of --cpu-prof with SIGINT):

| busy CPU | frame |
|---|---|
| ~37% | `secure-json-parse` — ES client parsing ES responses |
| ~15% | `string_decoder` — decoding ES response bytes |
| ~18% | Express `res.json`/`JSON.stringify` of our response (T13) |
| ~8.5% | GC |
| ~3.5% | ETag MD5 (T5) |
| ~3% | `prepareResultItem` (post-T1 residue) |

- **T5 settled: NOT worth it** (~3.5% of busy CPU on the most ETag-hostile workload; the
  caching-contract risk outweighs it).
- **T15 promoted to top read lever**: ~52% of main-thread CPU is receiving/parsing the ES
  response. Candidates: `filter_path` to strip per-hit metadata, `_source` excludes, checking
  whether the ES client can skip secure-json-parse's prototype-poisoning pass; end-game is
  CSV-JIT-style passthrough of raw `_source` (T13 merges into this).

## Open / blocked

- **T15/T13 — ES response parse + response stringify** (~70% of main-thread CPU on large pages
  combined). The easy parts (filter_path, plain-JSON.parse deserializer) were **measured and
  rejected** (2026-06-12): 18% smaller ES bodies, zero end-to-end change — the irreducible cost
  is JSON.parse of `_source` itself. Only the passthrough end-game remains (see the updated
  handoff doc docs/plans/2026-06-12-t15-es-response-overhead.md).
- **T2 — session JWT verify cost**: upstream lib-node token cache (−3..−7% req/s measured on
  cheap reads). Upstream repo work.
- **Long-lived-process drift**: same code measured 870 vs 430 ms p50 depending on process
  age/heap history — needs a soak scenario before trusting any single-process production tuning.
