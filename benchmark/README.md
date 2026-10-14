# data-fair benchmark

An Elasticsearch query evaluation harness for data-fair. Measures per-query ES cost on
large, realistically-shaped datasets and runs A/B comparisons of query variants.

See [`../docs/superpowers/specs/2026-05-22-es-query-evaluation-harness-design.md`](../docs/superpowers/specs/2026-05-22-es-query-evaluation-harness-design.md)
for the design and [`INVESTIGATIONS.md`](./INVESTIGATIONS.md) for the follow-up backlog.

## Setup

From the repository root, in separate terminals:

    npm run test-deps      # mongo, elasticsearch, simple-directory, ...
    npm run dev-benchmark  # API server + worker, benchmark config (relaxed limits)

The harness auto-discovers the dev environment from the repo `.env` (`DEV_HOST`,
`NGINX_PORT`, `ES_PORT`). Override with the `BENCHMARK_URL`, `BENCHMARK_DIRECTORY_URL`
and `BENCHMARK_ES_NODES` environment variables if needed.

## Commands

    # Seed datasets (idempotent; first multi-million-row seed is slow)
    npm run benchmark -- seed --preset=small
    npm run benchmark -- seed --preset=tall --rows=5000000
    npm run benchmark -- seed --preset=wide-text --shards=3

    # Raw-ES A/B experiments (--rows runs against a smaller seeding)
    npm run benchmark -- experiment --name=track-total-hits --profile
    npm run benchmark -- experiment --name=search-catchall:wide-q --cold
    npm run benchmark -- experiment --name=all --runs=20

    # End-to-end data-fair API query
    npm run benchmark -- query --dataset=bench-tall --params="q=analyse&size=20" --runs=10

    # Autocannon throughput test
    npm run benchmark -- throughput --duration=30 --connections=20

Presets: `small` (1k rows), `tall` (2M, for track_total_hits), `wide-text` (300k, ~40
text columns), `mixed` (500k, all types). Experiments: `track-total-hits:*`,
`search-catchall:wide-q`, `min-should-match:wide-q`, `complete-ranking:*` (self-built
index — runs with `--no-seed`, no API needed), and more — see `src/experiments.ts`.

## UI table harness

A/B of the dataset table UI (`ui/src/components/dataset/table/`) between a base ref and
the working tree. Both are production builds served on the running dev stack. In the
browser, a Playwright route answers the build's files from disk and lets API and config
requests through, so only the bundle differs. `ui/dist` is never written.

Prerequisites:
- the dev stack is up (`npx --no df-dev status`);
- the `fixtures-table-perf` dataset exists (`npm run dev-fixtures`). It has 50 columns and
  10,000 rows, and belongs to the `dev_fixtures` org: open
  `/data-fair/embed/dataset/fixtures-table-perf/table` in your dev session. The harness
  signs in as the dev user itself. The dataset is not public on purpose: the test suites run
  against the same API and count every dataset a user can read.

    npm run benchmark -- ui-table --base=master                    # all scenarios, ~10 minutes
    npm run benchmark -- ui-table --scenarios=hover,search --runs=3   # targeted, a few minutes

Scenarios:
- `load`: navigation until the first rows are drawn;
- `scroll`: about 400 rows in 40 wheel steps, settling after each one;
- `search`;
- `header-menu`: open and close 10 column menus;
- `hover`: a 10×10 block of cells.

The browser is headless Chromium at 1920×1080, with the CPU slowed 4× (`--no-throttle`
disables it). Each variant gets 5 runs (`--runs`), alternated with the other variant, each
in a fresh context. `--headed` shows the browser.

Reading the report: one table per scenario, with absolute values for both variants.
- Timing values (`*Ms`, `heapMB`) are flagged `slower` or `faster` only when the two
  min–max ranges don't overlap and the medians differ by more than 10%. `heapMB` is read
  after a forced garbage collection.
- Structural values (`domNodes`, `renderedRows`, `linesRequests`) are flagged `changed`
  on any difference, and `unstable` when they vary within one variant. That points to
  nondeterminism, in the table or in a scenario.

Read the absolute values even when nothing is flagged. A structural `changed` can also
reveal a functional change: losing the hover buttons shows up as fewer `domNodes` in
`hover`.

Limits:
- Both variants run with the stack's `uiConfig`, which comes from the current tree.
- The base build is cached by commit SHA in `benchmark/.cache/`. It runs `npm ci` in a
  temporary worktree when the base lockfile differs from the current one.
- `taskMs` (all main-thread work) is much larger than script + layout + style on this
  table, so paint and rasterisation probably dominate. These run in software in headless
  Chromium, so treat paint-heavy differences with care.

## Results

Experiment and throughput results print to the console and are saved as JSON in
`benchmark/results/`, tagged with the git commit.

## Tests

    npm -w benchmark test  # pure-unit tests (generator, metrics, presets, runner, ...)
