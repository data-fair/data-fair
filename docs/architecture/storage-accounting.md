# Storage accounting

A dataset's storage consumption is tracked as **two independent metrics**, each backing its own
quota (`config.defaultLimits.totalStorage` / `totalIndexed`, checked in
`api/src/datasets/utils/storage.ts` `checkStorage`, enforced account-wide via the `store_bytes` /
`indexed_bytes` limit keys — `api/src/limits/service.ts`, `api/src/limits/router.ts`):

- **`store_bytes`** — physical footprint: every byte data-fair actually stores for the dataset.
  Sum of the data-file sizes (original/normalized/full-file — `dataFiles(dataset)`), the REST
  collection's `$collStats` storage size (+ its revisions collection, if history is enabled), the
  attachments directory, and the metadata-attachments directory.
- **`indexed_bytes`** — a **CSV-export-equivalent** size of the data that actually lands in
  Elasticsearch: "if you exported this dataset to CSV right now, how many bytes would that be."
  It is not a physical size (nothing is stored in that shape) — it exists so datasets are billed
  for what they make queryable, independent of the physical encoding (BSON/mongo overhead for
  REST, extended-file JSON/geometry overhead for extensions, etc.).

Both live on `Dataset.storage` (`{ size, indexed: { size, parts }, attachments, … }`, computed by
`storage()` in `api/src/datasets/utils/storage.ts`) and are re-aggregated per-owner into the
`store_bytes` / `indexed_bytes` limit consumption by `updateTotalStorage` (`storage.ts` ≈ line
190).

## The CSV-equivalent formula

Counted columns are **exactly the columns a CSV export would emit** — the same rule as
`compileForRequest` in `api/src/datasets/utils/outputs.ts:34`: every schema property without
`x-calculated` (so `_i`, `_updatedAt`, `_geopoint`, `_rand`, `_file_raw`, and friends are
excluded; extension output columns are included, since they aren't calculated).

`api/src/datasets/es/operations.ts`:

- `lineBytesSpec(schema)` — a pure, per-dataset precomputation: `nbCols` (count of counted
  columns) and `prefixes` (their top-level key segment — extension columns are nested objects
  like `_ext_geo.lat`/`_ext_geo.lon`, so counting walks by the `_ext_geo` prefix, reading the
  whole sub-object once).
- `lineBytes(item, spec)` — per line: `spec.nbCols` (1 byte per counted column, standing in for
  the CSV separator/newline) **+** the UTF-8 byte length of each counted value
  (`Buffer.byteLength`, objects summed recursively). Missing/null values contribute 0 bytes but
  still keep their separator byte.

```
lineBytes({ name: 'abc', nb: 12, _ext_geo: { lat: 1.5, lon: 48 }, _i: 4, _updatedAt: '…' })
  = 'abc'(3) + '12'(2) + '1.5'(3) + '48'(2) + 4 separators = 14
```

(worked examples, including multi-byte UTF-8 and the calculated-column exclusion, in
`tests/features/datasets/es/line-bytes.unit.spec.ts`).

**Where it's stamped.** `api/src/datasets/es/index-stream.ts` (`IndexStream.transformPromise`,
the plain-insert branch — not the `updateMode` `doc`-patch branch, not the delete branch) computes
`item._bytes = lineBytes(item, this.lineBytesSpec)` **after** `applyCalculations(item)`, so
extension/calculated fields already present at insert time are reflected. This path is exercised
both by the batch reindex worker and by `commitLines` (`api/src/datasets/utils/rest.ts` ≈ line
996, the real-time single-line REST write-then-read-after-write path) — any line that is
(re-)written to Elasticsearch gets a fresh `_bytes`.

`_bytes` is mapped in `buildIndexMappings` (`operations.ts` ≈ line 542) as
`{ type: 'integer', index: false }` — aggregatable via doc_values, never searched.

## Why a per-doc `_bytes` + sum, not a maintained counter

The obvious alternative — keep a running `indexed_bytes` counter on the dataset, incremented by
each write's delta — was rejected because the REST→ES sync is **at-least-once**, not
exactly-once:

- REST writes flag the affected Mongo line with `_needsIndexing: true`
  (`api/src/datasets/utils/rest.ts` `applyTransactions` ≈ line 463); the batch indexing worker
  (`api/src/workers/batch-processor/index-lines.ts`) selects docs by that flag
  (`restDatasetsUtils.readStreams(dataset, { _needsIndexing: true }, …)`) and only clears it
  (`MarkIndexedStream`, `rest.ts` ≈ lines 1438-1492) once the ES bulk response confirms the doc
  was indexed — and only if the doc's `_updatedAt` hasn't changed since (an optimistic check; a
  concurrent edit just leaves `_needsIndexing` set for the next pass).
- The worker loop itself is a Mongo status-field poll, not an acked queue
  (`api/src/workers/index.ts`): a crash or a shutdown mid-task marks the task `'interrupted'` and
  simply returns — no rollback, the dataset is picked up again on the next cycle.
- **Re-indexing the same doc is idempotent**: the ES bulk op is `index` (full replace) on the
  Mongo doc's own stable `_id` (`index-stream.ts` ≈ line 87), so writing it twice converges to the
  same `_source`/`_bytes`. **A re-applied byte-delta is not** — replaying "add N bytes" after a
  crash double-counts, and there is no cheap way to make a delta idempotent against an
  at-least-once delivery without per-line bookkeeping that costs more than just re-summing.

Instead `esUtils.sumBytes` (`api/src/datasets/es/sum-bytes.ts`) sums `_bytes` with a `sum`
aggregation over the dataset's live index/alias (`size: 0, aggs: { bytes: { sum: { field:
'_bytes' } } } }`, bounded by `config.elasticsearch.searchTimeout` and
`allow_partial_search_results: false`; a missing index — e.g. the transient window mid-rebuild —
is caught (404) and surfaced as `null` rather than thrown. The sum is a **pure function of
current index state**: it is automatically correct after any sequence of writes/crashes/retries,
self-healing on the next reindex with no reconciliation logic needed.

## The organic `_esLineBytes` transition

Summing `_bytes` is only trustworthy once **every** doc in the index carries it — which is only
guaranteed right after a full index rebuild done by code that stamps it. So the CSV-equivalent
metric is adopted per-dataset, not globally:

- `api/src/workers/batch-processor/index-lines.ts` sets `result._esLineBytes = true` (≈ line 221)
  **only** in the full-reindex branch — i.e. when `partialUpdate` (`dataset._partialRestStatus ===
  'updated' | 'extended'`, ≈ line 48) is false, right after the whole index has been rebuilt
  through `IndexStream` and the alias switched. The REST partial-update branch (existing index,
  only `_needsIndexing` docs re-synced) never sets it — those docs already get accurate `_bytes`
  from the same `IndexStream`, but older docs in that same index might predate the feature, so the
  *sum* isn't trustworthy until the next full rebuild.
- `_esLineBytes` is a private marker on `DatasetInternal` (`api/types/dataset/index.ts` ≈ line
  46-49), stripped from every public dataset payload by `clean()`
  (`api/src/datasets/utils/index.ts` ≈ line 208) alongside the other `_es*` housekeeping flags.
- `storage()` (`api/src/datasets/utils/storage.ts` ≈ lines 136-145) branches on it: if
  `dataset._esLineBytes` and the dataset isn't virtual, `storage.indexed = { size:
  await esUtils.sumBytes(dataset), parts: ['lines'] }` — replacing whatever the legacy computation
  above it set (data-file size for file datasets, `$collStats` size for REST collections). If the
  sum comes back `null` (index unavailable), this run **keeps the legacy-computed value** instead
  of failing the whole storage update.
- Until a dataset's first full reindex under the new code, it silently keeps the legacy
  proxy (physical file size, or REST collection storage size) as its `indexed` figure. Every
  dataset converges to the CSV-equivalent metric on its next natural full reindex (schema change,
  republish, source-file replacement, …) — no migration script, no backfill.
- **Rolling-deploy caveat**: during a rollout, a worker replica still running the pre-feature
  image can complete a full reindex without stamping `_bytes` and without setting
  `_esLineBytes` (that code doesn't exist in its binary). This is harmless and self-corrects: the
  dataset simply stays on the legacy `indexed` value until *its* next full reindex, whenever that
  is triggered — accepted as a transient, unbounded-but-rare delay, not a correctness bug.
- Virtual datasets never take this path (`storage()` guards `!isVirtualDataset(dataset)`): they
  have no index of their own lines, so their `indexed` size stays the existing
  proportional-to-descendants `master-data` computation.

`'lines'` was added to the `storage.indexed.parts` enum (`api/types/dataset/schema.js` ≈ line
325, alongside `collection`/`original-file`/`normalized-file`/`full-file`/`attachments`/
`master-data`) and labelled in the UI (`ui/src/components/storage/storage-details.vue`: fr
*"lignes indexées (équivalent CSV)"*, en *"indexed lines (CSV equivalent)"*).

The attachments contribution (`storage.indexed.size += attachments.size`, `parts.push
('attachments')`) is computed **after** this branch and applies in both regimes — legacy or
CSV-equivalent, a dataset with an indexed `DigitalDocument` column always adds its attachments'
physical size on top.

## Consequences

- **Indexed values shrink** for REST datasets (CSV-equivalent line size vs. raw MongoDB/BSON
  storage size, which carries index and storage-engine overhead) and for extended datasets
  (CSV-equivalent size of only the counted, non-calculated columns vs. the full extended-file
  size, which includes every calculated/internal column and the source encoding's overhead). Both
  regimes still add attachments on top identically, so that part of `indexed_bytes` is unchanged.
- **Eventual consistency**: `indexed_bytes` for a given dataset can lag behind its true
  CSV-equivalent size until the next full reindex (pre-`_esLineBytes` datasets), and even once
  converged, the sum reflects whatever `_bytes` values are currently in the index — a delta
  between "line just written to Mongo" and "line indexed and `_bytes` computed" always exists,
  the same latency the rest of the read/index pipeline already has.
- No dataset is ever double-counted or under-quota-enforced by this: on any read of the sum-based
  value, the underlying data is what's actually in Elasticsearch right now.
