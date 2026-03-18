# data-fair benchmark

HTTP benchmark for the data-fair API, focused on the GET `/lines` endpoint.

## Usage

From the repository root, run these commands in separate terminals:

```sh
# 1. Start infrastructure (mongo, elasticsearch, simple-directory, etc.)
npm run test-deps

# 2. Start the API server + worker with benchmark config (relaxed rate/storage limits)
npm run dev-benchmark

# 3. Run the benchmark (seeds data on first run, then benchmarks)
npm run benchmark
```

The first run seeds two datasets (1k and 100k rows) which takes a few minutes. Subsequent runs skip seeding if the datasets already exist.

## Options

```sh
# Run specific scenarios
npm run benchmark -- --scenarios=simple-list,fulltext-search

# Adjust duration and concurrency
npm run benchmark -- --duration=30 --connections=20

# Skip saving results to disk
npm run benchmark -- --no-save
```

Available scenarios: `simple-list`, `fulltext-search`, `filter-eq`, `filter-range`, `sort`, `deep-pagination`, `geo-bbox`, `combined`, `small-dataset`.

## Results

Results are printed to the console and saved as JSON in `benchmark/results/`.
