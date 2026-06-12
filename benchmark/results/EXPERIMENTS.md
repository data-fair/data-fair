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

## Measured observations (no code change)

- **T12 quantified**: `singleLineOpRefresh: 'wait_for'` caps single-line writes at ~10 req/s
  (10 conns); with `false` the same load does 180–234 req/s (×20). Candidate: per-request opt-out
  param for fire-and-forget writers — product decision, not a pure perf fix.
- Concurrent `wait_for` waiters coalesce on one refresh (10 concurrent POSTs all ~0.94 s) — the
  refresh wall does not stack.

## Open / blocked

- **T6b — the 100 ms inter-batch sleep** (duplicates still 11.3 s for 10k lines, ×13 vs unique):
  mechanism understood — it separates `_i` time-buckets across batches (10 ms buckets in
  `timestamp3` mode + random per-batch `chunkRand`, so same-bucket batches can invert order).
  A fix (monotonic per-stream batch timestamps, or deterministic per-batch sequence replacing
  `chunkRand`) must be validated against the rest test suite — the `test-env` router is
  development-only, so the suite can't run against the benchmark server. Run with dev-api panes.
- **T11 — per-line pipeline CPU**: after T4, indexing is ~170 µs/line and ES bulk size doesn't move
  it (T9) → the remaining cost is per-line CPU (`applyCalculations` flatten/schema scans/arc4
  seed, double stringify) and ES-side ingest. Next step: `npm run dev-benchmark-prof` + a 100k
  ingest, read the .cpuprofile before optimizing.
- **T5 — ETag MD5** on large pages (`finish` step ~35–53 ms avg on large-page-json): needs a
  reverse-proxy-compat design (caching.md) before measuring.
- **T2/T8 — auth costs**: upstream lib-node token cache + api-key memoization (−3..−14% req/s
  measured on cheap reads). Upstream repo work.
- Read-path next after T1: profile what remains of `prepareResultItems` (~175 ms avg at 10 conns
  on 10k rows: flatten + per-row work + queueing) and `finish` (serialization + ETag, T13/T5).
