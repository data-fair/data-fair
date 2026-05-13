# Elasticsearch dataset diagnose — enriched warnings + superadmin UI

Status: draft, awaiting user review.
Branch: `perf-diagnose-es`.
Driver: the existing `GET /api/v1/datasets/:id/_diagnose` endpoint (superadmin-only) returns raw `{ filesInfos, esInfos, locks }`. Operators currently inspect it via `curl` to chase mapping/sharding/segment issues. We want (1) actionable warnings computed by the backend and (2) a superadmin-only "Diagnose" section on the dataset page that surfaces them.

## 1. Goals

1. Enrich the `_diagnose` response with a `warnings` array of structured items `{ code, severity, message, details }` covering both finalize-time-derivable issues and realtime-only issues (segments, deleted-doc ratio, live shard size, orphan indices).
2. Extend the existing `esWarning` field on the dataset (computed at finalize) with the new finalize-time codes so `/admin/errors.vue` can keep filtering on them; keep the field a single-string enum to avoid a schema migration.
3. Add a "Diagnose" section to `pages/dataset/[id]/index.vue`, gated by `user.adminMode`, that calls `_diagnose` on demand and renders warnings + summary + locks + raw JSON.

## 2. Non-goals

- No reindex / refinalize / clear-locks actions in the new section — display only. Those routes already exist and are reachable from `/admin/errors`.
- No new persisted fields beyond what is needed to extend `esWarning`. The full rich warning list is computed at request time by `_diagnose` and never stored.
- No change to the `esWarning_1` Mongo index or to the filtering logic of `/admin/errors.vue`.
- No new realtime-monitoring loop / background scheduler. Realtime warnings are only computed when `_diagnose` is called.
- No batched fan-out across datasets ("cluster-wide diagnose"). One dataset at a time.

## 3. Warning catalog

All codes, severity, and trigger:

| Code | Severity | When computed | Trigger |
|------|----------|---------------|---------|
| `MissingIndex` | error | finalize + realtime | aliased index does not exist (existing) |
| `IndexHealthRed` | error | finalize + realtime | `index.health === 'red'` (existing) |
| `MissingIndexSettings` | error | finalize + realtime | `settings.index.number_of_shards` missing (existing) |
| `ShardingRecommended` | warning | finalize + realtime | recommended shard count (from `dataset.storage.indexed.size`) differs from current (existing) |
| `MissingSearchOnWide` | warning | finalize + realtime | `hasManyQSearchFields(schema) === true` but `mappings.properties._search` is absent |
| `MappingNearLimit` | warning | finalize + realtime | `Object.keys(mappings.properties).length / mapping.total_fields.limit > diagnose.mappingFieldsLimitWarn` (default 0.8) |
| `ReplicaDrift` | info | finalize + realtime | `settings.index.number_of_replicas !== config.elasticsearch.nbReplicas` |
| `HighSegmentCount` | warning | realtime only | `cat indices` segments-count / `number_of_shards` > `diagnose.segmentsPerShardWarn` (default 30) |
| `LargeDeletedDocsRatio` | warning | realtime only | `docs.deleted / (docs.count + docs.deleted) > diagnose.deletedRatioWarn` (default 0.2) AND `docs.count + docs.deleted > 1000` |
| `ShardSizeOutOfBand` | warning | realtime only | `store.size_in_bytes / number_of_shards` outside `[diagnose.minShardSize, config.elasticsearch.maxShardSize]` |
| `OrphanIndices` | info | realtime only | `esInfos.indices.length > 1` — extra indices match `indexPrefix(dataset)-*` but are not the aliased one; `details.orphans` lists their names |

Severity priority for `pickPrimaryCode`: `error` > `warning` > `info`. Within a severity, the order is the order of the rows above (top = most important). This is the ordering that drives which single code is stored in `esWarning` — it preserves today's behaviour for the four existing codes and slots the new finalize-time codes after `ShardingRecommended`.

## 4. Configuration

New keys under `config.elasticsearch.diagnose` (added to `api/config/default.cjs`, `custom-environment-variables.cjs`, and the config type schema):

```js
diagnose: {
  segmentsPerShardWarn: 30,
  deletedRatioWarn: 0.2,
  mappingFieldsLimitWarn: 0.8,
  minShardSize: 1_000_000_000  // 1 GB
}
```

No new env vars required by default. The block lives on `config.elasticsearch.diagnose` so it can be overridden alongside the existing `maxShardSize` / `nbReplicas`. `maxShardSize` is reused as the upper bound for `ShardSizeOutOfBand`.

## 5. Backend architecture

### 5.1 New module `api/src/datasets/es/diagnose-warnings.ts`

Pure functions, easy to unit-test (per the [Unit tests target pure operations.ts](feedback_unit_tests_pure_functions.md) convention).

```ts
import type { DatasetInternal } from '#types'

export type WarningCode =
  | 'MissingIndex' | 'IndexHealthRed' | 'MissingIndexSettings' | 'ShardingRecommended'
  | 'MissingSearchOnWide' | 'MappingNearLimit' | 'ReplicaDrift'
  | 'HighSegmentCount' | 'LargeDeletedDocsRatio' | 'ShardSizeOutOfBand' | 'OrphanIndices'

export type Warning = {
  code: WarningCode
  severity: 'info' | 'warning' | 'error'
  message: string  // EN; UI translates by code
  details?: Record<string, unknown>
}

// EsInfos: the existing shape returned by manage-indices.datasetInfos()
export const computeFinalizeWarnings = (
  dataset: DatasetInternal,
  esInfos: EsInfos,
  esConfig: { nbReplicas: number, diagnose: DiagnoseThresholds }
): Warning[]

export const computeRealtimeWarnings = (
  dataset: DatasetInternal,
  esInfos: EsInfos,
  esConfig: { nbReplicas: number, maxShardSize: number, diagnose: DiagnoseThresholds }
): Warning[]

export const pickPrimaryCode = (warnings: Warning[]): WarningCode | null
```

Implementation notes:
- `computeRealtimeWarnings` returns a superset of `computeFinalizeWarnings`. The finalize-time function does **not** call ES — it must work from the `esInfos` snapshot only and from inputs available at finalize time. It is acceptable for the finalize-time helper to skip the realtime-only codes by construction (no extra plumbing required).
- Wide-dataset detection reuses `hasManyQSearchFields(schema)` from `operations.ts` — no new threshold defined here.
- The recommended-shard helper `getNbShards(dataset)` already lives in `manage-indices.js`; export it (or duplicate the trivial formula) so the new module can compute `ShardingRecommended` without importing the imperative module.

### 5.2 `manage-indices.js` refactor

Replace the body of `datasetWarning()`:

```js
import { computeFinalizeWarnings, pickPrimaryCode } from './diagnose-warnings.ts'

export const datasetWarning = async (dataset) => {
  if (dataset.isVirtual || dataset.isMetaOnly || dataset.status === 'draft' || dataset.status === 'error') return null
  const esInfos = await datasetInfos(dataset)
  return pickPrimaryCode(computeFinalizeWarnings(dataset, esInfos, config.elasticsearch))
}
```

This is the only behavioural change in the file. `datasetInfos()` stays as-is.

### 5.3 Router

`api/src/datasets/router.js` `_diagnose` handler:

```js
router.get('/:datasetId/_diagnose', readDataset({ ... }), cacheHeaders.noCache, async (req, res) => {
  reqAdminMode(req)
  const esInfos = await datasetInfos(req.dataset)
  const filesInfos = await filesStorage.lsrWithStats(datasetUtils.dir(req.dataset))
  const locks = [
    await mongo.db.collection('locks').findOne({ _id: `datasets:${req.dataset.id}` }),
    await mongo.db.collection('locks').findOne({ _id: `datasets:slug:${req.dataset.owner.type}:${req.dataset.owner.id}:${req.dataset.slug}` })
  ]
  const warnings = computeRealtimeWarnings(req.dataset, esInfos, config.elasticsearch)
  res.json({ filesInfos, esInfos, locks, warnings })
})
```

For virtual/meta-only datasets, `datasetInfos()` returns `{}`; `computeRealtimeWarnings` must accept that and return `[]`.

### 5.4 Dataset schema

`api/types/dataset/schema.js` `esWarning.enum` is extended:

```js
esWarning: {
  type: ['string', 'null'],
  enum: [
    'MissingIndex', 'IndexHealthRed', 'MissingIndexSettings', 'ShardingRecommended',
    'MissingSearchOnWide', 'MappingNearLimit', 'ReplicaDrift'
  ]
}
```

Realtime-only codes (`HighSegmentCount`, `LargeDeletedDocsRatio`, `ShardSizeOutOfBand`, `OrphanIndices`) are **not** added to the enum — they cannot land in `esWarning` because they are not computed at finalize. The generated `.type/index.d.ts` is regenerated as part of the build (no hand-edit).

No data migration is required: existing rows holding one of the four legacy codes remain valid.

### 5.5 API contract

`api/contract/dataset-private-api-docs.ts` `/_diagnose` response schema is tightened from `{ type: 'object' }` to document the new shape. The `warnings` array element schema mirrors the TS `Warning` type.

## 6. UI architecture

### 6.1 Section in `pages/dataset/[id]/index.vue`

Insert in the `sections` computation between `activity` and `dangerZone`:

```ts
if (user.value?.adminMode) {
  result.diagnose = { title: t('diagnose'), tabs: [] }
}
```

In the template, a `<df-section-tabs>` with `color="admin"` is rendered with id `diagnose`, mirroring the dangerZone block. Its `#content` slot renders `<dataset-diagnose />` once.

`tocSections` is updated implicitly by the existing `Object.entries(sections.value).map(...)` — no special case needed because the id is already `diagnose` (no kebab-case fix-up).

### 6.2 New component `ui/src/components/dataset/dataset-diagnose.vue`

Owns the fetch via `useFetch('datasets/${id}/_diagnose')`, lazy (only triggered when the component mounts, i.e. when the section is visible — section is gated by `v-if`, so render = need data). A "Refresh" button re-executes the fetch.

Layout, top to bottom:

1. **Warnings list** — `v-for` over `data.warnings`:
   - `v-alert` colored by severity (`info` → blue, `warning` → orange, `error` → red)
   - Title: `t('warning.' + w.code)` (e.g. `t('warning.HighSegmentCount')`)
   - Body: `w.message` + a small `<dl>` rendering `w.details` key/value pairs (numbers humanized via existing filters when applicable — bytes via `display-bytes`, integers raw)
   - Empty state when `data.warnings.length === 0`: a single `v-alert type="success"` with "No issues detected".
2. **Summary panel** — fixed read-only key/value strip pulled from `data.esInfos.index`: alias name, current index name, health, docs.count, docs.deleted, store.size (humanized), number_of_shards, number_of_replicas, segments count. Hidden when the dataset is virtual/meta-only (no index).
3. **Locks panel** — list the two `data.locks` items, formatted with a relative-time helper. Shows "free" when both are null.
4. **Raw JSON panel** — `<v-expansion-panels>` with three nested panels (`esInfos`, `filesInfos`, `locks`), each rendering pretty-printed JSON in a monospace block. Kept collapsed by default.

Component receives no props — it reads the dataset id from the store provider used elsewhere on the page (the same pattern as other `dataset-*` components under `ui/src/components/dataset/`).

### 6.3 i18n

Both `fr` and `en` blocks at the bottom of `dataset-diagnose.vue` (matches existing component convention). Keys:
- `diagnose` (section title)
- `diagnoseSubtitle`
- `noIssues`
- `refresh`
- `summary`, `locks`, `rawJson`
- `warning.MissingIndex` … `warning.OrphanIndices` for each code (one short title each)

The backend `message` string is not translated — it conveys numbers/measurements ("38 segments per shard exceeds threshold 30") and remains in EN; the i18n `warning.*` key is the human-readable label above it.

## 7. Files touched

Backend:
- `api/src/datasets/es/diagnose-warnings.ts` (new — pure)
- `api/src/datasets/es/manage-indices.js` (`datasetWarning()` delegates; export `getNbShards` if needed)
- `api/src/datasets/router.js` (extend `_diagnose` response)
- `api/types/dataset/schema.js` (extend `esWarning.enum`)
- `api/contract/dataset-private-api-docs.ts` (tighten `_diagnose` response schema)
- `api/config/default.cjs`, `api/config/custom-environment-variables.cjs`, `api/config/type/index.ts` (add `elasticsearch.diagnose` block)

UI:
- `ui/src/components/dataset/dataset-diagnose.vue` (new)
- `ui/src/pages/dataset/[id]/index.vue` (add section; minimal change to `sections` computed)

Tests:
- `tests/unit/diagnose-warnings.spec.ts` (new — pure-function coverage of every code)
- Extend `tests/features/datasets/query/search-wide.api.spec.ts` (already calls `_diagnose`) to assert the new `warnings` array shape on the wide dataset; in particular, that `MissingSearchOnWide` is absent when the `_search` field is present.
- One new API test that boots a dataset, simulates conditions for each realtime-only code where feasible (deleted-docs ratio is the easiest), and asserts the warning surfaces.

## 8. Error handling & edge cases

- Virtual / meta-only datasets: `datasetInfos()` returns `{}`. Both `computeFinalizeWarnings` and `computeRealtimeWarnings` return `[]`. Summary panel is hidden in the UI. The diagnose endpoint still returns the `filesInfos` / `locks` blocks.
- Draft / error-state datasets: `datasetWarning()` returns `null` (preserves today's behaviour). `_diagnose` still computes warnings — operators want to see why a dataset is stuck.
- `esInfos.index` missing (no aliased index): only `MissingIndex` (error) surfaces; subsequent checks that depend on `index.definition` short-circuit.
- ES cluster unavailable: `datasetInfos()` already throws; the endpoint surfaces a 500 as today.
- Permission errors in the UI: `reqAdminMode` returns 403 — the section is only rendered for `user.adminMode === true`, so the call should not happen for non-admins; the alert path in `useFetch` handles unexpected 403 by surfacing the standard error.

## 9. Testing

Unit (per [Unit tests target pure operations.ts](feedback_unit_tests_pure_functions.md)):
- One test per warning code in `diagnose-warnings.spec.ts`. Each builds a minimal `(dataset, esInfos, config)` triple and asserts the resulting `Warning[]` contains the expected code with expected details.
- One test for `pickPrimaryCode` ordering across all codes.
- One test for the virtual/meta-only short-circuit.

API:
- Extend `search-wide.api.spec.ts` (already exercises `_diagnose` on a wide dataset) to assert the `warnings` array exists and has no `MissingSearchOnWide` entry once the index is created with the `_search` field.
- New test: REST dataset that deletes >20% of its rows then calls `_diagnose` and asserts `LargeDeletedDocsRatio` appears.

UI:
- No new Playwright test added in the initial change — the page section is a thin display of API data already covered by API tests. (Can be added in a follow-up if regressions appear.)

## 10. Migration

None. `esWarning` enum is widened (additive). The `_diagnose` response is a superset of the existing one (`warnings` is the only new key). Config additions are defaulted.

## 11. Out of scope (follow-ups)

- A cluster-wide overview page that aggregates warnings across all datasets (would need a periodic snapshot — explicitly rejected in §2).
- Surfacing realtime-only warnings in `/admin/errors.vue` (would require persisting them or a fan-out call from the page).
- Action buttons (reindex / refinalize / clear locks) inline in the diagnose section.
- A Grafana / observer metric counter per warning code.
