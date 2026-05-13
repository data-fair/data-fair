# Enriched Elasticsearch Diagnose Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the dataset `_diagnose` endpoint with structured warnings (segment count, deleted-doc ratio, shard size, mapping limit, missing `_search` on wide datasets, replica drift, orphan indices) and surface them in a superadmin-only "Diagnose" section on the dataset page. Spec: `docs/superpowers/specs/2026-05-13-diagnose-es-design.md`.

**Architecture:** A new pure module `api/src/datasets/es/diagnose-warnings.ts` computes a `Warning[]` from `(dataset, esInfos, config)`. Finalize-time call sites use a subset of those warnings to set the legacy single-string `dataset.esWarning` field (additive enum widening, no migration). The `_diagnose` HTTP route returns the full realtime list. A new Vue component `dataset-diagnose.vue` renders the response in a new section of the dataset page, gated by `user.adminMode`.

**Tech Stack:** Node 22, Express, `@elastic/elasticsearch` client, Vue 3 + Vuetify, TypeScript, Playwright (test runner for unit + API + e2e), `@data-fair/lib-vue/fetch.js` (`useFetch`).

---

## Task 1: Add `elasticsearch.diagnose` config block

**Files:**
- Modify: `api/config/default.cjs:49-64`
- Modify: `api/config/type/schema.json:163-182`

- [ ] **Step 1: Add the new config block to defaults**

In `api/config/default.cjs`, inside the `elasticsearch:` object, add after the `acceptYellowStatus` line:

```js
  elasticsearch: {
    host: 'localhost:9200',
    auth: null,
    nodes: null,
    options: {},
    ca: null,
    defaultAnalyzer: 'custom_french',
    maxBulkLines: 2000,
    maxBulkChars: 200000,
    maxShardSize: 10000000000, // 10go
    nbReplicas: 1,
    maxPageSize: 10000,
    singleLineOpRefresh: 'wait_for',
    searchTimeout: '45s',
    acceptYellowStatus: false,
    diagnose: {
      segmentsPerShardWarn: 30,
      deletedRatioWarn: 0.2,
      mappingFieldsLimitWarn: 0.8,
      minShardSize: 1000000000 // 1go
    }
  },
```

- [ ] **Step 2: Extend the config JSON schema**

In `api/config/type/schema.json`, modify the `elasticsearch` block:

1. Add `"diagnose"` to the `required` array on line 165.
2. After `"acceptYellowStatus": { "type": "boolean" }` (line 180), add:

```json
        "acceptYellowStatus": { "type": "boolean" },
        "diagnose": {
          "type": "object",
          "required": ["segmentsPerShardWarn", "deletedRatioWarn", "mappingFieldsLimitWarn", "minShardSize"],
          "properties": {
            "segmentsPerShardWarn": { "type": "number" },
            "deletedRatioWarn": { "type": "number" },
            "mappingFieldsLimitWarn": { "type": "number" },
            "minShardSize": { "type": "number" }
          }
        }
```

- [ ] **Step 3: Regenerate config types**

Run: `npm run build-types`

Expected: regenerates `api/config/type/.type/index.d.ts` and `validate.js` with the new `diagnose` property. The command exits with code 0.

- [ ] **Step 4: Run type check**

Run: `npm run check-types`

Expected: PASS — no new errors. (The new property is referenced only in code added later; this check confirms the schema regeneration was clean.)

- [ ] **Step 5: Commit**

```bash
git add api/config/default.cjs api/config/type/schema.json api/config/type/.type/
git commit -m "feat(config): add elasticsearch.diagnose thresholds block"
```

---

## Task 2: Scaffold `diagnose-warnings.ts` module

**Files:**
- Create: `api/src/datasets/es/diagnose-warnings.ts`
- Create: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

The module exports types, an empty-input smoke pathway, and the priority constant used later by `pickPrimaryCode`. Later tasks fill in each warning code in TDD style.

- [ ] **Step 1: Write the failing smoke test**

Create `tests/features/datasets/diagnose-warnings.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import {
  computeFinalizeWarnings,
  computeRealtimeWarnings,
  pickPrimaryCode,
  WARNING_PRIORITY
} from '../../../api/src/datasets/es/diagnose-warnings.ts'

const baseEsConfig = {
  nbReplicas: 1,
  maxShardSize: 10_000_000_000,
  diagnose: {
    segmentsPerShardWarn: 30,
    deletedRatioWarn: 0.2,
    mappingFieldsLimitWarn: 0.8,
    minShardSize: 1_000_000_000
  }
}

test.describe('diagnose-warnings', () => {
  test('virtual / meta-only dataset short-circuits to empty', () => {
    assert.deepEqual(computeFinalizeWarnings({ isVirtual: true } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeRealtimeWarnings({ isVirtual: true } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeFinalizeWarnings({ isMetaOnly: true } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeRealtimeWarnings({ isMetaOnly: true } as any, {}, baseEsConfig), [])
  })

  test('empty esInfos returns no warnings', () => {
    assert.deepEqual(computeFinalizeWarnings({ schema: [] } as any, {}, baseEsConfig), [])
    assert.deepEqual(computeRealtimeWarnings({ schema: [] } as any, {}, baseEsConfig), [])
  })

  test('WARNING_PRIORITY contains every code', () => {
    const codes = [
      'MissingIndex', 'IndexHealthRed', 'MissingIndexSettings', 'ShardingRecommended',
      'MissingSearchOnWide', 'MappingNearLimit', 'ReplicaDrift',
      'HighSegmentCount', 'LargeDeletedDocsRatio', 'ShardSizeOutOfBand', 'OrphanIndices'
    ]
    for (const code of codes) assert.ok(WARNING_PRIORITY.includes(code as any), `missing priority for ${code}`)
  })

  test('pickPrimaryCode returns null on empty array', () => {
    assert.equal(pickPrimaryCode([]), null)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: FAIL with "Cannot find module …/diagnose-warnings.ts".

- [ ] **Step 3: Create the module skeleton**

Create `api/src/datasets/es/diagnose-warnings.ts`:

```ts
// Pure functions only. No es client / mongo / node-config imports here.
// Inputs: a dataset object, the esInfos snapshot returned by manage-indices.datasetInfos(),
// and the relevant elasticsearch config subtree. Outputs: a Warning[].

export type WarningSeverity = 'info' | 'warning' | 'error'

export type WarningCode =
  | 'MissingIndex'
  | 'IndexHealthRed'
  | 'MissingIndexSettings'
  | 'ShardingRecommended'
  | 'MissingSearchOnWide'
  | 'MappingNearLimit'
  | 'ReplicaDrift'
  | 'HighSegmentCount'
  | 'LargeDeletedDocsRatio'
  | 'ShardSizeOutOfBand'
  | 'OrphanIndices'

export interface Warning {
  code: WarningCode
  severity: WarningSeverity
  message: string
  details?: Record<string, unknown>
}

export interface DiagnoseThresholds {
  segmentsPerShardWarn: number
  deletedRatioWarn: number
  mappingFieldsLimitWarn: number
  minShardSize: number
}

export interface DiagnoseConfig {
  nbReplicas: number
  maxShardSize: number
  diagnose: DiagnoseThresholds
}

// Highest-priority code first. Used by pickPrimaryCode and also drives the order
// in which the rich list of warnings is returned to the caller.
export const WARNING_PRIORITY: readonly WarningCode[] = [
  'MissingIndex',
  'IndexHealthRed',
  'MissingIndexSettings',
  'ShardingRecommended',
  'MissingSearchOnWide',
  'MappingNearLimit',
  'ReplicaDrift',
  'HighSegmentCount',
  'LargeDeletedDocsRatio',
  'ShardSizeOutOfBand',
  'OrphanIndices'
] as const

const skipDataset = (dataset: any): boolean => {
  if (!dataset) return true
  if (dataset.isVirtual || dataset.isMetaOnly) return true
  return false
}

const sortByPriority = (warnings: Warning[]): Warning[] => {
  return [...warnings].sort((a, b) =>
    WARNING_PRIORITY.indexOf(a.code) - WARNING_PRIORITY.indexOf(b.code)
  )
}

export const computeFinalizeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  // individual checks plug in here in later tasks
  const warnings: Warning[] = []
  return sortByPriority(warnings)
}

export const computeRealtimeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  const warnings: Warning[] = []
  return sortByPriority(warnings)
}

export const pickPrimaryCode = (warnings: Warning[]): WarningCode | null => {
  if (warnings.length === 0) return null
  return sortByPriority(warnings)[0].code
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: 4 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): scaffold diagnose-warnings pure module"
```

---

## Task 3: Port the four existing finalize-time warnings

These four codes are already implemented in `manage-indices.datasetWarning()`. They move into the new module with one test each. Severity choice for existing codes preserves the current behaviour (priority-only).

**Files:**
- Modify: `api/src/datasets/es/diagnose-warnings.ts`
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

- [ ] **Step 1: Write the four failing tests**

Append to `diagnose-warnings.unit.spec.ts`:

```ts
test.describe('existing finalize-time codes', () => {
  const wideDataset = (extra: any = {}) => ({
    schema: [{ key: 'a', type: 'string' }],
    storage: { indexed: { size: 1_000_000 } },
    ...extra
  })

  test('MissingIndex fires when esInfos.index is missing', () => {
    const w = computeFinalizeWarnings(wideDataset(), { indices: [] }, baseEsConfig)
    assert.equal(w.length, 1)
    assert.equal(w[0].code, 'MissingIndex')
    assert.equal(w[0].severity, 'error')
  })

  test('IndexHealthRed fires when index.health === "red"', () => {
    const esInfos = {
      indices: [],
      index: {
        health: 'red',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } }
      }
    }
    const w = computeFinalizeWarnings(wideDataset(), esInfos, baseEsConfig)
    assert.ok(w.find(x => x.code === 'IndexHealthRed' && x.severity === 'error'))
  })

  test('MissingIndexSettings fires when settings.index.number_of_shards is missing', () => {
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { settings: { index: {} }, mappings: { properties: {} } } }
    }
    const w = computeFinalizeWarnings(wideDataset(), esInfos, baseEsConfig)
    assert.ok(w.find(x => x.code === 'MissingIndexSettings' && x.severity === 'error'))
  })

  test('ShardingRecommended fires when current shard count != recommended', () => {
    // recommended = ceil(50go / maxShardSize=10go) = 5 ; current = 1 -> mismatch
    const esInfos = {
      indices: [],
      index: {
        health: 'green',
        definition: {
          settings: { index: { number_of_shards: '1', number_of_replicas: '1' } },
          mappings: { properties: {} }
        }
      }
    }
    const dataset = wideDataset({ storage: { indexed: { size: 50_000_000_000 } } })
    const w = computeFinalizeWarnings(dataset, esInfos, baseEsConfig)
    const sr = w.find(x => x.code === 'ShardingRecommended')
    assert.ok(sr)
    assert.equal(sr!.severity, 'warning')
    assert.equal(sr!.details!.currentNbShards, 1)
    assert.equal(sr!.details!.recommendedNbShards, 5)
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: the four new tests FAIL (`w.length` is 0).

- [ ] **Step 3: Implement the four checks**

In `api/src/datasets/es/diagnose-warnings.ts`, replace both `computeFinalizeWarnings` and `computeRealtimeWarnings` bodies (keep the guards) with a shared internal helper. Add the helper above the public functions:

```ts
const getRecommendedNbShards = (dataset: any, maxShardSize: number): number => {
  return Math.max(1, Math.ceil((dataset.storage?.indexed?.size || 0) / maxShardSize))
}

const finalizeChecks = (dataset: any, esInfos: any, config: DiagnoseConfig): Warning[] => {
  const warnings: Warning[] = []

  if (!esInfos.index) {
    warnings.push({
      code: 'MissingIndex',
      severity: 'error',
      message: 'no Elasticsearch index found for this dataset'
    })
    return warnings
  }

  if (esInfos.index.health === 'red') {
    warnings.push({
      code: 'IndexHealthRed',
      severity: 'error',
      message: 'index health is red'
    })
  }

  const indexSettings = esInfos.index.definition?.settings?.index
  if (!indexSettings?.number_of_shards) {
    warnings.push({
      code: 'MissingIndexSettings',
      severity: 'error',
      message: 'index settings (number_of_shards) are missing'
    })
    return warnings
  }

  const currentNbShards = Number(indexSettings.number_of_shards)
  const recommendedNbShards = getRecommendedNbShards(dataset, config.maxShardSize)
  if (currentNbShards !== recommendedNbShards) {
    warnings.push({
      code: 'ShardingRecommended',
      severity: 'warning',
      message: `current shard count ${currentNbShards} differs from recommended ${recommendedNbShards}`,
      details: { currentNbShards, recommendedNbShards }
    })
  }

  return warnings
}
```

Then replace the public function bodies:

```ts
export const computeFinalizeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  return sortByPriority(finalizeChecks(dataset, esInfos, config))
}

export const computeRealtimeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  const warnings = finalizeChecks(dataset, esInfos, config)
  // realtime-only checks plug in here in later tasks
  return sortByPriority(warnings)
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): port existing finalize-time warnings to pure module"
```

---

## Task 4: `MissingSearchOnWide` check

A dataset whose schema has many text columns (`hasManyQSearchFields`) but whose mapping lacks the `_search` catch-all field — indicates an index that pre-dates the perf commit and has not been reindexed.

**Files:**
- Modify: `api/src/datasets/es/diagnose-warnings.ts`
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `diagnose-warnings.unit.spec.ts`:

```ts
test.describe('MissingSearchOnWide', () => {
  // hasManyQSearchFields counts analyzed inner sub-fields (.text + .text_standard);
  // each plain string column contributes 2 inner fields. Threshold is 30 -> need ≥ 16 columns.
  const wideSchema = Array.from({ length: 20 }, (_, i) => ({ key: `c${i}`, type: 'string' }))
  const baseDataset = { schema: wideSchema, storage: { indexed: { size: 1_000_000 } } }
  const goodSettings = { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } } }

  test('fires when wide dataset mapping lacks _search', () => {
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { ...goodSettings, mappings: { properties: { c0: {} } } } }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'MissingSearchOnWide')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
  })

  test('does not fire when _search is present', () => {
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { ...goodSettings, mappings: { properties: { c0: {}, _search: { type: 'text' } } } } }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'MissingSearchOnWide'), undefined)
  })

  test('does not fire when schema is narrow', () => {
    const narrow = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
    const esInfos = {
      indices: [],
      index: { health: 'green', definition: { ...goodSettings, mappings: { properties: { a: {} } } } }
    }
    const w = computeFinalizeWarnings(narrow, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'MissingSearchOnWide'), undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: the first new test FAILS (warning not produced).

- [ ] **Step 3: Implement the check**

In `api/src/datasets/es/diagnose-warnings.ts`, at the top add:

```ts
import { hasManyQSearchFields } from './operations.ts'
```

In `finalizeChecks`, after the `ShardingRecommended` block (before `return warnings`), add:

```ts
  const properties = esInfos.index.definition?.mappings?.properties ?? {}
  if (hasManyQSearchFields(dataset.schema) && !properties._search) {
    warnings.push({
      code: 'MissingSearchOnWide',
      severity: 'warning',
      message: 'wide dataset is missing the _search catch-all field; reindex to apply the optimization'
    })
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): add MissingSearchOnWide warning"
```

---

## Task 5: `MappingNearLimit` check

Fires when the index's mapped field count exceeds `mappingFieldsLimitWarn × mapping.total_fields.limit`.

**Files:**
- Modify: `api/src/datasets/es/diagnose-warnings.ts`
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test.describe('MappingNearLimit', () => {
  const settings = { index: { number_of_shards: '1', number_of_replicas: '1', 'mapping.total_fields.limit': 100 } }
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }

  test('fires above threshold', () => {
    const properties: Record<string, any> = {}
    for (let i = 0; i < 85; i++) properties[`f${i}`] = {}
    const esInfos = { indices: [], index: { health: 'green', definition: { settings, mappings: { properties } } } }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'MappingNearLimit')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
    assert.equal(item!.details!.fields, 85)
    assert.equal(item!.details!.limit, 100)
  })

  test('does not fire below threshold', () => {
    const properties: Record<string, any> = {}
    for (let i = 0; i < 50; i++) properties[`f${i}`] = {}
    const esInfos = { indices: [], index: { health: 'green', definition: { settings, mappings: { properties } } } }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'MappingNearLimit'), undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: first new test FAILS.

- [ ] **Step 3: Implement**

In `finalizeChecks`, after the `MissingSearchOnWide` block:

```ts
  const limit = Number(indexSettings['mapping.total_fields.limit'] ?? 1000)
  const fields = Object.keys(properties).length
  if (fields / limit > config.diagnose.mappingFieldsLimitWarn) {
    warnings.push({
      code: 'MappingNearLimit',
      severity: 'warning',
      message: `${fields} mapped fields exceeds ${Math.round(config.diagnose.mappingFieldsLimitWarn * 100)}% of the limit (${limit})`,
      details: { fields, limit }
    })
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): add MappingNearLimit warning"
```

---

## Task 6: `ReplicaDrift` check

Fires when `number_of_replicas` on the index differs from `config.elasticsearch.nbReplicas`.

**Files:**
- Modify: `api/src/datasets/es/diagnose-warnings.ts`
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test.describe('ReplicaDrift', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }

  test('fires when replicas differ from config', () => {
    const esInfos = {
      indices: [],
      index: {
        health: 'green',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '0' } }, mappings: { properties: {} } }
      }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig) // config nbReplicas=1
    const item = w.find(x => x.code === 'ReplicaDrift')
    assert.ok(item)
    assert.equal(item!.severity, 'info')
    assert.equal(item!.details!.current, 0)
    assert.equal(item!.details!.expected, 1)
  })

  test('does not fire when replicas match', () => {
    const esInfos = {
      indices: [],
      index: {
        health: 'green',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } }
      }
    }
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'ReplicaDrift'), undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: first new test FAILS.

- [ ] **Step 3: Implement**

In `finalizeChecks`, after the `MappingNearLimit` block:

```ts
  const currentReplicas = Number(indexSettings.number_of_replicas)
  if (!Number.isNaN(currentReplicas) && currentReplicas !== config.nbReplicas) {
    warnings.push({
      code: 'ReplicaDrift',
      severity: 'info',
      message: `index has ${currentReplicas} replicas but config expects ${config.nbReplicas}`,
      details: { current: currentReplicas, expected: config.nbReplicas }
    })
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): add ReplicaDrift warning"
```

---

## Task 7: `HighSegmentCount` realtime check

Fires when total `segmentsCount / number_of_shards > segmentsPerShardWarn` from the `cat indices` row carried by `esInfos.index`.

**Files:**
- Modify: `api/src/datasets/es/diagnose-warnings.ts`
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

The `cat indices` JSON output uses string fields like `"segments.count"`, `"docs.count"`, `"docs.deleted"`, `"pri.store.size"`, `"store.size"`. The values come back as strings — coerce with `Number()`. See `https://www.elastic.co/guide/en/elasticsearch/reference/current/cat-indices.html`.

- [ ] **Step 1: Write the failing test**

```ts
test.describe('HighSegmentCount', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
  const goodIndex = (extra: any) => ({
    indices: [],
    index: {
      health: 'green',
      definition: { settings: { index: { number_of_shards: '2', number_of_replicas: '1' } }, mappings: { properties: {} } },
      ...extra
    }
  })

  test('fires when segments per shard exceeds threshold', () => {
    const esInfos = goodIndex({ 'segments.count': '100' }) // 100 / 2 = 50 > 30
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'HighSegmentCount')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
    assert.equal(item!.details!.segmentsPerShard, 50)
  })

  test('does not fire in finalize-time evaluator', () => {
    const esInfos = goodIndex({ 'segments.count': '100' })
    const w = computeFinalizeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'HighSegmentCount'), undefined)
  })

  test('does not fire when segments per shard is below threshold', () => {
    const esInfos = goodIndex({ 'segments.count': '10' }) // 10 / 2 = 5 < 30
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'HighSegmentCount'), undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: first new test FAILS.

- [ ] **Step 3: Implement**

Add a `realtimeChecks` helper in `diagnose-warnings.ts` above the public functions:

```ts
const realtimeChecks = (dataset: any, esInfos: any, config: DiagnoseConfig): Warning[] => {
  const warnings: Warning[] = []
  if (!esInfos.index) return warnings
  const indexSettings = esInfos.index.definition?.settings?.index
  if (!indexSettings?.number_of_shards) return warnings
  const nbShards = Number(indexSettings.number_of_shards)

  const segments = Number(esInfos.index['segments.count'])
  if (!Number.isNaN(segments) && nbShards > 0) {
    const segmentsPerShard = segments / nbShards
    if (segmentsPerShard > config.diagnose.segmentsPerShardWarn) {
      warnings.push({
        code: 'HighSegmentCount',
        severity: 'warning',
        message: `${segmentsPerShard.toFixed(1)} segments per shard exceeds threshold ${config.diagnose.segmentsPerShardWarn}; a force_merge may help`,
        details: { segmentsPerShard, segments, nbShards }
      })
    }
  }

  return warnings
}
```

Update `computeRealtimeWarnings`:

```ts
export const computeRealtimeWarnings = (
  dataset: any,
  esInfos: any,
  config: DiagnoseConfig
): Warning[] => {
  if (skipDataset(dataset)) return []
  if (!esInfos || Object.keys(esInfos).length === 0) return []
  return sortByPriority([
    ...finalizeChecks(dataset, esInfos, config),
    ...realtimeChecks(dataset, esInfos, config)
  ])
}
```

- [ ] **Step 4: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): add HighSegmentCount realtime warning"
```

---

## Task 8: `LargeDeletedDocsRatio` realtime check

Fires when `docs.deleted / (docs.count + docs.deleted) > deletedRatioWarn` AND total docs > 1000 (avoid false positives on tiny indices).

**Files:**
- Modify: `api/src/datasets/es/diagnose-warnings.ts`
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test.describe('LargeDeletedDocsRatio', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
  const idx = (extra: any) => ({
    indices: [],
    index: {
      health: 'green',
      definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } },
      ...extra
    }
  })

  test('fires when deleted ratio exceeds threshold and total > 1000', () => {
    const esInfos = idx({ 'docs.count': '6000', 'docs.deleted': '4000' }) // ratio 0.4 > 0.2
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'LargeDeletedDocsRatio')
    assert.ok(item)
    assert.equal(item!.severity, 'warning')
    assert.equal(item!.details!.ratio.toFixed(2), '0.40')
  })

  test('does not fire when total docs <= 1000', () => {
    const esInfos = idx({ 'docs.count': '500', 'docs.deleted': '400' })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'LargeDeletedDocsRatio'), undefined)
  })

  test('does not fire when ratio below threshold', () => {
    const esInfos = idx({ 'docs.count': '9000', 'docs.deleted': '500' })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'LargeDeletedDocsRatio'), undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: first new test FAILS.

- [ ] **Step 3: Implement**

In `realtimeChecks`, after the segments block (before `return warnings`):

```ts
  const docsCount = Number(esInfos.index['docs.count'])
  const docsDeleted = Number(esInfos.index['docs.deleted'])
  if (!Number.isNaN(docsCount) && !Number.isNaN(docsDeleted)) {
    const total = docsCount + docsDeleted
    if (total > 1000) {
      const ratio = docsDeleted / total
      if (ratio > config.diagnose.deletedRatioWarn) {
        warnings.push({
          code: 'LargeDeletedDocsRatio',
          severity: 'warning',
          message: `${(ratio * 100).toFixed(1)}% of documents are deleted; consider reindexing to reclaim space`,
          details: { ratio, docsCount, docsDeleted }
        })
      }
    }
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): add LargeDeletedDocsRatio realtime warning"
```

---

## Task 9: `ShardSizeOutOfBand` realtime check

Live measured average shard size from `store.size_in_bytes` (under `definition.settings`? no — it lives in `cat indices`' `store.size`/`pri.store.size`, but we have the full `indices.get` definition too). To keep it simple we use the `cat indices` field `store.size` returned as `'1.2gb'` style, which is hard to parse. Instead, use `pri.store.size` only if numeric — fall back to skipping the check. The cleanest source is the `bytes=b` modifier on `cat indices`; that returns numeric bytes.

The current `datasetInfos()` call already uses `cat.indices({ index: ..., format: 'json' })` *without* `bytes=b`, so the values come back human-formatted (`"1.2gb"`). Update `datasetInfos()` in Task 12 to pass `bytes: 'b'`. For this task we model the warning against numeric bytes.

- [ ] **Step 1: Write the failing test**

```ts
test.describe('ShardSizeOutOfBand', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }
  const idx = (extra: any) => ({
    indices: [],
    index: {
      health: 'green',
      definition: { settings: { index: { number_of_shards: '2', number_of_replicas: '1' } }, mappings: { properties: {} } },
      ...extra
    }
  })

  test('fires when avg shard size above maxShardSize', () => {
    // 30gb / 2 shards = 15gb > 10gb maxShardSize
    const esInfos = idx({ 'pri.store.size': String(30 * 1_000_000_000) })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'ShardSizeOutOfBand')
    assert.ok(item)
    assert.equal(item!.details!.avgShardSize, 15 * 1_000_000_000)
  })

  test('fires when avg shard size below minShardSize', () => {
    // 100mb / 2 = 50mb < 1gb minShardSize, but only if total docs > 0 (already implied)
    const esInfos = idx({ 'pri.store.size': String(100_000_000), 'docs.count': '500' })
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'ShardSizeOutOfBand')
    assert.ok(item)
  })

  test('does not fire when in band', () => {
    const esInfos = idx({ 'pri.store.size': String(3 * 1_000_000_000) }) // 3gb / 2 = 1.5gb, within [1gb, 10gb]
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'ShardSizeOutOfBand'), undefined)
  })

  test('skips check when only 1 shard and below min (single-shard small datasets are fine)', () => {
    const oneShard = idx({
      'pri.store.size': String(100_000_000)
    })
    oneShard.index.definition.settings.index.number_of_shards = '1'
    const w = computeRealtimeWarnings(baseDataset, oneShard, baseEsConfig)
    assert.equal(w.find(x => x.code === 'ShardSizeOutOfBand'), undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: tests FAIL.

- [ ] **Step 3: Implement**

In `realtimeChecks`, after the deleted-docs block:

```ts
  const priBytes = Number(esInfos.index['pri.store.size'])
  if (!Number.isNaN(priBytes) && nbShards > 1) {
    const avgShardSize = priBytes / nbShards
    if (avgShardSize > config.maxShardSize) {
      warnings.push({
        code: 'ShardSizeOutOfBand',
        severity: 'warning',
        message: `average shard size ${avgShardSize.toFixed(0)} bytes exceeds maxShardSize ${config.maxShardSize}`,
        details: { avgShardSize, maxShardSize: config.maxShardSize, nbShards }
      })
    } else if (avgShardSize < config.diagnose.minShardSize) {
      warnings.push({
        code: 'ShardSizeOutOfBand',
        severity: 'warning',
        message: `average shard size ${avgShardSize.toFixed(0)} bytes is below minShardSize ${config.diagnose.minShardSize}`,
        details: { avgShardSize, minShardSize: config.diagnose.minShardSize, nbShards }
      })
    }
  }
```

(The `nbShards > 1` guard handles the "single-shard tiny dataset is fine" case — `ShardingRecommended` already covers that case at finalize time.)

- [ ] **Step 4: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): add ShardSizeOutOfBand realtime warning"
```

---

## Task 10: `OrphanIndices` realtime check

Fires when `esInfos.indices` (the `cat indices` list filtered by `indexPrefix(dataset)-*`) contains more than one entry — only the aliased one should remain after `clearAliases`.

**Files:**
- Modify: `api/src/datasets/es/diagnose-warnings.ts`
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

```ts
test.describe('OrphanIndices', () => {
  const baseDataset = { schema: [{ key: 'a', type: 'string' }], storage: { indexed: { size: 1_000_000 } } }

  test('fires when more than one index for this dataset', () => {
    const esInfos = {
      indices: [
        { index: 'dataset-test-abc-123' },
        { index: 'dataset-test-abc-456' },
        { index: 'dataset-test-abc-789' }
      ],
      index: {
        index: 'dataset-test-abc-789',
        health: 'green',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } }
      }
    }
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    const item = w.find(x => x.code === 'OrphanIndices')
    assert.ok(item)
    assert.equal(item!.severity, 'info')
    assert.deepEqual(item!.details!.orphans, ['dataset-test-abc-123', 'dataset-test-abc-456'])
  })

  test('does not fire when only the aliased index exists', () => {
    const esInfos = {
      indices: [{ index: 'dataset-test-abc-789' }],
      index: {
        index: 'dataset-test-abc-789',
        health: 'green',
        definition: { settings: { index: { number_of_shards: '1', number_of_replicas: '1' } }, mappings: { properties: {} } }
      }
    }
    const w = computeRealtimeWarnings(baseDataset, esInfos, baseEsConfig)
    assert.equal(w.find(x => x.code === 'OrphanIndices'), undefined)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: first new test FAILS.

- [ ] **Step 3: Implement**

In `realtimeChecks`, after the `ShardSizeOutOfBand` block:

```ts
  const allIndices: any[] = esInfos.indices ?? []
  if (allIndices.length > 1) {
    const aliasedName = esInfos.index?.index
    const orphans = allIndices.map(i => i.index).filter(name => name !== aliasedName)
    warnings.push({
      code: 'OrphanIndices',
      severity: 'info',
      message: `${orphans.length} orphan index(es) for this dataset; leftover from failed reindex`,
      details: { orphans }
    })
  }
```

- [ ] **Step 4: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/diagnose-warnings.ts tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "feat(diagnose): add OrphanIndices realtime warning"
```

---

## Task 11: `pickPrimaryCode` priority test

The priority sort is already in place via `sortByPriority`. This task only adds the explicit test that locks down the ordering (one test that builds an array of all 11 warnings in random order and asserts the primary code).

**Files:**
- Modify: `tests/features/datasets/diagnose-warnings.unit.spec.ts`

- [ ] **Step 1: Write the failing test**

Append to `diagnose-warnings.unit.spec.ts`:

```ts
test.describe('pickPrimaryCode', () => {
  test('returns the highest-priority code regardless of input order', () => {
    const ws: any[] = [
      { code: 'OrphanIndices', severity: 'info', message: '' },
      { code: 'MissingIndex', severity: 'error', message: '' },
      { code: 'HighSegmentCount', severity: 'warning', message: '' }
    ]
    assert.equal(pickPrimaryCode(ws), 'MissingIndex')
  })

  test('returns null on empty', () => {
    assert.equal(pickPrimaryCode([]), null)
  })

  test('ordering: ShardingRecommended beats HighSegmentCount', () => {
    const ws: any[] = [
      { code: 'HighSegmentCount', severity: 'warning', message: '' },
      { code: 'ShardingRecommended', severity: 'warning', message: '' }
    ]
    assert.equal(pickPrimaryCode(ws), 'ShardingRecommended')
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts`

Expected: all tests PASS (priority sort is already implemented).

- [ ] **Step 3: Commit**

```bash
git add tests/features/datasets/diagnose-warnings.unit.spec.ts
git commit -m "test(diagnose): lock down pickPrimaryCode ordering"
```

---

## Task 12: Refactor `datasetWarning` + extend `esWarning.enum` + update `datasetInfos`

Three coupled changes: `datasetWarning()` delegates to the new module; `datasetInfos()` switches to `bytes: 'b'` so `cat indices` returns numeric bytes for the realtime checks; the `esWarning` enum is widened.

**Files:**
- Modify: `api/src/datasets/es/manage-indices.js`
- Modify: `api/types/dataset/schema.js:824-827`

- [ ] **Step 1: Replace `datasetWarning` body**

In `api/src/datasets/es/manage-indices.js`, replace the existing `datasetWarning` function (lines 287-299) with:

```js
export const datasetWarning = async (dataset) => {
  if (dataset.isVirtual || dataset.isMetaOnly || dataset.status === 'draft' || dataset.status === 'error') return null
  const esInfos = await datasetInfos(dataset)
  return pickPrimaryCode(computeFinalizeWarnings(dataset, esInfos, config.elasticsearch))
}
```

At the top of the file, add the import:

```js
import { computeFinalizeWarnings, pickPrimaryCode } from './diagnose-warnings.ts'
```

- [ ] **Step 2: Switch `datasetInfos` to numeric bytes**

In `manage-indices.js`, update the `cat.indices` call inside `datasetInfos` (around line 271):

```js
  const indices = await es.client.cat.indices({ index: `${indexPrefix(dataset)}-*`, format: 'json', bytes: 'b' })
```

(`bytes: 'b'` makes `pri.store.size` / `store.size` return raw byte counts as strings — `Number()` already coerces them in `diagnose-warnings.ts`.)

- [ ] **Step 3: Extend the schema enum**

In `api/types/dataset/schema.js:826`, replace the `enum` line:

```js
  esWarning: {
    type: ['string', 'null'],
    enum: [
      'MissingIndex', 'IndexHealthRed', 'MissingIndexSettings', 'ShardingRecommended',
      'MissingSearchOnWide', 'MappingNearLimit', 'ReplicaDrift'
    ]
  },
```

- [ ] **Step 4: Regenerate dataset types**

Run: `npm run build-types`

Expected: regenerates `api/types/dataset/.type/index.d.ts` and related files. Check that the `esWarning` union now includes the three new codes.

- [ ] **Step 5: Run type check + lint**

Run: `npm run check-types && npm run lint`

Expected: PASS — no new errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/es/manage-indices.js api/types/dataset/schema.js api/types/dataset/.type/
git commit -m "feat(es): datasetWarning uses pure module; esWarning enum widened; cat indices uses bytes=b"
```

---

## Task 13: Extend `_diagnose` route + amend search-wide test + contract docs

**Files:**
- Modify: `api/src/datasets/router.js:1500-1510`
- Modify: `api/contract/dataset-private-api-docs.ts:649-666`
- Modify: `tests/features/datasets/query/search-wide.api.spec.ts`

- [ ] **Step 1: Add `warnings` to the route response**

In `api/src/datasets/router.js`, replace the `_diagnose` route body (lines 1501-1510):

```js
router.get('/:datasetId/_diagnose', readDataset({ fillDescendants: true, acceptInitialDraft: true, noCache: true }), cacheHeaders.noCache, async (req, res) => {
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

Add the import near the other `manage-indices` imports at the top of the file:

```js
import { computeRealtimeWarnings } from '../datasets/es/diagnose-warnings.ts'
```

- [ ] **Step 2: Update the existing `search-wide.api.spec.ts` to assert `warnings`**

In `tests/features/datasets/query/search-wide.api.spec.ts`, after the existing `props` assertions (around line 28), add:

```ts
    // diagnose now returns a structured warnings array; the wide dataset must NOT have MissingSearchOnWide
    assert.ok(Array.isArray(diagnose.warnings), 'diagnose response must include a warnings array')
    assert.equal(diagnose.warnings.find((w: any) => w.code === 'MissingSearchOnWide'), undefined,
      'wide dataset with _search field should not flag MissingSearchOnWide')
```

- [ ] **Step 3: Tighten the API docs contract**

In `api/contract/dataset-private-api-docs.ts`, replace the `_diagnose` response schema (around lines 657-660):

```ts
      '/_diagnose': {
        get: {
          summary: 'Lire les informations techniques',
          description: 'Récupérer des informations techniques pour aider au diagnostic.',
          tags: ['Administration'],
          operationId: 'diagnose',
          'x-permissionClass': 'superadmin',
          responses: {
            200: {
              description: 'Informations techniques de diagnostic.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      filesInfos: { type: 'array' },
                      esInfos: { type: 'object' },
                      locks: { type: 'array' },
                      warnings: {
                        type: 'array',
                        items: {
                          type: 'object',
                          required: ['code', 'severity', 'message'],
                          properties: {
                            code: { type: 'string' },
                            severity: { type: 'string', enum: ['info', 'warning', 'error'] },
                            message: { type: 'string' },
                            details: { type: 'object' }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            ...readErrorResponses
          }
        }
      },
```

- [ ] **Step 4: Run the search-wide test**

Run: `npx playwright test --project api tests/features/datasets/query/search-wide.api.spec.ts`

Expected: PASS — the `warnings` array is returned and `MissingSearchOnWide` is absent.

- [ ] **Step 5: Lint**

Run: `npm run lint`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/router.js api/contract/dataset-private-api-docs.ts tests/features/datasets/query/search-wide.api.spec.ts
git commit -m "feat(api): _diagnose returns realtime warnings array"
```

---

## Task 14: New API integration test for `LargeDeletedDocsRatio`

Boots a REST dataset, inserts >1000 docs, deletes >20% of them, calls `_diagnose`, and asserts the warning surfaces.

**Files:**
- Create: `tests/features/datasets/diagnose-realtime.api.spec.ts`

- [ ] **Step 1: Write the test**

Create the file:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { waitForFinalize } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const adminUser = await axiosAuth('test_superadmin@test.com', undefined, true)

test.describe('_diagnose realtime warnings', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('LargeDeletedDocsRatio: REST dataset with >20% deleted docs flags the warning', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/restdel-diag', {
      isRest: true,
      title: 'restdel-diag',
      schema: [{ key: 'attr1', type: 'string' }]
    })

    // bulk insert 1500 lines so the >1000 minimum is exceeded
    const lines = Array.from({ length: 1500 }, (_, i) => ({ _id: `line${i}`, attr1: `value${i}` }))
    await ax.post('/api/v1/datasets/restdel-diag/_bulk_lines', lines)
    await waitForFinalize(ax, 'restdel-diag')

    // delete 600 lines (40% > 20% threshold)
    const deletes = Array.from({ length: 600 }, (_, i) => ({ _id: `line${i}`, _action: 'delete' }))
    await ax.post('/api/v1/datasets/restdel-diag/_bulk_lines', deletes)
    await waitForFinalize(ax, 'restdel-diag')

    const diagnose = (await adminUser.get('/api/v1/datasets/restdel-diag/_diagnose')).data
    assert.ok(Array.isArray(diagnose.warnings))
    const w = diagnose.warnings.find((x: any) => x.code === 'LargeDeletedDocsRatio')
    assert.ok(w, `expected LargeDeletedDocsRatio in ${JSON.stringify(diagnose.warnings.map((x: any) => x.code))}`)
    assert.equal(w.severity, 'warning')
    assert.ok(w.details.ratio > 0.2)
  })
})
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test --project api tests/features/datasets/diagnose-realtime.api.spec.ts`

Expected: PASS. If the dev API/ES/mongo are not running, the test will error early — `bash dev/status.sh` shows their state.

- [ ] **Step 3: Commit**

```bash
git add tests/features/datasets/diagnose-realtime.api.spec.ts
git commit -m "test(diagnose): API test for LargeDeletedDocsRatio on REST dataset"
```

---

## Task 15: Create `dataset-diagnose.vue` component

**Files:**
- Create: `ui/src/components/dataset/dataset-diagnose.vue`

- [ ] **Step 1: Create the component**

Create `ui/src/components/dataset/dataset-diagnose.vue`:

```vue
<template>
  <div class="px-4 pt-4">
    <div class="d-flex align-center mb-4">
      <div class="text-body-medium text-medium-emphasis">
        {{ t('subtitle') }}
      </div>
      <v-spacer />
      <v-btn
        :prepend-icon="mdiRefresh"
        :loading="diagnoseFetch.loading.value"
        size="small"
        variant="text"
        @click="diagnoseFetch.refresh()"
      >
        {{ t('refresh') }}
      </v-btn>
    </div>

    <!-- Warnings list -->
    <div v-if="data">
      <v-alert
        v-if="!data.warnings || data.warnings.length === 0"
        type="success"
        variant="tonal"
        class="mb-4"
        :text="t('noIssues')"
      />
      <v-alert
        v-for="w in data.warnings"
        :key="w.code"
        :type="alertType(w.severity)"
        variant="tonal"
        class="mb-3"
      >
        <div class="text-body-1 font-weight-bold">
          {{ t('warning.' + w.code) }}
        </div>
        <div class="text-body-medium">
          {{ w.message }}
        </div>
        <dl
          v-if="w.details"
          class="mt-2 text-caption"
        >
          <template
            v-for="(v, k) in w.details"
            :key="k"
          >
            <dt class="d-inline font-weight-medium">{{ k }}:</dt>
            <dd class="d-inline ml-1 mr-3">{{ formatDetail(k, v) }}</dd>
          </template>
        </dl>
      </v-alert>

      <!-- Summary -->
      <v-card
        v-if="data.esInfos?.index"
        variant="flat"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1">{{ t('summary') }}</v-card-title>
        <v-card-text>
          <v-row
            dense
            class="text-body-medium"
          >
            <v-col
              v-for="row in summaryRows"
              :key="row.key"
              cols="6"
              md="4"
            >
              <span class="text-medium-emphasis">{{ row.label }}:</span>
              <span class="ml-1">{{ row.value }}</span>
            </v-col>
          </v-row>
        </v-card-text>
      </v-card>

      <!-- Locks -->
      <v-card
        variant="flat"
        class="mb-4"
      >
        <v-card-title class="text-subtitle-1">{{ t('locks') }}</v-card-title>
        <v-card-text>
          <div
            v-if="!data.locks || data.locks.every((l: any) => !l)"
            class="text-medium-emphasis"
          >
            {{ t('locksFree') }}
          </div>
          <ul v-else>
            <li
              v-for="(l, i) in data.locks"
              :key="i"
            >
              <code v-if="l">{{ l._id }} — pid {{ l.pid }}, expires {{ l.expiresAt }}</code>
              <code
                v-else
                class="text-medium-emphasis"
              >free</code>
            </li>
          </ul>
        </v-card-text>
      </v-card>

      <!-- Raw JSON -->
      <v-expansion-panels variant="accordion">
        <v-expansion-panel :title="t('rawJson') + ' — esInfos'">
          <template #text>
            <pre class="text-caption">{{ JSON.stringify(data.esInfos, null, 2) }}</pre>
          </template>
        </v-expansion-panel>
        <v-expansion-panel :title="t('rawJson') + ' — filesInfos'">
          <template #text>
            <pre class="text-caption">{{ JSON.stringify(data.filesInfos, null, 2) }}</pre>
          </template>
        </v-expansion-panel>
        <v-expansion-panel :title="t('rawJson') + ' — locks'">
          <template #text>
            <pre class="text-caption">{{ JSON.stringify(data.locks, null, 2) }}</pre>
          </template>
        </v-expansion-panel>
      </v-expansion-panels>
    </div>

    <v-progress-circular
      v-else-if="diagnoseFetch.loading.value"
      indeterminate
      color="admin"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  subtitle: Informations techniques pour les administrateurs (calculées à la demande).
  refresh: Rafraîchir
  noIssues: Aucun problème détecté
  summary: Résumé
  locks: Verrous
  locksFree: Aucun verrou actif
  rawJson: JSON brut
  warning:
    MissingIndex: Index Elasticsearch manquant
    IndexHealthRed: Index en statut rouge
    MissingIndexSettings: Paramètres d'index manquants
    ShardingRecommended: Sharding à ajuster
    MissingSearchOnWide: Champ _search manquant (dataset large)
    MappingNearLimit: Nombre de champs proche de la limite
    ReplicaDrift: Nombre de réplicas non aligné avec la configuration
    HighSegmentCount: Trop de segments par shard
    LargeDeletedDocsRatio: Ratio élevé de documents supprimés
    ShardSizeOutOfBand: Taille de shard hors plage
    OrphanIndices: Index orphelins pour ce dataset
en:
  subtitle: Technical information for superadmins (computed on demand).
  refresh: Refresh
  noIssues: No issues detected
  summary: Summary
  locks: Locks
  locksFree: No active locks
  rawJson: Raw JSON
  warning:
    MissingIndex: Elasticsearch index missing
    IndexHealthRed: Index health is red
    MissingIndexSettings: Index settings missing
    ShardingRecommended: Sharding recommended
    MissingSearchOnWide: Missing _search field on wide dataset
    MappingNearLimit: Mapped fields near the limit
    ReplicaDrift: Replica count diverges from config
    HighSegmentCount: High segment count per shard
    LargeDeletedDocsRatio: Large deleted-docs ratio
    ShardSizeOutOfBand: Shard size out of band
    OrphanIndices: Orphan indices for this dataset
</i18n>

<script setup lang="ts">
import { mdiRefresh } from '@mdi/js'
import useDatasetStore from '~/composables/dataset/dataset-store'

const { t } = useI18n()
const { id } = useDatasetStore()

type DiagnoseResponse = {
  filesInfos: any[]
  esInfos: any
  locks: any[]
  warnings: { code: string, severity: 'info' | 'warning' | 'error', message: string, details?: Record<string, unknown> }[]
}

const diagnoseFetch = useFetch<DiagnoseResponse>(`${$apiPath}/datasets/${id}/_diagnose`)
const data = computed(() => diagnoseFetch.data.value)

const alertType = (severity: string) => {
  if (severity === 'error') return 'error'
  if (severity === 'warning') return 'warning'
  return 'info'
}

const summaryRows = computed(() => {
  const idx = data.value?.esInfos?.index
  if (!idx) return []
  const settings = idx.definition?.settings?.index ?? {}
  return [
    { key: 'alias', label: 'alias', value: data.value!.esInfos?.aliasName },
    { key: 'index', label: 'index', value: idx.index },
    { key: 'health', label: 'health', value: idx.health },
    { key: 'docs', label: 'docs.count', value: idx['docs.count'] },
    { key: 'deleted', label: 'docs.deleted', value: idx['docs.deleted'] },
    { key: 'storeSize', label: 'pri.store.size', value: formatBytes(Number(idx['pri.store.size']) || 0) },
    { key: 'shards', label: 'number_of_shards', value: settings.number_of_shards },
    { key: 'replicas', label: 'number_of_replicas', value: settings.number_of_replicas },
    { key: 'segments', label: 'segments.count', value: idx['segments.count'] }
  ]
})

const formatDetail = (key: string | number, value: unknown): string => {
  const k = String(key)
  if (typeof value === 'number') {
    if (k.toLowerCase().includes('size')) return formatBytes(value)
    if (k.toLowerCase().includes('ratio')) return (value * 100).toFixed(1) + '%'
    return Math.round(value * 100) / 100 + ''
  }
  if (Array.isArray(value)) return value.join(', ')
  return String(value)
}
</script>
```

- [ ] **Step 2: Run UI type check**

Run: `npm -w ui run check-types`

Expected: PASS — no new errors.

- [ ] **Step 3: Run UI lint**

Run: `npm -w ui run lint`

Expected: PASS — no new errors. (The pre-existing `dataset-status.vue` warnings are unrelated.)

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/dataset/dataset-diagnose.vue
git commit -m "feat(ui): add dataset-diagnose component"
```

---

## Task 16: Wire the Diagnose section into the dataset page

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`

- [ ] **Step 1: Add session/user readout to the script**

In `ui/src/pages/dataset/[id]/index.vue`, after the existing `const { accountRole } = useSessionAuthenticated()` line (line 644), add:

```ts
const session = useSession()
const adminMode = computed(() => session.state.user?.adminMode === true)
```

- [ ] **Step 2: Register the diagnose section in `sections`**

In the same file, inside the `computedDeepDiff(() => { ... })` block (around line 1027, right after the `activity` section is registered and before the `dangerZone` section), add:

```ts
  // Diagnose section (superadmin only)
  if (adminMode.value) {
    result.diagnose = { title: t('diagnose'), tabs: [] }
  }
```

- [ ] **Step 3: Add i18n keys**

In the `<i18n>` block of the same file, add `diagnose:` keys in both `fr` and `en` blocks. Search for the line containing `dangerZone: Zone de danger` (around line 543) and add right above it:

```yaml
  diagnose: Diagnostic
```

And in the `en` block (around line 596), above `dangerZone: Danger Zone`:

```yaml
  diagnose: Diagnose
```

- [ ] **Step 4: Add the template section**

In the template, just above the existing `<!-- Danger zone section -->` (around line 328), insert:

```vue
    <!-- Diagnose section (superadmin only) -->
    <df-section-tabs
      v-if="sections.diagnose"
      id="diagnose"
      :svg="dataMaintenanceSvg"
      svg-no-margin
      color="admin"
      :title="sections.diagnose.title"
    >
      <template #content>
        <dataset-diagnose />
      </template>
    </df-section-tabs>
```

- [ ] **Step 5: Add the SVG import**

In the `<script setup>` block, after the other SVG imports (around line 619), add:

```ts
import dataMaintenanceSvg from '~/assets/svg/Data maintenance_Two Color.svg?raw'
```

- [ ] **Step 6: Run UI type check + lint**

Run: `npm -w ui run check-types && npm -w ui run lint`

Expected: PASS — no new errors.

- [ ] **Step 7: Manual verification in the browser**

Per the AGENTS.md guidance — never start dev servers, but verify that what is running renders correctly:

1. Run `bash dev/status.sh` to confirm dev-ui and dev-api are up.
2. Open the dataset page as `test_superadmin@test.com` with adminMode enabled. The "Diagnose" section appears between Activity and Danger zone, with the admin color band, "No issues detected" alert (or warnings if the dataset has any), a summary card, a locks card, and a collapsed raw-JSON panel.
3. Open the same page as a non-superadmin (e.g. `test_user1@test.com`). The Diagnose section is absent.

If the dev environment is not running or this manual check cannot be done, note that explicitly in the commit message rather than claiming success.

- [ ] **Step 8: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue
git commit -m "feat(ui): add superadmin Diagnose section to dataset page"
```

---

## Task 17: Final verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full unit + targeted API tests**

Run:

```bash
npx playwright test --project unit tests/features/datasets/diagnose-warnings.unit.spec.ts
npx playwright test --project api tests/features/datasets/diagnose-realtime.api.spec.ts tests/features/datasets/query/search-wide.api.spec.ts
```

Expected: all PASS.

- [ ] **Step 2: Lint + type check the whole repo**

Run:

```bash
npm run lint && npm run check-types
```

Expected: PASS (the pre-existing `dataset-status.vue` warnings are unrelated and pre-date this branch).

- [ ] **Step 3: Push & open PR**

Only if the user explicitly requests it. Per AGENTS.md, do not push or open PRs without explicit instruction.
