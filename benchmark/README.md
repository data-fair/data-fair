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
`NGINX_PORT1`, `ES_PORT`). Override with the `BENCHMARK_URL`, `BENCHMARK_DIRECTORY_URL`
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
`search-catchall:wide-q`, `min-should-match:wide-q`.

## Results

Experiment and throughput results print to the console and are saved as JSON in
`benchmark/results/`, tagged with the git commit.

## Tests

    npm -w benchmark test  # pure-unit tests (generator, metrics, presets, runner, ...)
