# Elasticsearch query evaluation harness — design

- **Date:** 2026-05-22
- **Status:** approved (design); implementation plan to follow
- **Branch / worktree:** `perf-es-optims`

## 1. Context & motivation

data-fair serves dataset read traffic (`/lines`, `/values_agg`, `/metric_agg`, …) by
translating HTTP requests into Elasticsearch queries. On large datasets (millions of
rows, tens of columns) some of these queries are expensive and a few have effectively
unbounded complexity — they can saturate the ES data nodes and degrade the whole
cluster. `docs/architecture/load-management.md` inventories the current guardrails and,
in §9, lists hardening ideas (cap `track_total_hits`, add `terminate_after`, enforce the
aggregation fan-out cap, …).

Before changing query behaviour we want **repeatable empirical evidence** of each
optimization's effect. Today there is no way to produce it: the existing `benchmark/`
package is an `autocannon` throughput test of `GET /lines` against datasets capped at
100k rows / 7 columns. It measures aggregate latency/throughput — it cannot isolate
per-query ES cost, cannot query raw ES, cannot A/B compare query variants, and cannot
reach the dataset shapes (wide text schemas, multi-million-row tables) the open
questions need.

This spec designs the **evaluation harness** that fills that gap. It is deliberately the
*first* sub-project of a larger effort; the investigations it enables are tracked
separately (see §10 and `benchmark/INVESTIGATIONS.md`).

## 2. Goals

- Produce repeatable, empirical per-query cost measurements on large, realistically
  shaped datasets, runnable on a developer's local docker Elasticsearch.
- Make **A/B comparison of query variants** (optimization on vs. off) the primary
  workflow, expressed as raw Elasticsearch query bodies so an idea can be measured
  *before* any data-fair code exists to generate it.
- Cover the dataset shapes the planned investigations need: a wide text-heavy schema, a
  tall multi-million-row table, and a mixed-type schema.
- Keep an end-to-end mode that exercises the real data-fair API path, and keep the
  existing concurrency/throughput mode.
- Persist results so they are diffable across git commits.

## 3. Non-goals

- **No production-code changes.** The harness does not add a debug mode to the data-fair
  API, does not flag-gate optimizations, and does not capture data-fair's generated ES
  query. Experiment query bodies are hand-authored to mirror `prepareQuery`
  (`api/src/datasets/es/commons.js`).
- **No regression gating / CI integration.** Threshold-based pass/fail is premature
  before we have baseline numbers.
- **The harness's seed / experiment / throughput runs are not wired into the Playwright
  suite** — they need a live ES + data-fair and, like the existing `benchmark/` package,
  run on demand. Pure-function unit tests are a separate matter — see §10.
- **No multi-node / remote-cluster topology.** Target is the local single-node docker
  ES. Sharding sensitivity is approximated locally (see §6).
- The harness does not itself draw conclusions or change query behaviour — running the
  shipped experiments at scale and writing the findings is follow-up work (§10).

## 4. Scope decision

The original request bundled five threads: (1) build evaluation tooling, (2) investigate
`track_total_hits` / block-max-WAND, (3) validate the `_search` catch-all optimization,
(4) experiment with `minimum_should_match`, (5) audit & document unbounded-complexity
requests. Threads 2–4 are *investigations that depend on the tooling from thread 1*.

**This spec covers thread 1 only — the harness.** Threads 2–5 are captured as a
follow-up backlog in `benchmark/INVESTIGATIONS.md` (a deliverable of this work, see §9).
The harness ships *executable experiment definitions* for threads 2–4 (they are just
query-body data and they prove the framework's shape); running them on multi-million-row
datasets and writing the findings is the follow-up.

## 5. Architecture

### 5.1 Module layout

The harness extends the existing `benchmark/` package (`@data-fair/data-fair-benchmark`,
ESM, run via `node --experimental-strip-types`). `src/index.ts` becomes a command
dispatcher.

```
benchmark/src/
  index.ts          CLI dispatch (parse command, route)
  setup.ts          data-fair auth/connection            (existing, kept)
  es.ts             raw ES client → local docker ES      [NEW]
  generator.ts      parametric schema + row generator    (evolves seed.ts)
  presets.ts        named dataset specs                  [NEW]
  seeder.ts         idempotent seeding via data-fair     [NEW]
  runner.ts         per-query runner: N runs → metrics   [NEW]
  metrics.ts        metric types + median/min/max/stddev [NEW]
  experiments.ts    experiment registry                  [NEW]
  experiments/
    track-total-hits.ts                                  [NEW]
    search-catchall.ts                                   [NEW]
    min-should-match.ts                                  [NEW]
  throughput.ts     autocannon mode                      (evolves index.ts logic)
  scenarios.ts      throughput scenarios                 (existing, kept)
  reporter.ts       console tables + JSON persistence    (existing, extended)
benchmark/INVESTIGATIONS.md   follow-up backlog for threads 2–5  [NEW]
benchmark/README.md           updated for the new commands
```

New dependency: `@elastic/elasticsearch` (v8, to match the API client). `seed.ts`'s
deterministic generation evolves into `generator.ts`; the seeding logic currently in
`setup.ts` moves to `seeder.ts`; the autocannon logic currently in `index.ts` moves to
`throughput.ts`.

### 5.2 Commands

Invoked as `npm run benchmark -- <command> [options]`. No command prints usage.

| Command | Purpose | Key options |
|---|---|---|
| `seed` | Generate & idempotently load datasets | `--preset=`, `--rows=`, `--shards=`, `--seed=` |
| `experiment` | Raw-ES A/B: baseline vs. variant query bodies | `--name=`, `--runs=`, `--profile`, `--cold` |
| `query` | Run a real data-fair API request N times | `--dataset=`, `--params=`, `--runs=` |
| `throughput` | Existing autocannon concurrency test | `--scenarios=`, `--duration=`, `--connections=` |

## 6. Dataset generation & seeding

### 6.1 Generator (`generator.ts`)

Keeps the deterministic seeded PRNG (mulberry32). Produces a data-fair schema + rows
from a `DatasetSpec`. Columns are described as **column groups**, each carrying an
explicit `x-capabilities` object, so the generated schema is faithful to how real
data-fair datasets are configured — crucially, so that full-text search and raw
exact-value filtering are modelled as the distinct things they are.

`x-capabilities` (`api/contract/capabilities.js`) is a per-column set of booleans; the
ones that matter to the harness:

| Capability | Default | Effect on the ES mapping |
|---|---|---|
| `text` | true | French-analyzed `.text` sub-field (full-text search) |
| `textStandard` | true | standard-analyzed `.text_standard` sub-field (full-text search) |
| `index` | true | keyword indexed — exact-value filtering |
| `values` | true | sortable & groupable (aggregations) |
| `textAgg` | false | word-statistics sub-field |
| `wildcard` | false | wildcard-filterable sub-field |

A column's analyzed sub-fields (`.text`, `.text_standard`) are exactly what
`hasManyQSearchFields` counts toward the `_search` catch-all threshold, so modelling
capabilities explicitly is what makes the `wide-text` preset and the `search-catchall`
experiment honest.

```ts
type Capabilities = Partial<{
  text: boolean; textStandard: boolean; index: boolean
  values: boolean; textAgg: boolean; wildcard: boolean
}>

interface ColumnGroup {
  type: 'string' | 'integer' | 'number' | 'date' | 'boolean'
  count: number
  capabilities?: Capabilities    // x-capabilities; omitted = data-fair defaults
  cardinality?: 'low' | 'high'   // value-generation hint (categorical vs. near-unique)
}

interface DatasetSpec {
  id: string                     // fixed dataset id (e.g. 'bench-tall')
  columns: ColumnGroup[]
  geo?: boolean                  // adds one lat/lon pair
  rows: number
  shards?: number
  seed?: number
}
```

Named capability presets keep specs readable:

| Name | `x-capabilities` | Meaning |
|---|---|---|
| `fullText` | `text`, `textStandard`, `index`, `values` on | full-text-searchable *and* exact-filterable |
| `searchOnly` | `text`, `textStandard` on; `index`, `values` off | long free text — full-text search, no exact filter/sort |
| `keywordOnly` | `text`, `textStandard` off; `index`, `values` on | exact-value filtering / grouping only, no full-text |

Generated values mix low- and high-cardinality (per `cardinality`) so filter, sort and
aggregation tests are meaningful. `string` columns are multi-word French sentences from
an expanded word pool (consistent with the existing `seed.ts`); `keywordOnly` string
columns are drawn from a small categorical set.

### 6.2 Presets (`presets.ts`)

Four named specs, each with a fixed dataset id:

| Preset | Shape | Default rows | Purpose |
|---|---|---|---|
| `small` | ~7 cols | 1,000 | Baseline / smoke test (existing `bench-small`) |
| `tall` | ~6 cols | 2,000,000 | `track_total_hits` / block-max-WAND (thread 2) |
| `wide-text` | ~40 `fullText` string cols + ~10 `keywordOnly` cols + a few numeric | 300,000 | Crosses the `_search` catch-all threshold (thread 3) |
| `mixed` | ~30 cols, all types & a mix of capability presets | 500,000 | General "tens of columns, varying types" |

`wide-text` is sized to cross `hasManyQSearchFields` — the threshold is 30 analyzed text
inner sub-fields, and each `fullText` string column contributes ~2 (`.text` +
`.text_standard`), so ~40 of them is comfortably over. It deliberately also includes
`keywordOnly` columns, which do **not** count toward the threshold, so the experiments
exercise the full-text-vs-exact-filter distinction rather than a wall of identical
columns. CLI flags (`--rows`, `--shards`, `--seed`) override a preset's defaults.

### 6.3 Seeder (`seeder.ts`)

Seeds **via data-fair**, not by writing to ES directly, so the index gets data-fair's
*real* mapping — analyzed sub-fields, custom analyzers, and the injected `_search`
field on wide datasets:

1. `PUT /api/v1/datasets/<id>` as an `isRest` dataset with the generated schema.
2. `POST /api/v1/datasets/<id>/_bulk_lines` in batches (existing 1,000-row batching).
3. Poll until `status === 'finalized'`.

It is **idempotent**: if the dataset is already finalized with `count >= rows`, seeding
is skipped (existing behaviour in `setup.ts`).

Multi-million-row seeding through `_bulk_lines` + worker finalization is a slow one-time
cost; preset defaults stay conservative (`tall` = 2M) and the cost is paid once per
machine. A direct-ES-bulk fast path is explicitly out of scope for this spec (noted as a
possible future optimization).

### 6.4 Shard count

By default the index's shard count follows data-fair's own rule
(`number_of_shards = max(1, ceil(indexed_size / 10 GB))`, `manage-indices.js`). For
sharding-sensitivity checks, `seed --shards=N` additionally produces a **faithful
N-shard reindexed copy**: the harness creates a new index with `number_of_shards: N` and
the source index's mappings copied verbatim, then runs ES `_reindex`. Experiments can
target that copy. This keeps the mapping identical to data-fair's while varying only the
shard count.

## 7. Per-query measurement & experiments

### 7.1 Raw ES client (`es.ts`)

Connects `@elastic/elasticsearch` to the local docker ES (`ES_NODES` from env, default
`http://localhost:9200`). Resolves a dataset's index/alias as
`${indicesPrefix}-${datasetId}` — `aliasName()` in `commons.js` — with `indicesPrefix`
read from the data-fair config/env or discovered via `GET /_alias`.

### 7.2 Runner (`runner.ts`)

Given a query target (index) and an ES `_search` body:

1. **Warmup** runs (default 3) — discarded.
2. If `--cold`: `POST <index>/_cache/clear` before each measured run. Default is
   **warm** (caches primed by warmup). The reporter labels which mode was used.
3. **N measured runs** (default 10), **serial** — no concurrency, isolating per-query
   cost.
4. Per run, capture: ES `took` (ms), client wall-clock round-trip (ms),
   `hits.total.value`, `hits.total.relation`, hits-returned count, response bytes.
5. If `--profile`: one **extra** run with `profile: true`, captured separately so
   profiling overhead never pollutes the timing runs.

`metrics.ts` aggregates the N runs per numeric metric into
`{ median, min, max, mean, stddev }`. **Median is the headline metric** (robust to
outliers).

### 7.3 Experiment definitions

An experiment is data, defined in `experiments/<name>.ts`:

```ts
interface SchemaContext {
  // generated field names of the seeded preset, grouped by capability,
  // so variant bodies cannot drift from the actual columns
  fullTextFields: string[]   // columns with .text / .text_standard analyzed sub-fields
  keywordFields: string[]    // exact-filter-only columns (no analyzed sub-field)
  numberFields: string[]
  dateFields: string[]
  booleanFields: string[]
  // ...helper accessors for the .text / .text_standard sub-field names
}

interface QueryVariant {
  name: string
  description: string
  body: (ctx: SchemaContext) => object   // raw ES _search body
}

interface Experiment {
  name: string
  description: string
  preset: string                          // seeded dataset to run against
  baseline: QueryVariant
  variants: QueryVariant[]
}
```

`experiments.ts` registers all experiments. `body` is a function of `SchemaContext` so a
variant always targets columns that actually exist in the seeded preset.

Three experiments ship — **definitions only**; running them at scale is follow-up work:

- **`track-total-hits`** (preset `tall`). Every query runs with `size: 20` — real
  top-k retrieval, since block-max-WAND only has something to skip when hits are
  actually retrieved. Baseline `track_total_hits: true` forces ES to collect *every*
  match, which **disables** block-max-WAND; variants `10000`, `100000`, `false` cap the
  count and let WAND skip non-competitive blocks. The file parametrizes query shapes —
  a **scoring** multi-term disjunction (`simple_query_string`, `or`), a scoring
  conjunction (`and`), a single scored `term` (`match`), and the same predicate in a
  non-scoring `filter` context — to contrast where capping re-enables WAND (the scoring
  shapes) against where WAND never applied anyway (filter-only).
- **`search-catchall`** (preset `wide-text`). Baseline = `simple_query_string` over all
  ~40 per-column analyzed fields; variant = `simple_query_string` over
  `['_search', '_search.text_standard']`. Both run against the **same index** (both
  field sets exist in the mapping), isolating the parse/execute cost of the wide
  `fields` array.
- **`min-should-match`** (preset `wide-text`). A fixed 5-term `simple_query_string`;
  baseline has no `minimum_should_match` (ES default ≈ 1 of 5 terms); variants set
  absolute thresholds `"2"`, `"3"`, `"4"`, `"5"` so each yields a distinct, unambiguous
  required-term count.

### 7.4 Result divergence

The runner records `hits.total` and the ids of the top-N hits per variant. The reporter
**flags when a variant's result set differs from the baseline** — identical for
`track_total_hits` (only the count's `relation` changes), deliberately different for
`min_should_match`. The user always sees the drift instead of trusting a misleading
speedup.

### 7.5 `experiment` command

`experiment --name=<name>` (or all) seeds the required preset if missing, runs the
baseline and every variant through the runner, and hands the results to the reporter.
`--runs`, `--profile`, `--cold` tune the runner.

## 8. Reporting (`reporter.ts`)

- **A/B comparison table** per experiment: one row per variant — median/min `took`,
  median e2e latency, `hits.total` (value + relation), response bytes, **Δ% on `took`
  vs. baseline**, and a result-divergence flag.
- **Profile summary** (with `--profile`): collapses the ES `_profile` tree into headline
  numbers — total query time, rewrite time, top contributing query-node types — per
  variant.
- **Throughput table**: existing format, kept.
- **JSON persistence**: extends the existing `results/*.json` (already tags git
  commit/branch and node version) with experiment results — variant metrics, preset +
  actual row count, warm/cold mode, run count — so runs are diffable across commits.

## 9. API & throughput modes; guiding doc

### 9.1 `query` command

Runs a real data-fair API request (e.g. `/lines`) N times via the authenticated axios
client, capturing HTTP status, e2e latency, response bytes, and `total` from the body.
This is the end-to-end confirmation that the shipped path matches what a raw-ES
experiment predicts. It does **not** capture data-fair's generated ES query (that needs
production-code changes — out of scope, §3).

### 9.2 `throughput` command

The existing autocannon logic, relocated from `index.ts` to `throughput.ts`, now also
able to target the new presets. Behaviour unchanged.

### 9.3 Guiding doc — `benchmark/INVESTIGATIONS.md`

A standing follow-up backlog for threads 2–5. Per item: hypothesis, command to run, what
to look for, where findings land.

- **Thread 2 — `track_total_hits` / block-max-WAND.** Run `experiment track-total-hits`
  on `tall` at multi-million rows. Block-max-WAND speeds up top-k retrieval of *scoring*
  queries by skipping non-competitive blocks, but `track_total_hits: true` forces ES to
  collect every match and so **disables** it. Hypothesis: capping `track_total_hits`
  restores a large speedup for scoring queries (`q`-style `simple_query_string`,
  disjunctions, conjunctions) and little for filter-only queries or requests with
  aggregations (which visit all matches regardless). data-fair sets `track_total_hits:
  true` on page 1, so every page-1 `q` search forfeits WAND — the optimization is to cap
  it (the UI already handles estimated `gte` totals via `count=estimate`).
- **Thread 3 — validate the `_search` catch-all.** Run `experiment search-catchall` on
  `wide-text` to confirm the real-world effect of the already-released optimization
  (commit `0bc454fb4`).
- **Thread 4 — `minimum_should_match`.** Run `experiment min-should-match`; weigh the
  speedup against result-set drift; decide whether a small default percentage is
  worthwhile.
- **Thread 5 — audit unbounded-complexity requests.** A checklist seeded from
  `load-management.md` §6/§9 — missing `terminate_after`, aggregation fan-out cap that
  only warns, deep pagination, exact counts on huge datasets, the unwired streaming
  export paths — to be worked into `load-management.md` updates.

Findings from threads 2–4 feed back into `load-management.md` and may spawn their own
small specs (e.g. "cap `track_total_hits` for query shape X").

## 10. Testing

The harness is dev tooling that needs a live ES + data-fair, so — like the existing
`benchmark/` package — it is **not** wired into the Playwright suite.

- **Pure units:** `generator.ts` (deterministic output for a fixed seed), `metrics.ts`
  (aggregation math), and the experiment registry (every variant `body` produces a valid
  object for a sample `SchemaContext`) get `node --test` specs, run via a `benchmark/`
  test script. Exact placement (standalone `node --test` vs. folding into the root
  `test-unit` Playwright project) is confirmed in the implementation plan.
- **Integration:** the seed → experiment → report path is verified by a documented
  README smoke run on the `small` preset against the local docker ES.

## 11. Out of scope / future

- Direct-ES-bulk fast seeding path for very large datasets.
- A data-fair API debug mode returning the generated ES query / ES `took`.
- Regression baselines with CI threshold gating.
- Multi-node / remote-cluster topology.
- The investigations themselves (threads 2–5) — tracked in `benchmark/INVESTIGATIONS.md`.

## 12. Decisions log

| Decision | Choice | Rationale |
|---|---|---|
| Spec scope | Harness only; investigations in a guiding doc | Threads 2–4 depend on the tooling |
| Environment | Local single-node docker ES | Reproducible, self-contained; WAND/`track_total_hits` effects are observable per-segment |
| Measurement | Per-query analysis primary, throughput secondary | Investigations need to see *why* a query is slow |
| A/B method | Raw-ES query variants primary | Lets ideas be measured before data-fair code exists; no production-code changes |
| Dataset shapes | Parametric generator + named presets | Presets keep results reproducible; parametric layer allows exploration |
| Schema generation | Column groups carry explicit `x-capabilities` | Models full-text search vs. raw exact-value filtering as distinct; makes the `_search` threshold honest |
| Seeding | Via data-fair `_bulk_lines` | Yields data-fair's real mapping (incl. `_search`) |
