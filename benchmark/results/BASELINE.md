# Baseline measurements — 2026-06-12 (branch perf-api)

Empirical evidence for the findings in `benchmark/perf-scan-notes.md` (T-ids refer to it).
Environment: local dev stack (nginx → API, single process MODE=server_worker, local mongo/ES in
docker), benchmark config (isolated db/indices, relaxed limits, `singleLineOpRefresh: 'wait_for'`),
10 connections, 15–30 s per scenario, `x-cache-bypass` on every request. Raw JSONs in this folder.

## Read scenarios (legacy code, median of 2 runs, 15 s each)

| Scenario | p50 (ms) | p99 (ms) | req/s |
|---|---|---|---|
| simple-list | 11–12 | 27–28 | ~915 |
| fulltext-search | 11 | 22 | ~1370 |
| filter-eq | 11 | 21–22 | ~1570 |
| filter-range | 10 | 22–23 | ~1130 |
| sort | 11 | 20 | ~1670 |
| deep-pagination | 12 | 28–29 | ~880 |
| geo-bbox | 11 | 25–26 | ~1010 |
| combined | 11–12 | 21–23 | ~1480 |
| small-dataset | 10 | 19–21 | ~1790 |
| auth-anonymous | 11 | 26–28 | ~927 |
| auth-session | 11–12 | 27–30 | ~885 |
| auth-apikey | 12–13 | 30 | ~826 |
| large-page-json | 836–870 | 1152–1297 | 11 |
| large-page-csv | 949–987 | 1102–1360 | 9–10 |
| wide-list | 173–177 | 248–249 | 56–57 |

Step breakdown (`df_req_step_seconds`) for small pages: the ES `search` step is ~95% of request
time (e.g. simple-list: 8.0 of 8.5 ms) — the request envelope around ES is already thin at size=20.

**Auth overhead (T2/T8):** anonymous → session ≈ −3 to −7% req/s, anonymous → api-key ≈ −9 to −14%
req/s on the cheapest endpoint. Real but second-order at this concurrency; will matter more after
large-page costs are fixed. The JWT-verify/api-key memoization experiments remain worthwhile
upstream but are not the top lever locally.

## T1 experiment — wire `prepareResultContext` (DONE, commit c4868ebd2)

Controlled A/B, fresh server process per arm (PID + code-state asserted), responses byte-identical
across 9 feature probes (truncate, html, highlight, wkt, select, geo_distance, values_agg, geo_agg):

| Scenario | legacy p50 | fixed p50 | legacy req/s | fixed req/s | speedup |
|---|---|---|---|---|---|
| large-page-json | 804 ms | 411 ms | 12 | 24 | ×2.0 |
| large-page-truncate | 1622 ms | 424 ms | 6 | 23 | ×3.8 |
| wide-list | 173 ms | 79 ms | 57 | 125 | ×2.2 |

`prepareResultItems` step avg: 556→175 ms (json), 1225→187 ms (truncate), 9.25→0.23 ms (wide-list).

Note on attribution: an isolated micro-benchmark (`benchmark/src/micro/prepare-result-item.bench.ts`)
underestimates this win badly (×1.0 on plain queries) because its flatten stub allocates per hit and
because single-threaded runs don't reproduce the GC pressure of the legacy path's ~30k closures per
request under concurrent load. End-to-end throughput under concurrency is the ground truth here.

## Write scenarios (after T1; T1 does not touch the write path)

| Scenario | Result | Reading |
|---|---|---|
| bulk-ndjson-unique (100k) | request 8.5 s (11.8k lines/s) + indexing 34.4 s (2.9k lines/s) | ES indexing phase is 4× the mongo phase → T4 (findOne/line in MarkIndexedStream) + T9 (200 KB bulks) are the levers |
| bulk-ndjson-duplicates (10k, 100 ids) | request 11.3 s (881 lines/s) | ×13 vs unique ingest → T6 confirmed (flush + 100 ms sleep per duplicate hit) |
| bulk-patch (50k) | request 2.6 s + indexing 17.7 s | mongo patch phase is fast at this scale; indexing dominates again |
| single-line-writes | p50 1010 ms, 10 req/s (10 conns) | `refresh: wait_for` wall, T12: concurrent waiters coalesce on the ~1 s refresh; throughput = connections × 1/refresh_interval |
| wide-single-line-writes | p50 1048 ms, 9 req/s | T3 ajv-compile adds only ~40 ms behind the 1 s wait → its throughput cost is masked; rerun with `singleLineOpRefresh: false` to expose it. The unbounded ajv cache leak (T3) is a separate argument, not yet measured (needs a long dedicated run watching RSS) |

## Protocol caveats (hard-won, respect them in every future experiment)

1. **Reverse-proxy cache**: without `x-cache-bypass`, anonymous GET scenarios measure nginx, not
   the API (43.8k req/s with 29 requests reaching the API). The runner now injects it everywhere.
2. **Code-state discipline**: `node --watch` silently never reloaded; dev-benchmark now uses
   nodemon (~2 s reloads). Every A/B arm must assert server PID changed + expected code marker.
3. **Process-state drift**: the same legacy code measured 870 ms vs ~430 ms p50 on large-page-json
   depending on process age/heap history (and ES segment state after seeding). Always A/B with a
   fresh restart per arm, back to back; never compare across hours.
4. **Long bulk requests** must go directly to the API port (nginx proxy_read_timeout kills them).
5. autocannon `idReplacement` corrupts content-length with variable-length ids → avoid; let the
   API generate line ids.
6. autocannon `errors` ≈ nginx `keepalive_requests 1000` socket recycling at high req/s (1–2 per
   connection per 1000 requests) — not request failures; `non2xx` is the failure signal.

## Next experiments, ranked

1. **T14** — `setImmediate` instead of `setTimeout(0)` yields in readLines/results2csv: with T1
   done, the remaining 175 ms step avg on large pages likely contains substantial yield latency.
2. **T4** — batch MarkIndexedStream `$in` read-back: indexing phase is 4× mongo phase on bulks.
3. **T9** — raise ES bulk threshold (decouple from the sync/async gate first), with T4.
4. **T6** — Set-based duplicate detection + rework the 100 ms sleep: ×13 measured penalty.
5. **T3** — memoize compileSchema; measure with `singleLineOpRefresh: false` + long-run RSS for the
   leak; also unlocks T12 (opt-out of wait_for) as a config/API-param experiment.
6. **T5** — cheap ETag on large pages (profile `finish` step share first: 35–53 ms avg on
   large-page-json).
7. **T2/T8** — upstream lib-node token cache + api-key memoization (measured −3..−14% req/s).
