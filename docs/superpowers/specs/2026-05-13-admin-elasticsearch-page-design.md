# Admin Elasticsearch page — realtime cluster + dataset diagnostics

Status: draft, awaiting user review.
Branch: `perf-diagnose-es`.
Driver: data-fair already exposes per-dataset ES diagnostics (`GET /api/v1/datasets/:id/_diagnose`, superadmin "Diagnose" section, `esWarning` field) and a green/yellow ES check in `/api/v1/admin/status`. We want a superadmin page that shows ES cluster + node + activity state *right now* and ties any in-flight problem back to a data-fair dataset. It does not replace an external monitoring solution and stores no history.

## 1. Goals

1. Give a superadmin a single page to answer: "Is ES healthy right now? Which node is the outlier? What's it doing right now? Which dataset is involved?"
2. Map every ES-side artifact that names an index back to its data-fair dataset (id, title, owner) when the index belongs to data-fair.
3. Consolidate the existing per-dataset `esWarning` list with the new cluster/node view so operators have one place to land for any ES question.

## 2. Non-goals

- No history, no time-series, no charts. Snapshot only.
- No replacement for an external monitor (Grafana/Kibana/etc.).
- No remediation actions on this page beyond existing reindex deep-links into the dataset page (which already hosts reindex / refinalize / clear-locks).
- No auto-refresh loop. Manual refresh button only.
- No multi-cluster / cross-region awareness — single ES cluster per data-fair instance is assumed (matches today's deployment).
- No new persisted fields. Everything is computed per request.

## 3. Placement

A new page `ui/src/pages/admin/elasticsearch.vue`. The "datasets with ES warnings" list currently rendered by `ui/src/pages/admin/errors.vue` (the second `<template v-else-if>` block driven by `datasetsEsWarningsFetch`) moves into the new page verbatim, including its reindex action. `errors.vue` is left handling only the four non-ES blocks (datasets in error, applications in error, applications with draft error).

The admin nav exposes the new page in the same group as `errors`. Label: `Elasticsearch` (FR: `Elasticsearch`).

## 4. API

One endpoint, single round trip, no caching:

```
GET /api/v1/admin/elasticsearch/diagnose
```

- Mounted in `api/src/admin/router.js`, behind the existing `reqAdminMode` middleware and `cacheHeaders.noCache`.
- Response payload (TypeScript shape, see §5 for field-by-field source):

```ts
type AdminElasticsearchDiagnose = {
  cluster: {
    name: string
    status: 'green' | 'yellow' | 'red'
    numberOfNodes: number
    numberOfDataNodes: number
    activePrimaryShards: number
    activeShards: number
    relocatingShards: number
    initializingShards: number
    unassignedShards: number
    pendingTasks: { count: number, maxAgeMs: number | null }
  }
  nodes: Array<{
    id: string
    name: string
    roles: string[]           // 'data' | 'master' | 'ingest' | 'coordinating_only' | ...
    isDataNode: boolean
    heapUsedPct: number | null
    cpuPct: number | null
    load1m: number | null
    disk: {
      usedBytes: number | null
      totalBytes: number | null
      usedPct: number | null
      watermark: 'ok' | 'low' | 'high' | 'flood' | null  // derived against cluster settings
    }
    shardCount: number | null
    breakers: Record<string, { tripped: number }>  // parent, fielddata, request, in_flight_requests, accounting
    threadPoolsOfInterest: Array<{ name: string, active: number, queue: number, rejected: number }>
    indexingPressure: { currentCombinedBytes: number, currentPrimaryBytes: number, currentCoordinatingBytes: number } | null
  }>
  longTasks: Array<{
    id: string                 // ES task id "nodeId:taskNumber"
    node: string               // node name
    action: string             // e.g. "indices:data/read/search"
    runningTimeMs: number
    description: string        // truncated, see §5
    targets: Array<{
      indexName: string
      datasetId: string | null
      datasetTitle: string | null
      datasetOwner: { type: string, id: string, name: string } | null
    }>
  }>
  unassignedShards: Array<{
    index: string
    shard: number
    primary: boolean
    reason: string             // e.g. "NODE_LEFT", "ALLOCATION_FAILED"
    details: string | null     // free text from cluster allocation explain when available
    datasetId: string | null
    datasetTitle: string | null
    datasetOwner: { type: string, id: string, name: string } | null
  }>
  indicesSummary: {
    nbDataFairIndices: number
    nbDatasetsWithIndex: number
    nbDatasetsInMongo: number          // for the "matches?" sanity check
    totalDocs: number
    totalPrimaryBytes: number
    totalDeletedDocs: number
    deletedRatio: number               // totalDeletedDocs / (totalDocs + totalDeletedDocs)
    orphanIndicesCount: number         // data-fair-prefixed indices whose dataset id is not in Mongo
  }
  datasetsWithEsWarnings: {
    count: number
    results: Array<{ id: string, title: string, owner: { type: string, id: string, name: string }, esWarning: string, status: string }>
  }
}
```

The endpoint must answer in under ~2 s on a healthy cluster of any data-fair-realistic size (≤ a few tens of nodes, ≤ tens of thousands of indices). Larger clusters degrade gracefully via the bounded queries described in §5.

## 5. Data sources & field-by-field mapping

All calls run in parallel via `Promise.all`. ES failures inside one of them must not fail the whole response — each section is wrapped in `try { ... } catch (e) { ... }` and returns `null` (or `[]`) with the error attached on a sibling `errors` field (see §7).

### 5.1 `cluster.*`

- `client.cluster.health()` → `cluster.name`, `status`, `numberOfNodes`, `numberOfDataNodes`, `activePrimaryShards`, `activeShards`, `relocatingShards`, `initializingShards`, `unassignedShards`.
- `client.cluster.pendingTasks()` → `pendingTasks.count = tasks.length`, `pendingTasks.maxAgeMs = max(tasks[].time_in_queue_millis, 0)` or `null` if empty.

### 5.2 `nodes[*]`

- `client.nodes.stats({ metric: ['os', 'jvm', 'fs', 'thread_pool', 'breaker', 'indexing_pressure', 'indices'], filter_path: ... })` — `filter_path` is set so the body stays small (no per-index breakdown). For each node:
  - `id` = key in `nodes`
  - `name` = `node.name`
  - `roles` = `node.roles`; `isDataNode` = `roles.includes('data')` or any `data_*` role
  - `heapUsedPct` = `node.jvm.mem.heap_used_percent`
  - `cpuPct` = `node.os.cpu.percent`
  - `load1m` = `node.os.cpu.load_average['1m']` when available
  - `disk` = sum across `node.fs.data[*]`: `usedBytes = total - available`, `totalBytes = total`, `usedPct = usedBytes / totalBytes * 100`
  - `disk.watermark`: compared against `client.cluster.getSettings({ include_defaults: true })` thresholds (`cluster.routing.allocation.disk.watermark.{low,high,flood_stage}`). The settings call is made once per request and cached via `memoizee` for 60 s (watermarks rarely change).
  - `breakers` = mapped from `node.breakers[*].tripped`
  - `threadPoolsOfInterest` = `node.thread_pool[*]` filtered to entries where `queue > 0 || rejected > 0` (sorted by `rejected` desc, then `queue` desc, cap at 10)
  - `indexingPressure` = from `node.indexing_pressure.memory.current.{combined_coordinating_and_primary_in_bytes, primary_in_bytes, coordinating_in_bytes}` (null if the metric is not exposed by the ES version)
  - `shardCount`: from `client.cat.shards({ format: 'json', h: 'node,index' })` — counted per node, joined by `node.name`. We call `cat.shards` once and reuse it for both `shardCount` and `unassignedShards`.

### 5.3 `longTasks[*]`

- `client.tasks.list({ detailed: true, group_by: 'none' })`.
- Filter: keep every task with `running_time_in_nanos / 1e6 > config.elasticsearch.diagnose.longTaskMs` (new threshold, default `1000`). No filtering on `parent_task_id` — both top-level and child tasks are shown if they individually pass the threshold; the UI sorts by running time so the worst offender is at the top regardless of hierarchy.
- `description` is truncated to 500 chars (raw ES descriptions can be huge, especially for `indices:data/read/search` with large queries).
- `targets[]`: parse `description` for index names matching `^${config.indicesPrefix}-(.+?)-[0-9a-f]{12}(?:-[0-9]+)?$`. The dataset id is the capture group. Index resolution is also attempted on `task.description.indices` if exposed by the ES version. Each parsed index is looked up via the batched Mongo `find` (§5.5).

### 5.4 `unassignedShards[*]`

- From the `cat.shards` call (with `h: 'index,shard,prirep,state,unassigned.reason,node'`), keep only `state === 'UNASSIGNED'`.
- For each, call `client.cluster.allocationExplain({ index, shard, primary })` *only if* the unassigned list has ≤ 20 entries (otherwise skip the explain step; the reason is already in the cat output). The cap prevents long pages on broken clusters from making the endpoint itself slow.
- `datasetId/Title/Owner` resolved via the shared parse + batched Mongo lookup.

### 5.5 `indicesSummary`

- `client.cat.indices({ index: \`${config.indicesPrefix}-*\`, format: 'json', bytes: 'b', h: 'index,docs.count,docs.deleted,pri.store.size' })`.
- `nbDataFairIndices` = result length.
- Parse each index to a dataset id; build the set of distinct ids → `nbDatasetsWithIndex`.
- `nbDatasetsInMongo` = `mongo.datasets.countDocuments({ isVirtual: { $ne: true }, isMetaOnly: { $ne: true } })`. This is an informational comparison only — datasets in `draft` / `error` / not-yet-finalized states legitimately have no index, so a mismatch is not, by itself, a problem. The UI surfaces it as a discreet hint, not a warning chip.
- `totalDocs`, `totalDeletedDocs`, `totalPrimaryBytes` summed.
- `deletedRatio` = `totalDeletedDocs / (totalDocs + totalDeletedDocs)` or `0`.
- `orphanIndicesCount`: for the parsed dataset id set, batch-query Mongo `datasets.find({ id: { $in: ids } }, { projection: { id: 1 } })` and count missing ids. The same batched fetch returns `{ id, title, owner }` reused by `longTasks` and `unassignedShards`.

### 5.6 `datasetsWithEsWarnings`

- Same query as the existing `/admin/datasets-es-warnings` route in `admin/router.js`. Reused verbatim (refactored into a shared helper `listDatasetsWithEsWarnings()` in `api/src/admin/service.ts`). The endpoint is kept as-is so the move can be done independently of the UI move.

## 6. UI

`ui/src/pages/admin/elasticsearch.vue`. Sections, top to bottom:

1. **Header row** — page title, "Refresh" button (`mdi-refresh`), last-fetched timestamp.
2. **Cluster card** — colored status chip; small KPI row (data nodes, total shards, unassigned, pending tasks count + oldest age). Anything red or out-of-band is highlighted via Vuetify color tokens (no custom CSS).
3. **Nodes table** — columns: name, role chips, heap %, CPU %, load 1m, disk % (with watermark chip when not `ok`), shards. Row expansion reveals breakers (only rows where `tripped > 0`) and the node's `threadPoolsOfInterest`. Single-node clusters show only the table; the disk-watermark chip still works.
4. **Long-running tasks** — table sorted by `runningTimeMs` desc. Columns: action, running time, node, primary target (dataset title with link when resolved, raw index when not). Row expansion shows full `description` and additional targets.
5. **Unassigned shards** — table grouped by `reason`. Columns: index (or dataset link when resolved), shard, primary/replica, reason. Row expansion shows `details` from allocation explain when present.
6. **Indices summary card** — small KPI grid. A discreet warning chip appears when `orphanIndicesCount > 0` (this *is* anomalous). The `nbDatasetsWithIndex` vs `nbDatasetsInMongo` numbers are shown side-by-side as plain text (no chip) since legitimate gaps exist. A "list orphans" view is out of scope.
7. **Datasets with Elasticsearch warnings** — the existing list, with the reindex button preserved. This section is collapsed by default if `count === 0`.

All data comes from one `useFetch('/admin/elasticsearch/diagnose')`. The Refresh button calls `.refresh()`. No polling.

`errors.vue` is edited to remove the ES-warnings block, its i18n keys, the related `useFetch`, and the corresponding `reindex.execute` refresh call.

## 7. Error handling

- Endpoint never throws on a single failing section. Each top-level field of the response is computed independently; if it fails, the field is set to `null` (object) or `[]` (array) and an entry is added to a sibling `errors: Array<{ section: 'cluster'|'nodes'|..., message: string }>` field.
- The UI shows a Vuetify `v-alert` listing `errors[]` at the top of the page when non-empty. Each individual section renders an inline alert (or "not available") when its data is missing.
- Tasks-list and allocation-explain failures are common on locked-down ES clusters (privilege missing) — they must degrade silently to `errors[]` and not break the rest of the page.

## 8. Index-name → dataset id helper

Extract from `api/src/datasets/es/manage-indices.js`'s `indexPrefix(dataset)` scheme:

```
${config.indicesPrefix}-${dataset.id}-${sha1(dataset.id).slice(0, 12)}[-${timestamp}]
```

New helper `parseIndexName(indexName, indicesPrefix): string | null` in `api/src/datasets/es/commons.js` (already houses `aliasName`). Returns `dataset.id` or `null`. Pure function, easy to unit-test against fabricated strings.

## 9. Config

New keys under `elasticsearch.diagnose`:

```ts
{
  longTaskMs: 1000,           // §5.3 threshold
  unassignedExplainCap: 20    // §5.4 cap
}
```

Both have safe defaults; nothing else is required to enable the page.

## 10. Testing

Following [testing conventions](../../architecture/testing.md):

- **Unit** (`tests/features/admin/parse-index-name.unit.spec.ts`): valid index names, with/without timestamp suffix, foreign indices (return `null`), edge cases (hash truncated, dataset id containing `-`).
- **Unit** (`tests/features/admin/elasticsearch-diagnose.unit.spec.ts`): pure shape mappers from raw ES bodies to the response payload (one frozen sample per section saved as JSON fixtures). Guarantees that an ES schema drift surfaces here.
- **API** (`tests/features/admin/elasticsearch-diagnose.api.spec.ts`): integration test against the dev ES with one indexed dataset. Asserts:
  - `cluster.status` is present.
  - `nodes` has at least one entry.
  - `indicesSummary.nbDataFairIndices >= 1`.
  - The seeded dataset's id appears in `indicesSummary` (via the parse helper, indirectly verified by `nbDatasetsWithIndex >= 1`).
  - Calling without admin mode returns 403.
- **UI**: out of scope for this spec (the existing `errors.vue` has no UI tests either).

## 11. Scope boundaries / explicit nos

- No per-section endpoint splitting. One endpoint serves everything.
- No auto-refresh, no SSE, no websocket.
- No cluster-wide remediation (rerouting unassigned shards, killing long tasks, etc.).
- No new dataset-side warnings — the existing `esWarning` field and per-dataset `_diagnose` are unchanged.
- No translation of ES error bodies beyond `error.message`.
- No graph rendering of nodes — table only.

## 12. Open questions

None at design time. Implementation plan can proceed once this spec is approved.
