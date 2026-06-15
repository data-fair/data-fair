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
| T11 | `Math.random()` replaces per-line ARC4 `_rand` (bb571419d) | CPU profile: random-seed = ~69% of indexing-thread busy CPU; A/B: indexing phase 17.7→8.6 s (×2.06), 3842→5856 lines/s; random-seed dep dropped | **kept — cumulative with T4: indexing ×4.1, ingest ×2.6** |

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

- **T9 — decouple index-stream flush config** (was af31932de): 200 KB vs 4 MB bulks moved indexing
  only −5.6% on local ES — bulk size is not a lever locally. The decoupling added two config knobs
  (`indexBulkLines`/`indexBulkChars`) and two env vars whose defaults equalled `maxBulkLines`/
  `maxBulkChars`, i.e. config surface with no demonstrated gain. **Reverted before merge.**
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

## T2 — auth middleware caching + freezing (2026-06-15)

Validated the `lib` `perf-faster-auth` branch (commit `a2931ca`) end-to-end. Two independent layers:
(1) **always-on** — cache the parsed public `KeyObject` per `kid` (skip PEM re-export + re-parse every
verify), reuse `req.cookies`, drop the dead ajv validation; (2) **opt-in flag** `cacheSessionStates`
(`session.init(url, lang, onlyDecode, { cacheSessionStates: true })`) — cross-request cache of the
verified session state, deeply frozen and shared.

**Micro (lib, ground truth):** `jwt.verify(PEM string)` 40.8 µs → `jwt.verify(KeyObject)` 22.1 µs
(always-on, ~46% off the verify). Full `readStateFromCookie`: 26.6 µs (flag OFF) → **1.97 µs** (flag
ON cache hit), ~13×. Matches the commit's ~47/26/1.2 µs ballpark.

**End-to-end (data-fair, 3 arms, fresh restart + PID/marker asserted per arm, 10 conns, 15 s, median
of 2, `x-cache-bypass` on).** A `lines?size=20` ES query buries the auth cost (ES ≈95% of the
request), so the lever is a new **non-ES, session-gated** scenario — `auth-session-cheap`
(`GET /api/v1/datasets/:id` metadata) vs `auth-anon-cheap` on the same endpoint.

| Scenario | A: baseline | B: new lib, flag OFF | C: new lib, flag ON |
|---|---|---|---|
| auth-anon-cheap (req/s) | 2465 | 2522 | 2497 |
| auth-session-cheap (req/s) | 1770 | 2083 | 2386 |
| **session-cheap gap vs anon** | **−28%** | **−17%** | **−4.4%** |
| auth-anonymous /lines (req/s) | 962 | 981 | 950 |
| auth-session /lines (req/s) | 911 | 947 | 954 |
| auth-session /lines gap | −5.3% | −3.5% | ≈0 |

- Always-on (A→B): closes ~11 pp of the cheap gap, session-cheap +18% throughput — transparent, no
  behavior change.
- Flag (B→C): closes another ~13 pp; session-cheap **+35% vs baseline**, the anon↔session gap nearly
  vanishes (−4.4%, within noise).
- On ES-dominated `/lines` the effect is real but within noise (~5% gap, anon itself varies) — as
  predicted; the auth CPU is ~0.2% of that request.

**Correctness (flag ON / frozen shared state):** lib unit suite 39/39 (freeze, expiry re-verify,
KeyObject-per-kid); static scan found no in-place session mutation in data-fair core (only
`setReqSession`/`setReqUser` full overwrites on the api-key/application-key pseudo-session paths,
which build fresh non-cached states); live load arm C — `auth-session` (authed read + permission,
~14k req) and `single-line`/`wide-single-line` writes (authed write + permission) → **0 non2xx, 0
errors**. The freeze converts any missed mutation into a `TypeError`.

**Verdict:** the **always-on layer is kept** (free, transparent — picked up automatically once the lib
release lands). The **`cacheSessionStates` flag is dropped**: validated and low-risk on its own
(staleness budget = token lifetime, the existing contract; org/dep/role are in the cache key), but the
benefiting traffic — interactive session cookies — is the minority of load (anonymous reads carry no
token; M2M uses api-keys, already T8-memoized), so the server-wide gain is marginal, and the flag would
impose a "never mutate session state" invariant on `lib-express`, shared by every data-fair service.
The session-caching code was reverted in `lib`. Reconsider only for a demonstrably session-heavy
deployment or if a real-instance profile shows session-verify as a main-thread hotspot.

## Open / blocked

- **T15/T13 — ES response parse + response stringify** (~70% of main-thread CPU on large pages
  combined). The easy parts (filter_path, plain-JSON.parse deserializer) were **measured and
  rejected**: 18% smaller ES bodies, zero end-to-end change — the irreducible cost is JSON.parse of
  `_source` itself. Only the raw-`_source` passthrough end-game remains (top read lever).
- **Long-lived-process drift**: same code measured 870 vs 430 ms p50 depending on process
  age/heap history — needs a soak scenario before trusting any single-process production tuning.
