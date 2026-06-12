# data-fair benchmark

HTTP benchmark for the data-fair API: the GET `/lines` hot path, auth-layer overhead, and the
REST-dataset write/indexing path. Scenarios map to the findings of the static performance scan in
[perf-scan-notes.md](./perf-scan-notes.md) (T-ids below refer to it).

## Usage

From the repository root, run these commands in separate terminals (zellij panes):

```sh
# 1. Start infrastructure (mongo, elasticsearch, simple-directory, etc.)
npm run test-deps

# 2. Start the API server + worker with the benchmark config
npm run dev-benchmark

# 3. Run the benchmark (seeds data on first run, then benchmarks)
npm run benchmark
```

The benchmark environment is fully isolated from dev: mongo db `data-fair-benchmark`,
ES indices prefix `dataset-benchmark`, data dir `data/benchmark`. Rate/bandwidth/compute limits
are raised so the platform, not the limiter, is measured; `singleLineOpRefresh` is the production
`wait_for`. The first run seeds three datasets (1k rows, 100k rows, and 5k rows × 300 columns),
which takes a few minutes.

## Scenario groups

```sh
npm run benchmark                                  # default: --scenarios=reads
npm run benchmark -- --scenarios=writes            # all write scenarios (long: bulk seeding + runs)
npm run benchmark -- --scenarios=all               # everything
npm run benchmark -- --scenarios=simple-list,sort  # explicit list
```

### Read scenarios (`reads`)

| Scenario | What it measures |
|---|---|
| `simple-list`, `fulltext-search`, `filter-eq`, `filter-range`, `sort`, `deep-pagination`, `geo-bbox`, `combined`, `small-dataset` | baseline `/lines` query mix |
| `auth-anonymous` / `auth-session` / `auth-apikey` | identical query under different auth: JWT verify per request (T2), uncached api-key lookup (T8) |
| `large-page-json` / `large-page-csv` | 10000-row pages: per-hit result preparation (T1), ETag MD5 (T5), monolithic stringify (T13), setTimeout yields (T14) |
| `wide-list` | 100 rows × 300 columns: O(schema) per-request costs (T1/T16) |

### Write scenarios (`writes`)

| Scenario | What it measures |
|---|---|
| `bulk-ndjson-unique` (oneshot) | 100k unique-id NDJSON: mongo phase (`requestMs`) vs indexing phase (`indexMs`) — T4 mark-indexed findOne/line, T9 ES bulk sizing, T11 per-line costs |
| `bulk-ndjson-duplicates` (oneshot) | 10k lines cycling 100 ids: duplicate-in-batch flush + 100 ms sleep penalty (T6) |
| `bulk-patch` (oneshot) | 50k patches: read-back pass with O(n²) scans and `$or` filters (T10) |
| `single-line-writes` | concurrent POST `/lines`: ajv compile per request + leak (T3, watch `rss delta` grow with duration), `refresh: wait_for` throughput ceiling (T12) |
| `wide-single-line-writes` | same on 300 columns: compile cost scales with schema width (T3) |

## Options

```sh
npm run benchmark -- --duration=30 --connections=20   # autocannon scenarios
npm run benchmark -- --warmup=0                       # skip warmup
npm run benchmark -- --repetitions=3                  # oneshot scenarios (default 1)
npm run benchmark -- --no-save                        # don't write results JSON
```

## Server-side metrics

When the API runs with the benchmark config, the prometheus observer (port `DEV_OBSERVER_PORT`)
is scraped before/after each scenario and the report includes per-step deltas from
`df_req_step_seconds` (e.g. `prepareResultItems`, `finish`) plus the process RSS delta.
If the observer is unreachable the benchmark still runs, without that section.

## CPU profiling

```sh
npm run dev-benchmark-prof   # instead of dev-benchmark; no --watch
```

Run scenarios, then stop the server with Ctrl-C: a `.cpuprofile` is written to `dev/profiles/`
on clean exit. Load it in Chrome DevTools (Performance > Load profile) or `npx speedscope`.

## Results

Results are printed to the console and saved as JSON in `benchmark/results/`, tagged with the
git commit/branch. `results/BASELINE.md` holds the analyzed baseline numbers.

## Future work

- embed-referer + application-key auth scenario (T7) — needs a configured application
- `rest.history` variant of the bulk scenarios (T20)
