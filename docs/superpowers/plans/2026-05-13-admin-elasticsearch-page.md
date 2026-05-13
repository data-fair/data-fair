# Admin Elasticsearch page — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a superadmin "Elasticsearch" page that shows cluster health, per-node state, long-running tasks, unassigned shards, indices summary, and the existing per-dataset ES warnings — every ES artifact that names an index is mapped back to its data-fair dataset.

**Architecture:** One new admin-only endpoint `GET /api/v1/admin/elasticsearch/diagnose` returns a structured payload assembled from parallel ES calls (`cluster.health`, `cluster.pendingTasks`, `cluster.getSettings`, `nodes.stats`, `cat.shards`, `cat.indices`, `tasks.list`, `cluster.allocationExplain`) plus one batched Mongo lookup. Each section is wrapped in a `safeSection()` so partial ES failures degrade gracefully into a sibling `errors[]`. Pure shape mappers live next to the orchestrator and are unit-tested with fabricated fixtures. A new Vue page consumes the endpoint via a single `useFetch` with a manual refresh button and absorbs the existing "datasets with ES warnings" list from `admin/errors.vue`.

**Tech Stack:** Express + `@elastic/elasticsearch` v8 client, MongoDB driver, `memoizee`, Vue 3 + Vuetify 3, Playwright (test runner), `node:assert/strict`.

**Design spec:** `docs/superpowers/specs/2026-05-13-admin-elasticsearch-page-design.md`

---

## File map

**New files (api):**
- `api/src/admin/elasticsearch-diagnose.ts` — pure shape mappers (`mapClusterHealth`, `mapNodes`, `mapLongTasks`, `mapUnassignedShards`, `mapIndicesSummary`, `resolveWatermark`) plus the `safeSection` helper. No ES / Mongo imports.
- `api/src/admin/elasticsearch-diagnose-service.ts` — orchestrator. Imports `#es`, `#mongo`, `#config`, the pure mappers, and the parseIndexName helper. Exports `getElasticsearchDiagnose()`.

**New files (tests):**
- `tests/features/admin/parse-index-name.unit.spec.ts`
- `tests/features/admin/elasticsearch-diagnose-mappers.unit.spec.ts`
- `tests/features/admin/elasticsearch-diagnose.api.spec.ts`

**New files (ui):**
- `ui/src/pages/admin/elasticsearch.vue`

**Modified files (api):**
- `api/src/datasets/es/commons.js` — export `parseIndexName(indexName, indicesPrefix)` pure helper.
- `api/src/admin/service.ts` — export `listDatasetsWithEsWarnings()` shared between the existing `/admin/datasets-es-warnings` route and the new orchestrator.
- `api/src/admin/router.js` — mount `GET /elasticsearch/diagnose`; refactor `/datasets-es-warnings` to use the new shared helper (behavior identical).
- `api/config/default.cjs` — add `elasticsearch.diagnose.longTaskMs` and `elasticsearch.diagnose.unassignedExplainCap`.

**Modified files (ui):**
- `ui/src/composables/layout/use-navigation-items.ts` — add admin nav entry between `errors` and `agents`.
- `ui/src/pages/admin/errors.vue` — remove the `datasetsEsWarningsFetch` block and its i18n keys.

---

## Task 1: `parseIndexName` helper

**Files:**
- Modify: `api/src/datasets/es/commons.js` (add export at the bottom)
- Test: `tests/features/admin/parse-index-name.unit.spec.ts`

The helper takes an ES index name and the configured prefix, returns the dataset id if the name matches the data-fair scheme, else `null`. Pattern:

```
${indicesPrefix}-${datasetId}-${12-hex-chars-of-sha1(datasetId)}[-${timestamp-digits}]
```

The dataset id can itself contain `-`. The 12-hex segment is what disambiguates id-end from suffix.

- [ ] **Step 1: Write the failing tests**

Create `tests/features/admin/parse-index-name.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { parseIndexName } from '../../../api/src/datasets/es/commons.js'

const sha = (id: string) => crypto.createHash('sha1').update(id).digest('hex').slice(0, 12)
const prefix = 'dataset-test'

test.describe('parseIndexName', () => {
  test('returns dataset id for a current-style index', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}-${id}-${sha(id)}`, prefix), id)
  })

  test('returns dataset id for an index with timestamp suffix', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}-${id}-${sha(id)}-1700000000000`, prefix), id)
  })

  test('returns dataset id when id contains hyphens', () => {
    const id = 'has-multiple-hyphens-in-id'
    assert.equal(parseIndexName(`${prefix}-${id}-${sha(id)}`, prefix), id)
  })

  test('returns null for an index not matching the prefix', () => {
    assert.equal(parseIndexName('something-else-foo-abcdef012345', prefix), null)
  })

  test('returns null when the 12-hex segment does not match the id hash', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}-${id}-deadbeef0123`, prefix), null)
  })

  test('returns null when the structure is malformed', () => {
    assert.equal(parseIndexName(`${prefix}-incomplete`, prefix), null)
    assert.equal(parseIndexName('', prefix), null)
    assert.equal(parseIndexName(`${prefix}-`, prefix), null)
  })

  test('ignores draft-prefixed indices (separate alias scheme)', () => {
    const id = 'my-dataset'
    assert.equal(parseIndexName(`${prefix}_draft-${id}-${sha(id)}`, prefix), null)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/admin/parse-index-name.unit.spec.ts`
Expected: every test fails with `parseIndexName is not a function` or similar import error.

- [ ] **Step 3: Implement the helper**

Append to `api/src/datasets/es/commons.js`:

```js
import crypto from 'node:crypto'

/**
 * Parse a data-fair ES index name and return the dataset id, or null if the
 * name does not match the data-fair scheme. Pure function.
 *
 *   `${indicesPrefix}-${datasetId}-${12-hex-sha1(datasetId)}[-${timestampDigits}]`
 *
 * The dataset id may itself contain "-"; the 12-hex segment is the disambiguator.
 */
export const parseIndexName = (indexName, indicesPrefix) => {
  if (typeof indexName !== 'string' || !indexName) return null
  const head = `${indicesPrefix}-`
  if (!indexName.startsWith(head)) return null
  const rest = indexName.slice(head.length)
  // match: <datasetId>-<12 hex>[-<digits>]   (greedy on datasetId)
  const m = rest.match(/^(.+)-([0-9a-f]{12})(?:-\d+)?$/)
  if (!m) return null
  const candidateId = m[1]
  const candidateHash = m[2]
  const expected = crypto.createHash('sha1').update(candidateId).digest('hex').slice(0, 12)
  return expected === candidateHash ? candidateId : null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/admin/parse-index-name.unit.spec.ts`
Expected: 7/7 PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/commons.js tests/features/admin/parse-index-name.unit.spec.ts
git commit -m "feat(admin): parseIndexName helper for ES index → dataset id resolution"
```

---

## Task 2: Config defaults for new diagnose thresholds

**Files:**
- Modify: `api/config/default.cjs:64-69`

- [ ] **Step 1: Add the two new keys**

In `api/config/default.cjs`, change the `elasticsearch.diagnose` block from:

```js
    diagnose: {
      segmentsPerShardWarn: 30,
      deletedRatioWarn: 0.2,
      mappingFieldsLimitWarn: 0.8,
      minShardSize: 1000000000 // 1go
    }
```

to:

```js
    diagnose: {
      segmentsPerShardWarn: 30,
      deletedRatioWarn: 0.2,
      mappingFieldsLimitWarn: 0.8,
      minShardSize: 1000000000, // 1go
      longTaskMs: 1000, // tasks running longer than this are surfaced on the admin ES page
      unassignedExplainCap: 20 // cap calls to cluster.allocationExplain per request
    }
```

- [ ] **Step 2: Verify config types build**

Run: `npm run build-types`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add api/config/default.cjs
git commit -m "feat(config): add elasticsearch.diagnose.longTaskMs and unassignedExplainCap"
```

---

## Task 3: Pure shape mappers + `safeSection` + `resolveWatermark`

**Files:**
- Create: `api/src/admin/elasticsearch-diagnose.ts`
- Test: `tests/features/admin/elasticsearch-diagnose-mappers.unit.spec.ts`

All mappers are pure: they take already-fetched data and return the spec's response shape. The orchestrator (Task 4) calls ES and feeds the mappers.

- [ ] **Step 1: Write the failing tests**

Create `tests/features/admin/elasticsearch-diagnose-mappers.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  mapClusterHealth,
  mapNodes,
  mapLongTasks,
  mapUnassignedShards,
  mapIndicesSummary,
  resolveWatermark,
  safeSection
} from '../../../api/src/admin/elasticsearch-diagnose.ts'

test.describe('resolveWatermark', () => {
  test('ok when below low', () => {
    assert.equal(resolveWatermark(50, 85, 90, 95), 'ok')
  })
  test('low when between low and high', () => {
    assert.equal(resolveWatermark(87, 85, 90, 95), 'low')
  })
  test('high when between high and flood', () => {
    assert.equal(resolveWatermark(92, 85, 90, 95), 'high')
  })
  test('flood when at or above flood', () => {
    assert.equal(resolveWatermark(96, 85, 90, 95), 'flood')
  })
  test('null when input pct is null', () => {
    assert.equal(resolveWatermark(null, 85, 90, 95), null)
  })
})

test.describe('mapClusterHealth', () => {
  test('maps standard health response', () => {
    const health = {
      cluster_name: 'es-test',
      status: 'green',
      number_of_nodes: 3,
      number_of_data_nodes: 2,
      active_primary_shards: 10,
      active_shards: 20,
      relocating_shards: 0,
      initializing_shards: 0,
      unassigned_shards: 0
    }
    const result = mapClusterHealth(health as any, [{ time_in_queue_millis: 42 }, { time_in_queue_millis: 15 }] as any)
    assert.equal(result.name, 'es-test')
    assert.equal(result.status, 'green')
    assert.equal(result.numberOfNodes, 3)
    assert.equal(result.numberOfDataNodes, 2)
    assert.equal(result.activeShards, 20)
    assert.equal(result.pendingTasks.count, 2)
    assert.equal(result.pendingTasks.maxAgeMs, 42)
  })

  test('handles empty pending tasks', () => {
    const result = mapClusterHealth({ cluster_name: 'x', status: 'green' } as any, [])
    assert.equal(result.pendingTasks.count, 0)
    assert.equal(result.pendingTasks.maxAgeMs, null)
  })
})

test.describe('mapNodes', () => {
  test('maps a single data node, filters thread pools, computes watermark', () => {
    const nodesStats = {
      nodes: {
        nodeA: {
          name: 'node-a',
          roles: ['data', 'master'],
          jvm: { mem: { heap_used_percent: 60 } },
          os: { cpu: { percent: 12, load_average: { '1m': 0.5 } } },
          fs: { data: [{ total_in_bytes: 1000, available_in_bytes: 200 }] },
          breakers: {
            parent: { tripped: 0 },
            fielddata: { tripped: 3 },
            request: { tripped: 0 }
          },
          thread_pool: {
            search: { active: 1, queue: 0, rejected: 0 },
            write: { active: 2, queue: 5, rejected: 0 },
            bulk: { active: 0, queue: 0, rejected: 7 }
          },
          indexing_pressure: {
            memory: {
              current: {
                combined_coordinating_and_primary_in_bytes: 100,
                primary_in_bytes: 60,
                coordinating_in_bytes: 40
              }
            }
          }
        }
      }
    }
    const watermarks = { lowPct: 85, highPct: 90, floodPct: 95 }
    const shardsByNode = new Map([['node-a', 7]])
    const out = mapNodes(nodesStats as any, watermarks, shardsByNode)
    assert.equal(out.length, 1)
    const n = out[0]
    assert.equal(n.id, 'nodeA')
    assert.equal(n.name, 'node-a')
    assert.deepEqual(n.roles, ['data', 'master'])
    assert.equal(n.isDataNode, true)
    assert.equal(n.heapUsedPct, 60)
    assert.equal(n.cpuPct, 12)
    assert.equal(n.load1m, 0.5)
    assert.equal(n.disk.usedBytes, 800)
    assert.equal(n.disk.totalBytes, 1000)
    assert.equal(n.disk.usedPct, 80)
    assert.equal(n.disk.watermark, 'ok')
    assert.equal(n.shardCount, 7)
    assert.equal(n.breakers.fielddata.tripped, 3)
    assert.equal(n.threadPoolsOfInterest.length, 2)
    assert.equal(n.threadPoolsOfInterest[0].name, 'bulk') // rejected first
    assert.equal(n.indexingPressure?.currentCombinedBytes, 100)
  })

  test('isDataNode true for data_hot / data_warm / data_cold roles', () => {
    const nodesStats = {
      nodes: {
        n1: { name: 'h', roles: ['data_hot'], fs: { data: [] }, breakers: {}, thread_pool: {} }
      }
    }
    const out = mapNodes(nodesStats as any, { lowPct: 85, highPct: 90, floodPct: 95 }, new Map())
    assert.equal(out[0].isDataNode, true)
  })

  test('null fields when ES omits metrics', () => {
    const nodesStats = {
      nodes: { n1: { name: 'x', roles: [], breakers: {}, thread_pool: {}, fs: { data: [] } } }
    }
    const out = mapNodes(nodesStats as any, { lowPct: 85, highPct: 90, floodPct: 95 }, new Map())
    assert.equal(out[0].heapUsedPct, null)
    assert.equal(out[0].cpuPct, null)
    assert.equal(out[0].load1m, null)
    assert.equal(out[0].disk.totalBytes, null)
    assert.equal(out[0].disk.usedPct, null)
    assert.equal(out[0].indexingPressure, null)
  })
})

test.describe('mapLongTasks', () => {
  const indicesPrefix = 'dataset-test'
  const sha = (id: string) => require('node:crypto').createHash('sha1').update(id).digest('hex').slice(0, 12)
  const idxA = `${indicesPrefix}-ds-a-${sha('ds-a')}`

  test('filters by threshold and parses dataset id from description', () => {
    const tasksResponse = {
      nodes: {
        nodeX: {
          name: 'coordinator',
          tasks: {
            't1': {
              action: 'indices:data/read/search',
              running_time_in_nanos: 5_000_000_000,
              description: `indices[${idxA}], search[ ... ]`
            },
            't2': {
              action: 'indices:data/read/search',
              running_time_in_nanos: 100_000_000,
              description: 'should be filtered out (too fast)'
            }
          }
        }
      }
    }
    const datasetsById = new Map([['ds-a', { id: 'ds-a', title: 'Dataset A', owner: { type: 'user', id: 'u', name: 'User' } }]])
    const out = mapLongTasks(tasksResponse as any, 1000, indicesPrefix, datasetsById)
    assert.equal(out.length, 1)
    assert.equal(out[0].action, 'indices:data/read/search')
    assert.equal(out[0].node, 'coordinator')
    assert.equal(out[0].runningTimeMs, 5000)
    assert.equal(out[0].targets.length, 1)
    assert.equal(out[0].targets[0].indexName, idxA)
    assert.equal(out[0].targets[0].datasetId, 'ds-a')
    assert.equal(out[0].targets[0].datasetTitle, 'Dataset A')
  })

  test('truncates very long descriptions to 500 chars', () => {
    const longDesc = 'x'.repeat(2000)
    const tasksResponse = {
      nodes: { n: { name: 'n', tasks: { t: { action: 'a', running_time_in_nanos: 2_000_000_000, description: longDesc } } } }
    }
    const out = mapLongTasks(tasksResponse as any, 1000, 'dataset-test', new Map())
    assert.equal(out[0].description.length, 500)
  })

  test('returns empty targets when no index parses out of description', () => {
    const tasksResponse = {
      nodes: { n: { name: 'n', tasks: { t: { action: 'a', running_time_in_nanos: 2_000_000_000, description: 'no index here' } } } }
    }
    const out = mapLongTasks(tasksResponse as any, 1000, 'dataset-test', new Map())
    assert.deepEqual(out[0].targets, [])
  })
})

test.describe('mapUnassignedShards', () => {
  const indicesPrefix = 'dataset-test'
  const sha = (id: string) => require('node:crypto').createHash('sha1').update(id).digest('hex').slice(0, 12)
  const idxA = `${indicesPrefix}-ds-a-${sha('ds-a')}`

  test('keeps only unassigned rows and resolves dataset', () => {
    const catRows = [
      { index: idxA, shard: '0', prirep: 'p', state: 'UNASSIGNED', 'unassigned.reason': 'NODE_LEFT' },
      { index: idxA, shard: '0', prirep: 'r', state: 'STARTED', 'unassigned.reason': '' }
    ]
    const datasetsById = new Map([['ds-a', { id: 'ds-a', title: 'A', owner: { type: 'user', id: 'u', name: 'User' } }]])
    const out = mapUnassignedShards(catRows as any, {}, indicesPrefix, datasetsById)
    assert.equal(out.length, 1)
    assert.equal(out[0].reason, 'NODE_LEFT')
    assert.equal(out[0].primary, true)
    assert.equal(out[0].datasetId, 'ds-a')
  })

  test('attaches allocation-explain details when present', () => {
    const catRows = [{ index: idxA, shard: '0', prirep: 'p', state: 'UNASSIGNED', 'unassigned.reason': 'ALLOCATION_FAILED' }]
    const explains = { [`${idxA}#0#p`]: 'cannot allocate because ...' }
    const out = mapUnassignedShards(catRows as any, explains, indicesPrefix, new Map())
    assert.equal(out[0].details, 'cannot allocate because ...')
  })

  test('returns null datasetId for foreign indices', () => {
    const catRows = [{ index: 'foreign-index', shard: '0', prirep: 'r', state: 'UNASSIGNED', 'unassigned.reason': 'NODE_LEFT' }]
    const out = mapUnassignedShards(catRows as any, {}, 'dataset-test', new Map())
    assert.equal(out[0].datasetId, null)
    assert.equal(out[0].primary, false)
  })
})

test.describe('mapIndicesSummary', () => {
  const indicesPrefix = 'dataset-test'
  const sha = (id: string) => require('node:crypto').createHash('sha1').update(id).digest('hex').slice(0, 12)

  test('sums totals and counts orphans', () => {
    const catRows = [
      { index: `${indicesPrefix}-a-${sha('a')}`, 'docs.count': '100', 'docs.deleted': '10', 'pri.store.size': '1000' },
      { index: `${indicesPrefix}-b-${sha('b')}`, 'docs.count': '200', 'docs.deleted': '0', 'pri.store.size': '2000' }
    ]
    const mongoIdsPresent = new Set(['a']) // 'b' is orphan
    const out = mapIndicesSummary(catRows as any, indicesPrefix, 42, mongoIdsPresent)
    assert.equal(out.nbDataFairIndices, 2)
    assert.equal(out.nbDatasetsWithIndex, 2)
    assert.equal(out.nbDatasetsInMongo, 42)
    assert.equal(out.totalDocs, 300)
    assert.equal(out.totalDeletedDocs, 10)
    assert.equal(out.totalPrimaryBytes, 3000)
    assert.ok(Math.abs(out.deletedRatio - (10 / 310)) < 1e-9)
    assert.equal(out.orphanIndicesCount, 1)
  })

  test('zero ratio when no docs', () => {
    const out = mapIndicesSummary([], indicesPrefix, 0, new Set())
    assert.equal(out.deletedRatio, 0)
    assert.equal(out.totalDocs, 0)
  })
})

test.describe('safeSection', () => {
  test('returns value and pushes nothing on success', async () => {
    const errors: any[] = []
    const v = await safeSection('cluster', async () => 42, errors)
    assert.equal(v, 42)
    assert.equal(errors.length, 0)
  })

  test('returns fallback and pushes error on failure', async () => {
    const errors: any[] = []
    const v = await safeSection('cluster', async () => { throw new Error('boom') }, errors, null)
    assert.equal(v, null)
    assert.deepEqual(errors[0], { section: 'cluster', message: 'boom' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/admin/elasticsearch-diagnose-mappers.unit.spec.ts`
Expected: file resolution fails (`Cannot find module ... elasticsearch-diagnose.ts`).

- [ ] **Step 3: Implement the mappers**

Create `api/src/admin/elasticsearch-diagnose.ts`:

```ts
// Pure shape mappers + small async wrapper. No ES / Mongo / node-config imports here.

import { parseIndexName } from '../datasets/es/commons.js'

export type Watermark = 'ok' | 'low' | 'high' | 'flood' | null

export type DatasetRef = {
  id: string
  title: string
  owner: { type: string, id: string, name: string }
}

export type SectionError = { section: string, message: string }

export const resolveWatermark = (
  usedPct: number | null,
  lowPct: number,
  highPct: number,
  floodPct: number
): Watermark => {
  if (usedPct == null) return null
  if (usedPct >= floodPct) return 'flood'
  if (usedPct >= highPct) return 'high'
  if (usedPct >= lowPct) return 'low'
  return 'ok'
}

export const mapClusterHealth = (
  health: any,
  pendingTasks: Array<{ time_in_queue_millis?: number }>
) => {
  const ageList = (pendingTasks ?? []).map(t => Number(t.time_in_queue_millis ?? 0))
  return {
    name: health.cluster_name,
    status: health.status,
    numberOfNodes: health.number_of_nodes ?? 0,
    numberOfDataNodes: health.number_of_data_nodes ?? 0,
    activePrimaryShards: health.active_primary_shards ?? 0,
    activeShards: health.active_shards ?? 0,
    relocatingShards: health.relocating_shards ?? 0,
    initializingShards: health.initializing_shards ?? 0,
    unassignedShards: health.unassigned_shards ?? 0,
    pendingTasks: {
      count: (pendingTasks ?? []).length,
      maxAgeMs: ageList.length ? Math.max(...ageList) : null
    }
  }
}

const dataRoleRe = /^data(_|$)/
const isDataRole = (role: string) => dataRoleRe.test(role)

export const mapNodes = (
  nodesStats: any,
  watermarks: { lowPct: number, highPct: number, floodPct: number },
  shardsByNode: Map<string, number>
) => {
  const result: any[] = []
  for (const [id, raw] of Object.entries<any>(nodesStats?.nodes ?? {})) {
    const roles: string[] = raw.roles ?? []
    const fsData: any[] = raw.fs?.data ?? []
    let totalBytes: number | null = null
    let availBytes: number | null = null
    if (fsData.length) {
      totalBytes = 0
      availBytes = 0
      for (const d of fsData) {
        totalBytes += Number(d.total_in_bytes ?? 0)
        availBytes += Number(d.available_in_bytes ?? 0)
      }
    }
    const usedBytes = (totalBytes != null && availBytes != null) ? totalBytes - availBytes : null
    const usedPct = (totalBytes && usedBytes != null) ? (usedBytes / totalBytes) * 100 : null

    const breakers: Record<string, { tripped: number }> = {}
    for (const [bName, b] of Object.entries<any>(raw.breakers ?? {})) {
      breakers[bName] = { tripped: Number(b.tripped ?? 0) }
    }

    const tpList: Array<{ name: string, active: number, queue: number, rejected: number }> = []
    for (const [tpName, tp] of Object.entries<any>(raw.thread_pool ?? {})) {
      const queue = Number(tp.queue ?? 0)
      const rejected = Number(tp.rejected ?? 0)
      if (queue > 0 || rejected > 0) {
        tpList.push({ name: tpName, active: Number(tp.active ?? 0), queue, rejected })
      }
    }
    tpList.sort((a, b) => (b.rejected - a.rejected) || (b.queue - a.queue))
    const threadPoolsOfInterest = tpList.slice(0, 10)

    const pressure = raw.indexing_pressure?.memory?.current
    const indexingPressure = pressure
      ? {
          currentCombinedBytes: Number(pressure.combined_coordinating_and_primary_in_bytes ?? 0),
          currentPrimaryBytes: Number(pressure.primary_in_bytes ?? 0),
          currentCoordinatingBytes: Number(pressure.coordinating_in_bytes ?? 0)
        }
      : null

    result.push({
      id,
      name: raw.name,
      roles,
      isDataNode: roles.some(isDataRole),
      heapUsedPct: raw.jvm?.mem?.heap_used_percent ?? null,
      cpuPct: raw.os?.cpu?.percent ?? null,
      load1m: raw.os?.cpu?.load_average?.['1m'] ?? null,
      disk: {
        usedBytes,
        totalBytes,
        usedPct,
        watermark: resolveWatermark(usedPct, watermarks.lowPct, watermarks.highPct, watermarks.floodPct)
      },
      shardCount: shardsByNode.get(raw.name) ?? null,
      breakers,
      threadPoolsOfInterest,
      indexingPressure
    })
  }
  return result
}

const INDEX_TOKEN_RE = /[a-zA-Z0-9_.-]+/g

const extractIndexNames = (description: string, indicesPrefix: string): string[] => {
  if (!description) return []
  const head = `${indicesPrefix}-`
  const found = new Set<string>()
  const tokens = description.match(INDEX_TOKEN_RE) ?? []
  for (const tok of tokens) {
    if (tok.startsWith(head)) found.add(tok)
  }
  return [...found]
}

export const mapLongTasks = (
  tasksResponse: any,
  longTaskMs: number,
  indicesPrefix: string,
  datasetsById: Map<string, DatasetRef>
) => {
  const out: any[] = []
  for (const [, nodeBlock] of Object.entries<any>(tasksResponse?.nodes ?? {})) {
    const nodeName: string = nodeBlock.name
    for (const [taskId, task] of Object.entries<any>(nodeBlock.tasks ?? {})) {
      const runningMs = Number(task.running_time_in_nanos ?? 0) / 1e6
      if (runningMs <= longTaskMs) continue
      const rawDesc: string = task.description ?? ''
      const description = rawDesc.length > 500 ? rawDesc.slice(0, 500) : rawDesc
      const indexNames = extractIndexNames(rawDesc, indicesPrefix)
      const targets = indexNames.map(indexName => {
        const datasetId = parseIndexName(indexName, indicesPrefix)
        const ref = datasetId ? datasetsById.get(datasetId) ?? null : null
        return {
          indexName,
          datasetId,
          datasetTitle: ref?.title ?? null,
          datasetOwner: ref?.owner ?? null
        }
      })
      out.push({
        id: taskId,
        node: nodeName,
        action: task.action,
        runningTimeMs: runningMs,
        description,
        targets
      })
    }
  }
  out.sort((a, b) => b.runningTimeMs - a.runningTimeMs)
  return out
}

export const mapUnassignedShards = (
  catRows: any[],
  explainByKey: Record<string, string>,
  indicesPrefix: string,
  datasetsById: Map<string, DatasetRef>
) => {
  const out: any[] = []
  for (const row of catRows ?? []) {
    if (row.state !== 'UNASSIGNED') continue
    const indexName = row.index
    const shard = Number(row.shard)
    const primary = row.prirep === 'p'
    const datasetId = parseIndexName(indexName, indicesPrefix)
    const ref = datasetId ? datasetsById.get(datasetId) ?? null : null
    const key = `${indexName}#${shard}#${row.prirep}`
    out.push({
      index: indexName,
      shard,
      primary,
      reason: row['unassigned.reason'] ?? 'UNKNOWN',
      details: explainByKey[key] ?? null,
      datasetId,
      datasetTitle: ref?.title ?? null,
      datasetOwner: ref?.owner ?? null
    })
  }
  return out
}

export const mapIndicesSummary = (
  catRows: any[],
  indicesPrefix: string,
  nbDatasetsInMongo: number,
  mongoDatasetIds: Set<string>
) => {
  let totalDocs = 0
  let totalDeletedDocs = 0
  let totalPrimaryBytes = 0
  const datasetIds = new Set<string>()
  let orphanIndicesCount = 0
  for (const row of catRows ?? []) {
    totalDocs += Number(row['docs.count'] ?? 0)
    totalDeletedDocs += Number(row['docs.deleted'] ?? 0)
    totalPrimaryBytes += Number(row['pri.store.size'] ?? 0)
    const datasetId = parseIndexName(row.index, indicesPrefix)
    if (datasetId) {
      datasetIds.add(datasetId)
      if (!mongoDatasetIds.has(datasetId)) orphanIndicesCount += 1
    }
  }
  const denom = totalDocs + totalDeletedDocs
  return {
    nbDataFairIndices: (catRows ?? []).length,
    nbDatasetsWithIndex: datasetIds.size,
    nbDatasetsInMongo,
    totalDocs,
    totalPrimaryBytes,
    totalDeletedDocs,
    deletedRatio: denom > 0 ? totalDeletedDocs / denom : 0,
    orphanIndicesCount
  }
}

export const safeSection = async <T>(
  section: string,
  fn: () => Promise<T>,
  errors: SectionError[],
  fallback?: T
): Promise<T | undefined> => {
  try {
    return await fn()
  } catch (err) {
    errors.push({ section, message: (err as Error)?.message ?? String(err) })
    return fallback
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/admin/elasticsearch-diagnose-mappers.unit.spec.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/admin/elasticsearch-diagnose.ts tests/features/admin/elasticsearch-diagnose-mappers.unit.spec.ts
git commit -m "feat(admin): pure shape mappers for ES diagnose payload"
```

---

## Task 4: Orchestrator service

**Files:**
- Create: `api/src/admin/elasticsearch-diagnose-service.ts`

This file owns all the I/O (ES + Mongo). It assembles the response by calling the pure mappers. Watermark settings are memoized for 60 s.

- [ ] **Step 1: Create the service**

Create `api/src/admin/elasticsearch-diagnose-service.ts`:

```ts
import config from '#config'
import es from '#es'
import mongo from '#mongo'
import memoize from 'memoizee'
import { parseIndexName } from '../datasets/es/commons.js'
import {
  mapClusterHealth,
  mapNodes,
  mapLongTasks,
  mapUnassignedShards,
  mapIndicesSummary,
  safeSection,
  type SectionError,
  type DatasetRef
} from './elasticsearch-diagnose.ts'
import { listDatasetsWithEsWarnings } from './service.ts'

// Watermarks rarely change; refresh once a minute.
const DEFAULT_LOW = 85
const DEFAULT_HIGH = 90
const DEFAULT_FLOOD = 95

const parsePct = (raw: string | undefined, fallback: number): number => {
  if (!raw) return fallback
  // ES accepts "85%" or absolute "10gb"; we only handle percent values here.
  if (raw.endsWith('%')) return Number(raw.slice(0, -1))
  return fallback
}

const _getWatermarks = async (): Promise<{ lowPct: number, highPct: number, floodPct: number }> => {
  const s = await es.client.cluster.getSettings({ include_defaults: true, flat_settings: true })
  const get = (key: string): string | undefined =>
    (s.persistent as any)?.[key] ?? (s.transient as any)?.[key] ?? (s.defaults as any)?.[key]
  return {
    lowPct: parsePct(get('cluster.routing.allocation.disk.watermark.low'), DEFAULT_LOW),
    highPct: parsePct(get('cluster.routing.allocation.disk.watermark.high'), DEFAULT_HIGH),
    floodPct: parsePct(get('cluster.routing.allocation.disk.watermark.flood_stage'), DEFAULT_FLOOD)
  }
}
const getWatermarks = memoize(_getWatermarks, { promise: true, maxAge: 60_000 })

const countShardsByNode = (catShardsRows: any[]): Map<string, number> => {
  const m = new Map<string, number>()
  for (const r of catShardsRows ?? []) {
    const node = r.node
    if (!node || node === 'UNASSIGNED' || node === '') continue
    m.set(node, (m.get(node) ?? 0) + 1)
  }
  return m
}

const collectReferencedDatasetIds = (
  catShardsRows: any[],
  catIndicesRows: any[],
  tasksResponse: any,
  indicesPrefix: string
): Set<string> => {
  const ids = new Set<string>()
  for (const r of catShardsRows ?? []) {
    const id = parseIndexName(r.index, indicesPrefix)
    if (id) ids.add(id)
  }
  for (const r of catIndicesRows ?? []) {
    const id = parseIndexName(r.index, indicesPrefix)
    if (id) ids.add(id)
  }
  // task descriptions: parse out any tokens starting with prefix
  const head = `${indicesPrefix}-`
  for (const [, nodeBlock] of Object.entries<any>(tasksResponse?.nodes ?? {})) {
    for (const [, task] of Object.entries<any>(nodeBlock.tasks ?? {})) {
      const desc: string = task.description ?? ''
      for (const tok of desc.match(/[a-zA-Z0-9_.-]+/g) ?? []) {
        if (tok.startsWith(head)) {
          const id = parseIndexName(tok, indicesPrefix)
          if (id) ids.add(id)
        }
      }
    }
  }
  return ids
}

const fetchDatasetsById = async (ids: Set<string>): Promise<Map<string, DatasetRef>> => {
  const m = new Map<string, DatasetRef>()
  if (ids.size === 0) return m
  const rows = await mongo.db.collection('datasets')
    .find({ id: { $in: [...ids] } }, { projection: { _id: 0, id: 1, title: 1, owner: 1 } })
    .toArray()
  for (const r of rows as any[]) m.set(r.id, { id: r.id, title: r.title, owner: r.owner })
  return m
}

export const getElasticsearchDiagnose = async () => {
  const errors: SectionError[] = []
  const indicesPrefix: string = config.indicesPrefix
  const longTaskMs: number = config.elasticsearch.diagnose.longTaskMs
  const explainCap: number = config.elasticsearch.diagnose.unassignedExplainCap

  // Parallel fetch of the raw inputs. Each in its own safeSection so partial failures
  // surface as `errors[]` entries rather than 500'ing the whole response.
  const [
    health, pendingTasks, watermarks,
    nodesStats, catShards, catIndices, tasksResponse,
    datasetsWithEsWarnings, nbDatasetsInMongo
  ] = await Promise.all([
    safeSection('cluster.health', () => es.client.cluster.health(), errors, null as any),
    safeSection('cluster.pendingTasks', async () => (await es.client.cluster.pendingTasks()).tasks ?? [], errors, [] as any[]),
    safeSection('cluster.watermarks', () => getWatermarks(), errors, { lowPct: DEFAULT_LOW, highPct: DEFAULT_HIGH, floodPct: DEFAULT_FLOOD }),
    safeSection('nodes.stats', () => es.client.nodes.stats({
      metric: ['os', 'jvm', 'fs', 'thread_pool', 'breaker', 'indexing_pressure']
    }), errors, { nodes: {} } as any),
    safeSection('cat.shards', () => es.client.cat.shards({
      format: 'json',
      h: 'index,shard,prirep,state,unassigned.reason,node'
    }), errors, [] as any[]),
    safeSection('cat.indices', () => es.client.cat.indices({
      index: `${indicesPrefix}-*`,
      format: 'json',
      bytes: 'b',
      h: 'index,docs.count,docs.deleted,pri.store.size'
    }), errors, [] as any[]),
    safeSection('tasks.list', () => es.client.tasks.list({ detailed: true, group_by: 'none' as any }), errors, { nodes: {} } as any),
    safeSection('datasetsWithEsWarnings', () => listDatasetsWithEsWarnings(1000), errors, { count: 0, results: [] }),
    safeSection('mongo.countDatasets', () => mongo.db.collection('datasets').countDocuments({
      isVirtual: { $ne: true },
      isMetaOnly: { $ne: true }
    }), errors, 0)
  ])

  // Batched dataset lookup once we know which ids are referenced anywhere.
  const referencedIds = collectReferencedDatasetIds(catShards as any, catIndices as any, tasksResponse, indicesPrefix)
  const datasetsById = await safeSection('mongo.datasets', () => fetchDatasetsById(referencedIds), errors, new Map<string, DatasetRef>()) as Map<string, DatasetRef>

  // Allocation-explain for unassigned shards, capped.
  const explainByKey: Record<string, string> = {}
  const unassignedRows: any[] = (catShards as any[]).filter(r => r.state === 'UNASSIGNED')
  if (unassignedRows.length > 0 && unassignedRows.length <= explainCap) {
    await Promise.all(unassignedRows.map(async row => {
      const indexName = row.index
      const shard = Number(row.shard)
      const primary = row.prirep === 'p'
      const key = `${indexName}#${shard}#${row.prirep}`
      const text = await safeSection(`allocationExplain:${key}`, async () => {
        const r = await es.client.cluster.allocationExplain({ index: indexName, shard, primary } as any)
        return (r as any).note ?? JSON.stringify(r.allocate_explanation ?? r).slice(0, 1000)
      }, errors, null)
      if (text) explainByKey[key] = text
    }))
  }

  // Mongo dataset ids present, for orphan count
  const mongoIdsPresent = new Set<string>(datasetsById.keys())

  return {
    cluster: health ? mapClusterHealth(health, pendingTasks as any[]) : null,
    nodes: mapNodes(nodesStats as any, watermarks as any, countShardsByNode(catShards as any)),
    longTasks: mapLongTasks(tasksResponse as any, longTaskMs, indicesPrefix, datasetsById),
    unassignedShards: mapUnassignedShards(catShards as any[], explainByKey, indicesPrefix, datasetsById),
    indicesSummary: mapIndicesSummary(catIndices as any[], indicesPrefix, nbDatasetsInMongo as number, mongoIdsPresent),
    datasetsWithEsWarnings,
    errors
  }
}
```

- [ ] **Step 2: Verify imports resolve**

`listDatasetsWithEsWarnings` does not exist yet — Task 5 adds it. Move on; the type-check at the end of Task 5 verifies imports.

- [ ] **Step 3: Commit**

```bash
git add api/src/admin/elasticsearch-diagnose-service.ts
git commit -m "feat(admin): orchestrator for /admin/elasticsearch/diagnose"
```

---

## Task 5: Extract `listDatasetsWithEsWarnings` helper

**Files:**
- Modify: `api/src/admin/service.ts` — append new function
- Modify: `api/src/admin/router.js:58-73` — replace inline aggregation with the helper

- [ ] **Step 1: Add the helper to `api/src/admin/service.ts`**

Append to `api/src/admin/service.ts`:

```ts
export async function listDatasetsWithEsWarnings (size = 1000, skip = 0) {
  const datasets = mongo.db.collection('datasets')
  const query: any = { esWarning: { $exists: true, $ne: null } }
  const resultsPromise = datasets
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, owner: 1, esWarning: 1, status: 1 })
    .toArray()
  const [count, results] = await Promise.all([datasets.countDocuments(query), resultsPromise])
  return { count, results }
}
```

- [ ] **Step 2: Refactor the existing route to use it**

In `api/src/admin/router.js`, replace lines 58-73:

```js
router.get('/datasets-es-warnings', async (req, res, next) => {
  const datasets = mongo.db.collection('datasets')
  const query = { esWarning: { $exists: true, $ne: null } }
  const [skip, size] = findUtils.pagination(req.query)

  const resultsPromise = datasets
    .find(query)
    .skip(skip)
    .limit(size)
    .project({ _id: 0, id: 1, title: 1, owner: 1, esWarning: 1, status: 1 })
    .toArray()

  const [count, results] = await Promise.all([datasets.countDocuments(query), resultsPromise])

  res.send({ count, results })
})
```

with:

```js
router.get('/datasets-es-warnings', async (req, res, next) => {
  const [skip, size] = findUtils.pagination(req.query)
  res.send(await listDatasetsWithEsWarnings(size, skip))
})
```

Add the import at the top of `api/src/admin/router.js`, next to the existing `getStatus` import:

```js
import { getStatus, listDatasetsWithEsWarnings } from './service.ts'
```

- [ ] **Step 3: Type-check the API**

Run: `npm run check-types`
Expected: zero errors.

- [ ] **Step 4: Sanity-check the existing route still works**

Run: `npx playwright test tests/features/datasets/diagnose-warnings.unit.spec.ts`
Expected: all PASS (unit tests of pure code, unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add api/src/admin/service.ts api/src/admin/router.js
git commit -m "refactor(admin): extract listDatasetsWithEsWarnings shared helper"
```

---

## Task 6: Wire the admin route + API integration test

**Files:**
- Modify: `api/src/admin/router.js` — add new route
- Test: `tests/features/admin/elasticsearch-diagnose.api.spec.ts`

- [ ] **Step 1: Write the failing API test**

Create `tests/features/admin/elasticsearch-diagnose.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const adminUser = await axiosAuth('test_superadmin@test.com', undefined, true)

test.describe('admin/elasticsearch/diagnose', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('non-admin user gets 403', async () => {
    const res = await testUser1.get('/api/v1/admin/elasticsearch/diagnose', { validateStatus: () => true })
    assert.equal(res.status, 403)
  })

  test('admin gets a populated payload with the seeded dataset reachable', async () => {
    // Seed one dataset so the cluster has at least one data-fair index.
    await testUser1.post('/api/v1/datasets/esdiag-1', {
      isRest: true,
      title: 'esdiag-1',
      schema: [{ key: 'attr1', type: 'string' }]
    })
    await testUser1.post('/api/v1/datasets/esdiag-1/_bulk_lines', [{ attr1: 'a' }])
    await waitForFinalize(testUser1, 'esdiag-1')

    const res = await adminUser.get('/api/v1/admin/elasticsearch/diagnose')
    assert.equal(res.status, 200)
    const body = res.data

    assert.ok(body.cluster, 'cluster section present')
    assert.ok(['green', 'yellow', 'red'].includes(body.cluster.status))
    assert.ok(Array.isArray(body.nodes))
    assert.ok(body.nodes.length >= 1, 'at least one node')
    assert.ok(Array.isArray(body.longTasks))
    assert.ok(Array.isArray(body.unassignedShards))

    assert.ok(body.indicesSummary)
    assert.ok(body.indicesSummary.nbDataFairIndices >= 1, 'at least one data-fair index')
    assert.ok(body.indicesSummary.nbDatasetsWithIndex >= 1)
    assert.ok(body.indicesSummary.nbDatasetsInMongo >= 1)

    assert.ok(body.datasetsWithEsWarnings)
    assert.equal(typeof body.datasetsWithEsWarnings.count, 'number')

    assert.ok(Array.isArray(body.errors))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/admin/elasticsearch-diagnose.api.spec.ts`
Expected: both tests fail — 404 (route not mounted yet).

- [ ] **Step 3: Mount the route**

In `api/src/admin/router.js`, add this import next to the others at the top:

```js
import { getElasticsearchDiagnose } from './elasticsearch-diagnose-service.ts'
```

Insert this route just below the existing `router.get('/datasets-es-warnings', ...)` block:

```js
router.get('/elasticsearch/diagnose', async (req, res, next) => {
  try {
    res.send(await getElasticsearchDiagnose())
  } catch (err) {
    next(err)
  }
})
```

- [ ] **Step 4: Run the API test**

Run: `npx playwright test tests/features/admin/elasticsearch-diagnose.api.spec.ts`
Expected: 2/2 PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/admin/router.js tests/features/admin/elasticsearch-diagnose.api.spec.ts
git commit -m "feat(admin): GET /admin/elasticsearch/diagnose route + api test"
```

---

## Task 7: New UI page — `admin/elasticsearch.vue`

**Files:**
- Create: `ui/src/pages/admin/elasticsearch.vue`

The page is one `useFetch`, one Refresh button, plus tables/cards bound to the response. This task is intentionally one big file; the spec §6 calls out a single coherent page.

- [ ] **Step 1: Create the page**

Create `ui/src/pages/admin/elasticsearch.vue`:

```vue
<template>
  <v-container>
    <div class="d-flex align-center mb-4">
      <h2 class="text-title-large">
        {{ t('title') }}
      </h2>
      <v-spacer />
      <span
        v-if="lastFetchedLabel"
        class="text-caption text-medium-emphasis mr-2"
      >{{ lastFetchedLabel }}</span>
      <v-btn
        :prepend-icon="mdiRefresh"
        :loading="diagnoseFetch.loading.value"
        size="small"
        variant="text"
        @click="refresh"
      >
        {{ t('refresh') }}
      </v-btn>
    </div>

    <v-alert
      v-if="data?.errors?.length"
      type="warning"
      variant="tonal"
      class="mb-4"
    >
      <div class="text-body-medium font-weight-bold">{{ t('partialErrors') }}</div>
      <ul>
        <li
          v-for="e in data.errors"
          :key="e.section"
        ><code>{{ e.section }}</code>: {{ e.message }}</li>
      </ul>
    </v-alert>

    <!-- Cluster header card -->
    <v-card
      v-if="data?.cluster"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">
        {{ t('cluster.title') }}
        <v-chip
          :color="statusColor(data.cluster.status)"
          size="small"
          class="ml-2"
        >{{ data.cluster.status }}</v-chip>
      </v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col
            v-for="kpi in clusterKpis"
            :key="kpi.label"
            cols="6"
            md="3"
          >
            <div class="text-caption text-medium-emphasis">{{ kpi.label }}</div>
            <div class="text-body-medium">{{ kpi.value }}</div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Nodes table -->
    <v-card
      v-if="data?.nodes"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">{{ t('nodes.title') }}</v-card-title>
      <v-data-table
        :headers="nodeHeaders"
        :items="data.nodes"
        item-value="id"
        :items-per-page="-1"
        density="compact"
        show-expand
      >
        <template #item.roles="{ item }">
          <v-chip
            v-for="r in item.roles"
            :key="r"
            size="x-small"
            class="mr-1"
          >{{ r }}</v-chip>
        </template>
        <template #item.heapUsedPct="{ item }">{{ pctOrDash(item.heapUsedPct) }}</template>
        <template #item.cpuPct="{ item }">{{ pctOrDash(item.cpuPct) }}</template>
        <template #item.load1m="{ item }">{{ numOrDash(item.load1m) }}</template>
        <template #item.disk="{ item }">
          {{ pctOrDash(item.disk.usedPct) }}
          <v-chip
            v-if="item.disk.watermark && item.disk.watermark !== 'ok'"
            :color="watermarkColor(item.disk.watermark)"
            size="x-small"
            class="ml-1"
          >{{ item.disk.watermark }}</v-chip>
        </template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <div class="my-2">
                <div
                  v-if="trippedBreakers(item).length"
                  class="mb-2"
                >
                  <strong>{{ t('nodes.breakers') }}:</strong>
                  <span
                    v-for="b in trippedBreakers(item)"
                    :key="b.name"
                    class="ml-2"
                  ><code>{{ b.name }}</code>: {{ b.tripped }}</span>
                </div>
                <div v-if="item.threadPoolsOfInterest.length">
                  <strong>{{ t('nodes.threadPools') }}:</strong>
                  <table class="ml-2 text-caption">
                    <tr><th>name</th><th>active</th><th>queue</th><th>rejected</th></tr>
                    <tr
                      v-for="tp in item.threadPoolsOfInterest"
                      :key="tp.name"
                    >
                      <td><code>{{ tp.name }}</code></td>
                      <td>{{ tp.active }}</td>
                      <td>{{ tp.queue }}</td>
                      <td>{{ tp.rejected }}</td>
                    </tr>
                  </table>
                </div>
                <div
                  v-if="item.indexingPressure"
                  class="mt-2"
                >
                  <strong>{{ t('nodes.indexingPressure') }}:</strong>
                  combined={{ formatBytes(item.indexingPressure.currentCombinedBytes, locale) }},
                  primary={{ formatBytes(item.indexingPressure.currentPrimaryBytes, locale) }},
                  coord={{ formatBytes(item.indexingPressure.currentCoordinatingBytes, locale) }}
                </div>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <!-- Long-running tasks -->
    <v-card
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">{{ t('longTasks.title') }}</v-card-title>
      <v-card-text v-if="!data?.longTasks?.length" class="text-medium-emphasis">
        {{ t('longTasks.none') }}
      </v-card-text>
      <v-data-table
        v-else
        :headers="longTaskHeaders"
        :items="data.longTasks"
        item-value="id"
        :items-per-page="-1"
        density="compact"
        show-expand
      >
        <template #item.runningTimeMs="{ item }">{{ Math.round(item.runningTimeMs) }} ms</template>
        <template #item.primary="{ item }">
          <template v-if="item.targets[0]?.datasetId">
            <a
              :href="`/data-fair/dataset/${item.targets[0].datasetId}`"
              target="_top"
              class="simple-link"
            >{{ item.targets[0].datasetTitle || item.targets[0].datasetId }}</a>
          </template>
          <template v-else-if="item.targets[0]">
            <code>{{ item.targets[0].indexName }}</code>
          </template>
          <span
            v-else
            class="text-medium-emphasis"
          >—</span>
        </template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <pre class="text-caption">{{ item.description }}</pre>
              <div v-if="item.targets.length > 1">
                <strong>{{ t('longTasks.otherTargets') }}:</strong>
                <ul>
                  <li
                    v-for="(tgt, i) in item.targets.slice(1)"
                    :key="i"
                  >
                    <a
                      v-if="tgt.datasetId"
                      :href="`/data-fair/dataset/${tgt.datasetId}`"
                      target="_top"
                      class="simple-link"
                    >{{ tgt.datasetTitle || tgt.datasetId }}</a>
                    <code v-else>{{ tgt.indexName }}</code>
                  </li>
                </ul>
              </div>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <!-- Unassigned shards -->
    <v-card
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">{{ t('unassignedShards.title') }}</v-card-title>
      <v-card-text v-if="!data?.unassignedShards?.length" class="text-medium-emphasis">
        {{ t('unassignedShards.none') }}
      </v-card-text>
      <v-data-table
        v-else
        :headers="unassignedHeaders"
        :items="data.unassignedShards"
        item-value="index"
        :items-per-page="-1"
        density="compact"
        show-expand
      >
        <template #item.index="{ item }">
          <a
            v-if="item.datasetId"
            :href="`/data-fair/dataset/${item.datasetId}`"
            target="_top"
            class="simple-link"
          >{{ item.datasetTitle || item.datasetId }}</a>
          <code v-else>{{ item.index }}</code>
        </template>
        <template #item.primary="{ item }">{{ item.primary ? 'primary' : 'replica' }}</template>
        <template #expanded-row="{ columns, item }">
          <tr>
            <td :colspan="columns.length">
              <pre class="text-caption">{{ item.details ?? '—' }}</pre>
            </td>
          </tr>
        </template>
      </v-data-table>
    </v-card>

    <!-- Indices summary -->
    <v-card
      v-if="data?.indicesSummary"
      variant="flat"
      class="mb-4"
    >
      <v-card-title class="text-subtitle-1">{{ t('indices.title') }}</v-card-title>
      <v-card-text>
        <v-row dense>
          <v-col cols="6" md="3">
            <div class="text-caption text-medium-emphasis">{{ t('indices.nbDataFairIndices') }}</div>
            <div class="text-body-medium">{{ data.indicesSummary.nbDataFairIndices }}</div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="text-caption text-medium-emphasis">{{ t('indices.nbDatasetsWithIndex') }}</div>
            <div class="text-body-medium">{{ data.indicesSummary.nbDatasetsWithIndex }} / {{ data.indicesSummary.nbDatasetsInMongo }}</div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="text-caption text-medium-emphasis">{{ t('indices.totalDocs') }}</div>
            <div class="text-body-medium">{{ data.indicesSummary.totalDocs }}</div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="text-caption text-medium-emphasis">{{ t('indices.totalPrimary') }}</div>
            <div class="text-body-medium">{{ formatBytes(data.indicesSummary.totalPrimaryBytes, locale) }}</div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="text-caption text-medium-emphasis">{{ t('indices.deletedRatio') }}</div>
            <div class="text-body-medium">{{ (data.indicesSummary.deletedRatio * 100).toFixed(1) }}%</div>
          </v-col>
          <v-col cols="6" md="3">
            <div class="text-caption text-medium-emphasis">{{ t('indices.orphans') }}</div>
            <div class="text-body-medium">
              {{ data.indicesSummary.orphanIndicesCount }}
              <v-chip
                v-if="data.indicesSummary.orphanIndicesCount > 0"
                color="warning"
                size="x-small"
                class="ml-1"
              >!</v-chip>
            </div>
          </v-col>
        </v-row>
      </v-card-text>
    </v-card>

    <!-- Datasets with ES warnings (moved from errors.vue) -->
    <template v-if="data?.datasetsWithEsWarnings">
      <h3 class="text-title-large mt-6">
        {{ t('warnings.title') }}
      </h3>
      <p
        v-if="data.datasetsWithEsWarnings.count === 0"
        class="text-medium-emphasis"
      >{{ t('warnings.none') }}</p>
      <v-sheet
        v-else
        class="my-4"
        style="max-height:800px; overflow-y: scroll;"
      >
        <v-list lines="two">
          <v-list-item
            v-for="w in data.datasetsWithEsWarnings.results"
            :key="w.id"
          >
            <v-list-item-title>
              <a
                :href="`/data-fair/dataset/${w.id}`"
                target="_top"
                class="simple-link"
              >{{ w.title }} ({{ w.owner.name }})</a>
            </v-list-item-title>
            <v-list-item-subtitle>{{ w.esWarning }}</v-list-item-subtitle>
            <template #append>
              <v-btn
                :icon="mdiPlay"
                color="primary"
                :title="t('warnings.reindex')"
                variant="text"
                :loading="reindex.loading.value"
                @click="reindex.execute(w.id)"
              />
            </template>
          </v-list-item>
        </v-list>
      </v-sheet>
    </template>

    <v-progress-circular
      v-if="diagnoseFetch.loading.value && !data"
      indeterminate
      color="admin"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  title: Elasticsearch
  refresh: Rafraîchir
  lastFetched: 'Dernière mise à jour : {time}'
  partialErrors: Certaines sections n'ont pas pu être chargées
  cluster:
    title: Cluster
  nodes:
    title: Nœuds
    breakers: Disjoncteurs déclenchés
    threadPools: Pools de threads (queue / rejected)
    indexingPressure: Pression d'indexation
  longTasks:
    title: Tâches longues
    none: Aucune tâche au-delà du seuil
    otherTargets: Autres cibles
  unassignedShards:
    title: Shards non assignés
    none: Aucun shard non assigné
  indices:
    title: Index data-fair
    nbDataFairIndices: Index
    nbDatasetsWithIndex: Datasets avec index
    totalDocs: Documents (total)
    totalPrimary: Stockage primaire
    deletedRatio: Documents supprimés
    orphans: Index orphelins
  warnings:
    title: Jeux de données avec avertissements Elasticsearch
    none: Aucun jeu de données avec avertissements Elasticsearch
    reindex: Réindexer
en:
  title: Elasticsearch
  refresh: Refresh
  lastFetched: 'Last fetched: {time}'
  partialErrors: Some sections failed to load
  cluster:
    title: Cluster
  nodes:
    title: Nodes
    breakers: Tripped breakers
    threadPools: Thread pools (queue / rejected)
    indexingPressure: Indexing pressure
  longTasks:
    title: Long-running tasks
    none: No task above threshold
    otherTargets: Other targets
  unassignedShards:
    title: Unassigned shards
    none: No unassigned shards
  indices:
    title: Data-fair indices
    nbDataFairIndices: Indices
    nbDatasetsWithIndex: Datasets with index
    totalDocs: Total docs
    totalPrimary: Primary storage
    deletedRatio: Deleted docs
    orphans: Orphan indices
  warnings:
    title: Datasets with Elasticsearch warnings
    none: No datasets with Elasticsearch warnings
    reindex: Reindex
</i18n>

<script setup lang="ts">
import { ref } from 'vue'
import { mdiRefresh, mdiPlay } from '@mdi/js'
import { formatBytes } from '@data-fair/lib-vue/format/bytes.js'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t, locale } = useI18n()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('title') }] })

type DiagnoseResponse = {
  cluster: any | null
  nodes: any[]
  longTasks: any[]
  unassignedShards: any[]
  indicesSummary: any | null
  datasetsWithEsWarnings: { count: number, results: any[] }
  errors: Array<{ section: string, message: string }>
}

const diagnoseFetch = useFetch<DiagnoseResponse>($apiPath + '/admin/elasticsearch/diagnose')
const data = computed(() => diagnoseFetch.data.value)

const lastFetchedAt = ref<Date | null>(null)
watch(() => diagnoseFetch.data.value, v => { if (v) lastFetchedAt.value = new Date() })
const lastFetchedLabel = computed(() => lastFetchedAt.value
  ? t('lastFetched', { time: lastFetchedAt.value.toLocaleTimeString() })
  : '')

const refresh = () => diagnoseFetch.refresh()

const reindex = useAsyncAction(async (datasetId: string) => {
  await $fetch(`datasets/${datasetId}/_reindex`, { method: 'POST' })
  diagnoseFetch.refresh()
})

const statusColor = (s: string) => s === 'green' ? 'success' : s === 'yellow' ? 'warning' : 'error'
const watermarkColor = (w: string) => w === 'low' ? 'warning' : w === 'high' ? 'warning' : w === 'flood' ? 'error' : undefined

const pctOrDash = (v: number | null) => v == null ? '—' : `${Math.round(v)}%`
const numOrDash = (v: number | null) => v == null ? '—' : (Math.round(v * 100) / 100).toString()

const trippedBreakers = (n: any) => Object.entries(n.breakers ?? {})
  .filter(([, b]: any) => (b as any).tripped > 0)
  .map(([name, b]: any) => ({ name, tripped: (b as any).tripped }))

const clusterKpis = computed(() => {
  const c = data.value?.cluster
  if (!c) return []
  return [
    { label: 'data nodes', value: `${c.numberOfDataNodes} / ${c.numberOfNodes}` },
    { label: 'active shards', value: c.activeShards },
    { label: 'unassigned', value: c.unassignedShards },
    { label: 'relocating', value: c.relocatingShards },
    { label: 'initializing', value: c.initializingShards },
    { label: 'pending tasks', value: `${c.pendingTasks.count} (max age ${c.pendingTasks.maxAgeMs ?? 0} ms)` }
  ]
})

const nodeHeaders = [
  { title: 'name', key: 'name' },
  { title: 'roles', key: 'roles' },
  { title: 'heap', key: 'heapUsedPct' },
  { title: 'cpu', key: 'cpuPct' },
  { title: 'load 1m', key: 'load1m' },
  { title: 'disk', key: 'disk' },
  { title: 'shards', key: 'shardCount' },
  { title: '', key: 'data-table-expand' }
]

const longTaskHeaders = [
  { title: 'action', key: 'action' },
  { title: 'running', key: 'runningTimeMs' },
  { title: 'node', key: 'node' },
  { title: 'target', key: 'primary' },
  { title: '', key: 'data-table-expand' }
]

const unassignedHeaders = [
  { title: 'index / dataset', key: 'index' },
  { title: 'shard', key: 'shard' },
  { title: 'role', key: 'primary' },
  { title: 'reason', key: 'reason' },
  { title: '', key: 'data-table-expand' }
]
</script>
```

- [ ] **Step 2: Run lint on the UI workspace**

Run: `npm -w ui run lint`
Expected: zero errors (warnings are tolerated if pre-existing).

- [ ] **Step 3: Type-check UI**

Run: `npm run check-types`
Expected: zero errors.

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/admin/elasticsearch.vue
git commit -m "feat(ui): admin Elasticsearch page"
```

---

## Task 8: Admin nav link

**Files:**
- Modify: `ui/src/composables/layout/use-navigation-items.ts:163-170`

- [ ] **Step 1: Add the icon import**

In `ui/src/composables/layout/use-navigation-items.ts`, add `mdiDatabaseSearchOutline` to the existing `@mdi/js` import block (alphabetical order):

```ts
import {
  mdiDatabase,
  mdiDatabaseSearchOutline,
  // ... existing entries unchanged
} from '@mdi/js'
```

- [ ] **Step 2: Insert the nav entry**

In the same file, change the admin nav array (around lines 165-170):

```ts
const admin: NavItem[] = [
  { to: '/admin/info', icon: mdiInformation, title: t('serviceInfo') },
  { to: '/remote-services', icon: mdiCloud, title: t('services') },
  { to: '/admin/owners', icon: mdiBriefcase, title: t('owners') },
  { to: '/admin/errors', icon: mdiAlert, title: t('errors') },
]
```

to:

```ts
const admin: NavItem[] = [
  { to: '/admin/info', icon: mdiInformation, title: t('serviceInfo') },
  { to: '/remote-services', icon: mdiCloud, title: t('services') },
  { to: '/admin/owners', icon: mdiBriefcase, title: t('owners') },
  { to: '/admin/errors', icon: mdiAlert, title: t('errors') },
  { to: '/admin/elasticsearch', icon: mdiDatabaseSearchOutline, title: t('elasticsearch') },
]
```

- [ ] **Step 3: Add the i18n key**

The page title appears in the nav via `t('elasticsearch')`. Find the existing i18n source for `use-navigation-items.ts` (or wherever the `t('owners')`, `t('errors')` keys are declared — the same file or a co-located i18n YAML). Grep for `owners: Comptes` and add `elasticsearch: Elasticsearch` (FR) and `elasticsearch: Elasticsearch` (EN) next to it.

Run: `grep -rn "owners: Comptes\|owners: Owners" ui/src` to find the file. Edit it to add the new key in both locales.

- [ ] **Step 4: Type-check**

Run: `npm run check-types`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/composables/layout/use-navigation-items.ts ui/src/i18n  # adjust to the actual file you edited
git commit -m "feat(ui): admin nav entry for Elasticsearch page"
```

---

## Task 9: Remove ES warnings block from `errors.vue`

**Files:**
- Modify: `ui/src/pages/admin/errors.vue`

The block now lives in `admin/elasticsearch.vue`. Removing it cleans up `errors.vue` and avoids duplicate UI.

- [ ] **Step 1: Remove the template block**

In `ui/src/pages/admin/errors.vue`, delete the second template block (lines 45-85) — the `<p v-if="datasetsEsWarningsFetch...">` and the matching `<template v-else-if="datasetsEsWarningsFetch...">` and its closing tags. Keep the four other blocks (`datasetsErrorsFetch`, `applicationsErrorsFetch`, `applicationsDraftErrorsFetch`) intact.

- [ ] **Step 2: Remove the now-unused i18n keys**

In the same file, in the `<i18n>` block, delete:

```yaml
  noDatasetsWithEsWarnings: Aucun jeu de données avec avertissements Elasticsearch
  datasetsWithEsWarnings: Jeux de données avec avertissements Elasticsearch
```

(both FR and EN sections).

- [ ] **Step 3: Remove the unused fetch + refresh call**

In the `<script setup>` block:

- Delete the line declaring `datasetsEsWarningsFetch`.
- In the `reindex` action body, delete `datasetsEsWarningsFetch.refresh()`.

The `esWarning?: string,` line in the `ResourceErrors` type definition can stay (harmless and small) or be removed — remove it to keep the type honest:

```ts
type ResourceErrors = {
  count: number,
  results: {
    title: string,
    id: string,
    errorMessage?: string,
    errorMessageDraft?: string,
    updatedAt: string
    owner: { type: string, id: string, name: string },
    event: { data: string, date: string }
  }[]
}
```

- [ ] **Step 4: Lint + type-check**

Run: `npm -w ui run lint && npm run check-types`
Expected: zero errors.

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/admin/errors.vue
git commit -m "refactor(ui): drop datasets-with-ES-warnings block from admin/errors (moved)"
```

---

## Task 10: Final verification

- [ ] **Step 1: Run all admin-related tests**

```bash
npx playwright test \
  tests/features/admin/parse-index-name.unit.spec.ts \
  tests/features/admin/elasticsearch-diagnose-mappers.unit.spec.ts \
  tests/features/admin/elasticsearch-diagnose.api.spec.ts \
  tests/features/datasets/diagnose-warnings.unit.spec.ts \
  tests/features/datasets/diagnose-realtime.api.spec.ts
```

Expected: all PASS.

- [ ] **Step 2: Run lint + type-check on the whole repo**

```bash
npm run lint && npm run check-types
```

Expected: zero errors.

- [ ] **Step 3: Manual smoke test in dev**

Per `AGENTS.md`, do **not** start/stop dev processes; ask the user to confirm dev is running, then:

1. Open the back-office in the browser as `test_superadmin@test.com`.
2. Click the new "Elasticsearch" entry in the admin nav.
3. Confirm cluster card shows status green and at least one node row is rendered.
4. Confirm the "Datasets with Elasticsearch warnings" section is present here and gone from `/admin/errors`.
5. Click Refresh; confirm the timestamp updates.

Report any visual issue back to the user before merging.

- [ ] **Step 4: Stop**

Implementation is complete. Hand back to user for branch finishing (`superpowers:finishing-a-development-branch` covers the merge / PR decision).

---

## Self-review (run after writing the plan)

**1. Spec coverage** — every numbered section of the spec is reflected in tasks:

| Spec | Plan |
|------|------|
| §3 Placement | Task 7 (new page), Task 8 (nav), Task 9 (remove from errors.vue) |
| §4 API shape | Task 4 (orchestrator), Task 6 (route + integration test) |
| §5.1 cluster.* | Task 3 (`mapClusterHealth`), Task 4 (calls) |
| §5.2 nodes[*] | Task 3 (`mapNodes`, `resolveWatermark`), Task 4 (calls + memoized watermarks) |
| §5.3 longTasks | Task 3 (`mapLongTasks`), Task 4 (call) |
| §5.4 unassignedShards | Task 3 (`mapUnassignedShards`), Task 4 (capped allocationExplain) |
| §5.5 indicesSummary | Task 3 (`mapIndicesSummary`), Task 4 (Mongo count + batched lookup) |
| §5.6 datasetsWithEsWarnings | Task 5 (extracted helper) + Task 4 (consumed via safeSection) |
| §6 UI sections 1–7 | Task 7 |
| §7 partial-failure model | Task 3 (`safeSection`), Task 4 (every fetch wrapped) |
| §8 parseIndexName | Task 1 |
| §9 config keys | Task 2 |
| §10 testing (unit + api) | Tasks 1, 3, 6 |

No gaps.

**2. Placeholder scan** — no TBD/TODO. Each code step shows the actual code. The only exception is Task 8 Step 3, which directs the engineer to `grep` for the existing i18n source location — this is intentional because the i18n key for `owners`/`errors`/etc. lives next to the navigation composable in a project-specific way I haven't fully verified. The grep command + the exact YAML to add are spelled out, so the step is still self-contained.

**3. Type consistency** — `parseIndexName(indexName, indicesPrefix)` is used the same way in `commons.js`, the mappers, and the orchestrator. `DatasetRef` is defined once in `elasticsearch-diagnose.ts` and reused. `SectionError` likewise. The response payload field names match between the orchestrator's return statement, the API test assertions, and the UI's destructuring.
