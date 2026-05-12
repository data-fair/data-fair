# Catch-all `_search` field for wide datasets — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** For datasets with many text columns, replace the O(columns) `fields` array in the `q` Elasticsearch query with a constant-size set of internal catch-all fields (`_search`, `_search_boosted`) populated via `copy_to`; degrade gracefully for datasets not yet reindexed; and add a `q_fields` hint to the overload-advice messages.

**Architecture:** A new constant `Q_SEARCH_FIELDS_THRESHOLD = 30` and a helper `hasManyQSearchFields(schema)` live in `api/src/datasets/es/commons.js`. `indexDefinition()` adds `_search`/`_search_boosted` to the ES mapping and `copy_to` references on text columns when the dataset is wide; `updateDatasetMapping()` forces a reindex when a dataset crosses the threshold. The `finalize` worker records the result on `dataset._esCopyToSearch` (a virtual dataset bubbles up `descendants.every(d => d._esCopyToSearch)`); `clean()` strips it from API output. `getFilterableFields()`/`prepareQuery()` pick one of three query regimes from that stored flag (catch-all / reduced-legacy / full-legacy). `queryAdvice()` gains one rule.

**Tech Stack:** Node.js (ESM), Elasticsearch, MongoDB, Playwright test runner (`*.unit.spec.ts` / `*.api.spec.ts`), `memoizee`.

**Spec:** `docs/superpowers/specs/2026-05-12-catch-all-search-field-design.md`

**Run a single test file:** `npx playwright test <path> --project unit` (or `--project api`). Add `-g 'name'` to run one test.

---

### Task 1: `Q_SEARCH_FIELDS_THRESHOLD` constant + `hasManyQSearchFields` helper

**Files:**
- Modify: `api/src/datasets/es/commons.js` (add exports near the top, after the `esProperty` function which ends at line 92)
- Test: `tests/features/datasets/query/q-fields.unit.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/features/datasets/query/q-fields.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { Q_SEARCH_FIELDS_THRESHOLD, hasManyQSearchFields } from '../../../../api/src/datasets/es/commons.js'

const stringFields = (n: number) => Array.from({ length: n }, (_, i) => ({ key: 'f' + i, type: 'string' }))

test.describe('hasManyQSearchFields', () => {
  test('threshold is 30', () => {
    assert.equal(Q_SEARCH_FIELDS_THRESHOLD, 30)
  })
  test('false at or below the threshold, true above it', () => {
    assert.equal(hasManyQSearchFields(stringFields(30)), false)
    assert.equal(hasManyQSearchFields(stringFields(31)), true)
  })
  test('only counts fields that produce a .text / .text_standard inner field', () => {
    // booleans and geo_point produce no text inner fields; _id is ignored
    const schema = [
      ...stringFields(31),
      ...Array.from({ length: 50 }, (_, i) => ({ key: 'b' + i, type: 'boolean' })),
      { key: '_id', type: 'string' }
    ]
    assert.equal(hasManyQSearchFields(schema), true)
    assert.equal(hasManyQSearchFields([...stringFields(20), ...Array.from({ length: 50 }, (_, i) => ({ key: 'b' + i, type: 'boolean' }))]), false)
  })
  test('tolerates a missing schema', () => {
    assert.equal(hasManyQSearchFields(undefined), false)
    assert.equal(hasManyQSearchFields(null), false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/query/q-fields.unit.spec.ts --project unit`
Expected: FAIL — `hasManyQSearchFields`/`Q_SEARCH_FIELDS_THRESHOLD` are not exported.

- [ ] **Step 3: Implement**

In `api/src/datasets/es/commons.js`, immediately after the `esProperty` function (after line 92, before `export const aliasName`), add:

```javascript
// A dataset whose `q` query would otherwise expand into a huge `fields` array (one entry per
// text-bearing column, times the analyzed sub-fields) is considered "wide": its index gets the
// `_search` / `_search_boosted` catch-all fields and its `q` query targets those instead.
// See docs/architecture/load-management.md.
export const Q_SEARCH_FIELDS_THRESHOLD = 30

export const hasManyQSearchFields = (schema) => {
  if (!schema) return false
  let n = 0
  for (const f of schema) {
    if (f.key === '_id') continue
    const esProp = esProperty(f)
    if (esProp && esProp.fields && (esProp.fields.text || esProp.fields.text_standard)) n++
  }
  return n > Q_SEARCH_FIELDS_THRESHOLD
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/datasets/query/q-fields.unit.spec.ts --project unit`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/commons.js tests/features/datasets/query/q-fields.unit.spec.ts
git commit -m "feat(es): hasManyQSearchFields helper + Q_SEARCH_FIELDS_THRESHOLD constant"
```

---

### Task 2: `_esCopyToSearch` on the dataset type, stripped by `clean()`

**Files:**
- Modify: `api/types/dataset/index.ts` (the `DatasetInternal` type, around lines 31-39)
- Modify: `api/src/datasets/utils/index.js` (the `clean()` function, the block of `delete dataset._*` around line 205)

- [ ] **Step 1: Add the field to `DatasetInternal`**

In `api/types/dataset/index.ts`, in the `DatasetInternal` type, add a line alongside the other `_`-prefixed internal props:

```ts
export type DatasetInternal = Dataset & {
  loaded?: { attachments?: boolean, dataset?: Partial<FileDataset['originalFile']> } | null,
  descendants?: string[]
  descendantsFull?: DatasetInternal[]
  initFrom?: (InitFrom & { role: string, department?: string }) | null
  _partialRestStatus?: 'updated' | 'extended' | 'indexed'
  validateDraft?: boolean
  _newRestAttachments?: string[]
  _readApiKey?: { current: string, previous: string }
  // true when this dataset's current index carries the `_search` / `_search_boosted` catch-all
  // fields (set by the finalize worker); for virtual datasets: true iff every descendant has it.
  _esCopyToSearch?: boolean
}
```

- [ ] **Step 2: Strip it in `clean()`**

In `api/src/datasets/utils/index.js`, in `clean()`, next to `delete dataset._newRestAttachments` (around line 205), add:

```javascript
  delete dataset._newRestAttachments
  delete dataset._esCopyToSearch
```

- [ ] **Step 3: Type-check**

Run: `npm run check-types`
Expected: PASS (no new errors).

- [ ] **Step 4: Commit**

```bash
git add api/types/dataset/index.ts api/src/datasets/utils/index.js
git commit -m "feat(datasets): internal _esCopyToSearch flag, stripped by clean()"
```

---

### Task 3: Mapping — `_search` / `_search_boosted` + `copy_to` when wide

**Files:**
- Modify: `api/src/datasets/es/manage-indices.js` (`indexDefinition` lines 11-35; `updateDatasetMapping` lines 56-80; the `import { aliasName, esProperty } from './commons.js'` on line 5)
- Test: `tests/features/datasets/query/index-definition.unit.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/features/datasets/query/index-definition.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { indexDefinition } from '../../../../api/src/datasets/es/manage-indices.js'

const stringField = (key: string, extra: any = {}) => ({ key, type: 'string', ...extra })

test.describe('indexDefinition - catch-all _search field', () => {
  test('narrow dataset: no _search field, no copy_to', async () => {
    const dataset: any = { id: 'narrow', schema: Array.from({ length: 5 }, (_, i) => stringField('f' + i)), extensions: [] }
    const body = await indexDefinition(dataset)
    assert.equal(body.mappings.properties._search, undefined)
    assert.equal(body.mappings.properties._search_boosted, undefined)
    assert.equal(body.mappings.properties.f0.copy_to, undefined)
  })

  test('wide dataset: _search + _search_boosted defined, copy_to on text columns', async () => {
    const schema = [
      ...Array.from({ length: 32 }, (_, i) => stringField('f' + i)),
      stringField('label_col', { 'x-refersTo': 'http://www.w3.org/2000/01/rdf-schema#label' }),
      { key: 'a_bool', type: 'boolean' }
    ]
    const dataset: any = { id: 'wide', schema, extensions: [] }
    const body = await indexDefinition(dataset)
    assert.equal(body.mappings.properties._search.type, 'text')
    assert.equal(body.mappings.properties._search.fields.text_standard.analyzer, 'standard')
    assert.equal(body.mappings.properties._search_boosted.type, 'text')
    assert.equal(body.mappings.properties.f0.copy_to, '_search')
    assert.deepEqual(body.mappings.properties.label_col.copy_to, ['_search', '_search_boosted'])
    // a boolean column has no text inner field -> not copied
    assert.equal(body.mappings.properties.a_bool.copy_to, undefined)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/query/index-definition.unit.spec.ts --project unit`
Expected: FAIL — `_search` undefined / `copy_to` undefined.

- [ ] **Step 3: Implement `indexDefinition`**

In `api/src/datasets/es/manage-indices.js`:

Change the import on line 5 to:

```javascript
import { aliasName, esProperty, hasManyQSearchFields } from './commons.js'
```

Replace the body of `indexDefinition` (lines 11-35) with:

```javascript
const SEARCH_BOOST_REFERS_TO = ['http://www.w3.org/2000/01/rdf-schema#label', 'http://schema.org/description', 'https://schema.org/DefinedTermSet']

const catchAllSearchProperty = (dataset) => ({
  type: 'text',
  analyzer: config.elasticsearch.defaultAnalyzer,
  fields: { text_standard: { type: 'text', analyzer: 'standard' } }
})

export const indexDefinition = async (dataset) => {
  const body = JSON.parse(JSON.stringify(indexBase(dataset)))
  const properties = body.mappings.properties = {}
  const jsProps = await datasetUtils.extendedSchema(null, dataset, false)
  const wide = hasManyQSearchFields(jsProps)
  if (wide) {
    properties._search = catchAllSearchProperty(dataset)
    properties._search_boosted = catchAllSearchProperty(dataset)
  }
  for (const jsProp of jsProps) {
    const esProp = esProperty(jsProp)
    if (esProp) {
      if (wide && esProp.fields && (esProp.fields.text || esProp.fields.text_standard)) {
        esProp.copy_to = SEARCH_BOOST_REFERS_TO.includes(jsProp['x-refersTo']) ? ['_search', '_search_boosted'] : '_search'
      }
      if (jsProp['x-extension'] && dataset.extensions && dataset.extensions.find(e => e.type === 'remoteService' && jsProp['x-extension'] === e.remoteService + '/' + e.action && jsProp.key.startsWith(e.propertyPrefix + '.'))) {
        const extKey = jsProp.key.split('.')[0]
        properties[extKey] = properties[extKey] || { dynamic: 'strict', properties: {} }
        properties[extKey].properties[jsProp.key.replace(extKey + '.', '')] = esProp
      } else {
        properties[jsProp.key] = esProp
      }
    }
    if (jsProp.key === '_geoshape' && jsProp['x-capabilities']?.vtPrepare) {
      properties['_vt_prepared'] = {
        properties: {
          xyz: { type: 'keyword', index: true, doc_values: false },
          pbf: { type: 'binary', store: false, doc_values: false }
        }
      }
    }
  }
  return body
}
```

(`config` is already imported at the top of the file. `catchAllSearchProperty` takes `dataset` for symmetry/future use even though it currently ignores it — keep the parameter so the two call sites read identically; if the linter complains about the unused param, drop it and call `catchAllSearchProperty()`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/datasets/query/index-definition.unit.spec.ts --project unit`
Expected: PASS (2 tests).

- [ ] **Step 5: Add the `updateDatasetMapping` reindex guard**

In `api/src/datasets/es/manage-indices.js`, `updateDatasetMapping` already has an `if (oldDataset) { ... }` block (lines ≈59-73) that computes `const oldMapping = (await indexDefinition(oldDataset)).mappings` and throws when a new inner field was added. Inside that same block, after the existing `for (const key of Object.keys(oldMapping.properties)) { ... }` loop, add:

```javascript
    // crossing the "wide" threshold adds the _search catch-all fields and copy_to references,
    // which only take effect on a full reindex -> force one (same mechanism as the inner-field guard)
    if (newMapping.properties._search && !oldMapping.properties._search) {
      throw new Error('the _search catch-all field is added, simple mapping update will not work')
    }
```

(Reuse the `oldMapping` const already in scope in that block — don't recompute `indexDefinition(oldDataset)`.)

- [ ] **Step 6: Run the index-definition test again + type-check**

Run: `npx playwright test tests/features/datasets/query/index-definition.unit.spec.ts --project unit && npm run check-types`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add api/src/datasets/es/manage-indices.js tests/features/datasets/query/index-definition.unit.spec.ts
git commit -m "feat(es): add _search/_search_boosted catch-all fields to wide-dataset mappings"
```

---

### Task 4: `finalize` worker records `_esCopyToSearch` (with virtual-dataset bubble-up)

**Files:**
- Modify: `api/src/workers/short-processor/finalize.ts` (the `import` block lines 1-20; the `result` setup after `extendedSchema` around line 39; the virtual-dataset block around lines 139-149)

- [ ] **Step 1: Add the import**

In `api/src/workers/short-processor/finalize.ts`, near `import { datasetWarning } from '../../datasets/es/manage-indices.js'` (line 4), add:

```ts
import { hasManyQSearchFields } from '../../datasets/es/commons.js'
```

- [ ] **Step 2: Set the flag for non-virtual datasets**

In `finalize.ts`, just after the line `queryableDataset.schema = result.schema = await datasetUtils.extendedSchema(db, dataset)` (≈ line 39), add:

```ts
  // record whether this dataset's freshly-built index carries the _search catch-all fields
  // (virtual datasets have no index of their own — handled below by bubbling up from descendants)
  result._esCopyToSearch = !isVirtualDataset(dataset) && hasManyQSearchFields(result.schema)
```

- [ ] **Step 3: Bubble up for virtual datasets**

In `finalize.ts`, in the existing `if (isVirtualDataset(dataset)) { ... }` block near line 139, change the `descendants` call to also fetch the flag and override `result._esCopyToSearch`:

```ts
  if (isVirtualDataset(dataset)) {
    const descendants: DatasetInternal[] = await virtualDatasetsUtils.descendants(dataset, ['dataUpdatedAt', 'dataUpdatedBy', '_esCopyToSearch'])
    dataset.descendants = descendants.map(d => d.id)
    const lastDataUpdate = descendants.filter(d => !!d.dataUpdatedAt).sort((d1, d2) => d1.dataUpdatedAt! > d2.dataUpdatedAt! ? 1 : -1).pop()
    if (lastDataUpdate) {
      result.dataUpdatedAt = lastDataUpdate.dataUpdatedAt
      result.dataUpdatedBy = lastDataUpdate.dataUpdatedBy
    }
    result._esCopyToSearch = descendants.length > 0 && descendants.every(d => d._esCopyToSearch === true)
    result.count = dataset.count = await esUtils.count(queryableDataset, {})
  }
```

(The only added pieces are `'_esCopyToSearch'` in the `descendants(...)` args and the `result._esCopyToSearch = ...` line — leave the rest of the block as it is in the file.)

- [ ] **Step 4: Type-check**

Run: `npm run check-types`
Expected: PASS. (If `virtualDatasetsUtils.descendants`'s return type doesn't surface `_esCopyToSearch`, the access is still valid because it returns `DatasetInternal[]` and the field is now declared on `DatasetInternal` from Task 2 — confirm there is no error; if the projection helper types the result more narrowly, cast with `as DatasetInternal[]` exactly as the existing line already does.)

- [ ] **Step 5: Commit**

```bash
git add api/src/workers/short-processor/finalize.ts
git commit -m "feat(datasets): finalize worker records _esCopyToSearch (bubbles up for virtual datasets)"
```

---

### Task 5: Query regimes in `getFilterableFields` / `prepareQuery`

**Files:**
- Modify: `api/src/datasets/es/commons.js` (`getFilterableFields` lines 196-258; `prepareQuery`'s `q` handling block lines 378-427)
- Test: `tests/features/datasets/query/q-fields.unit.spec.ts` (extend the file created in Task 1)

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/datasets/query/q-fields.unit.spec.ts`:

```ts
import { getFilterableFields, prepareQuery } from '../../../../api/src/datasets/es/commons.js'

// getFilterableFields is memoized on `${id}:${finalizedAt}:${!!hasQ}:${qFields}` — give each
// assertion a unique id so cases never collide.
let seq = 0
const fakeDataset = (over: any = {}) => ({ id: 'fd' + (seq++), finalizedAt: '2026-01-01', schema: [], ...over })
const wideSchema = (n = 32) => Array.from({ length: n }, (_, i) => ({ key: 'f' + i, type: 'string' }))

test.describe('getFilterableFields - regimes', () => {
  test('full legacy: narrow dataset lists every per-field variant', () => {
    const ds = fakeDataset({ schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'string' }] })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, false)
    assert.equal(reduced, false)
    assert.deepEqual(qSearchFields, ['a', 'a.text', 'a.text_standard', 'b', 'b.text', 'b.text_standard'])
    assert.deepEqual(qStandardFields, ['a.text_standard', 'b.text_standard'])
  })

  test('catch-all: _esCopyToSearch dataset collapses to the _search fields', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, true)
    assert.equal(reduced, false)
    assert.deepEqual(qSearchFields, ['_search'])
    assert.deepEqual(qStandardFields, ['_search.text_standard'])
  })

  test('reduced: wide dataset not yet reindexed drops .text_standard from qSearchFields but keeps qStandardFields', () => {
    const ds = fakeDataset({ schema: wideSchema(2 + 31), _esCopyToSearch: false })
    // make it actually wide: 33 string fields
    ds.schema = wideSchema(33)
    const { qSearchFields, qStandardFields, copyToSearch, reduced } = getFilterableFields(ds, 'x', undefined)
    assert.equal(copyToSearch, false)
    assert.equal(reduced, true)
    assert.ok(qSearchFields.includes('f0.text'))
    assert.ok(!qSearchFields.some((f: string) => f.endsWith('.text_standard')))
    assert.ok(qStandardFields.includes('f0.text_standard')) // still populated for complete-mode prefix
    assert.ok(!qSearchFields.includes('_search'))
  })

  test('q_fields given on a wide+copyTo dataset still uses the explicit per-field list, not _search', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { qSearchFields, copyToSearch } = getFilterableFields(ds, 'x', ['f3'])
    assert.equal(copyToSearch, false)
    assert.deepEqual(qSearchFields, ['f3', 'f3.text', 'f3.text_standard'])
  })

  test('searchFields (used for the ?qs= query_string) is unchanged in catch-all mode', () => {
    const ds = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const { searchFields } = getFilterableFields(ds, 'x', undefined)
    assert.ok(searchFields.includes('f0.text'))
    assert.ok(!searchFields.includes('_search'))
  })
})

test.describe('prepareQuery - catch-all clauses', () => {
  const baseQuery = { size: '10' }
  test('catch-all dataset: q targets _search and adds a _search_boosted clause', () => {
    const ds: any = fakeDataset({ schema: wideSchema(), _esCopyToSearch: true })
    const esQuery: any = prepareQuery(ds, { ...baseQuery, q: 'hello' })
    const shoulds = esQuery.query.bool.must.flatMap((m: any) => m.bool?.should ?? [])
    const sqs = shoulds.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['_search'])))
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['_search.text_standard'])))
    assert.ok(sqs.some((f: string[]) => JSON.stringify(f) === JSON.stringify(['_search_boosted^3', '_search_boosted.text_standard^3'])))
  })

  test('legacy narrow dataset: q targets per-field list, no _search_boosted', () => {
    const ds: any = fakeDataset({ schema: [{ key: 'a', type: 'string' }] })
    const esQuery: any = prepareQuery(ds, { ...baseQuery, q: 'hello' })
    const shoulds = esQuery.query.bool.must.flatMap((m: any) => m.bool?.should ?? [])
    const fieldsLists = shoulds.filter((s: any) => s.simple_query_string).map((s: any) => s.simple_query_string.fields)
    assert.ok(fieldsLists.some((f: string[]) => f.includes('a.text')))
    assert.ok(!JSON.stringify(fieldsLists).includes('_search'))
  })
})
```

(If `prepareQuery`'s exact result shape differs — e.g. `must` lives at `esQuery.query.bool.must` vs elsewhere — adjust the navigation in the test to match; read the end of `prepareQuery` in `commons.js` to confirm where `must`/`should` end up. The behavioural assertions, `fields` arrays, stay the same.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/datasets/query/q-fields.unit.spec.ts --project unit`
Expected: FAIL — `copyToSearch`/`reduced` not returned; no `_search` collapsing.

- [ ] **Step 3: Implement `getFilterableFields`**

In `api/src/datasets/es/commons.js`, replace `getFilterableFields` (lines 196-258) with:

```javascript
export const getFilterableFields = memoize((dataset, hasQ, qFields) => {
  const searchFields = []
  const wildcardFields = []
  const qSearchFields = []
  const qStandardFields = []
  const qWildcardFields = []
  const esFields = []

  // pick the `q` regime (only when no explicit q_fields was requested)
  const copyToSearch = !!hasQ && !qFields && dataset._esCopyToSearch === true
  const reduced = !!hasQ && !qFields && !copyToSearch && hasManyQSearchFields(dataset.schema)

  for (const f of dataset.schema) {
    const capabilities = f['x-capabilities'] || []
    if (capabilities.index !== false) esFields.push(f.key)
    if (capabilities.text !== false) esFields.push(f.key + '.text')
    if (capabilities.textStandard !== false) esFields.push(f.key + '.text_standard')
    if (capabilities.insensitive !== false) esFields.push(f.key + '.keyword_insensitive')
    if (capabilities.wildcard) esFields.push(f.key + '.wildcard')

    if (f.key === '_id') {
      searchFields.push('_id')
      continue
    }

    const isQField = hasQ && f.key !== '_id' && (!qFields || qFields.includes(f.key))
    const perField = isQField && !copyToSearch // in catch-all mode, qSearchFields/qStandardFields don't list per-field entries
    const esProp = esProperty(f)
    if (esProp.index !== false && esProp.enabled !== false && esProp.type === 'keyword') {
      searchFields.push(f.key)
      if (perField) qSearchFields.push(f.key)
    }
    if (esProp.fields && (esProp.fields.text || esProp.fields.text_standard)) {
      // automatic boost of some special properties well suited for full-text search
      let suffix = ''
      if (f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label') suffix = '^3'
      if (f['x-refersTo'] === 'http://schema.org/description') suffix = '^2'
      if (f['x-refersTo'] === 'https://schema.org/DefinedTermSet') suffix = '^2'

      if (esProp.fields.text) {
        searchFields.push(f.key + '.text' + suffix)
        if (perField) qSearchFields.push(f.key + '.text' + suffix)
      }
      if (esProp.fields.text_standard) {
        searchFields.push(f.key + '.text_standard' + suffix)
        if (perField) {
          // reduced mode: omit .text_standard from the main qSearchFields array (halves it),
          // but keep it in qStandardFields so q_mode=complete's "startsWith" prefix query still works
          if (!reduced) qSearchFields.push(f.key + '.text_standard' + suffix)
          qStandardFields.push(f.key + '.text_standard' + suffix)
        }
      }
      if (esProp.fields.wildcard) {
        wildcardFields.push(f.key + '.wildcard')
        if (isQField) qWildcardFields.push(f.key + '.wildcard')
      }
    }
  }

  if (copyToSearch) {
    qSearchFields.push('_search')
    qStandardFields.push('_search.text_standard')
  }

  return { searchFields, wildcardFields, qSearchFields, qStandardFields, qWildcardFields, esFields, copyToSearch, reduced }
}, {
  profileName: 'getFilterableFields',
  primitive: true,
  normalizer: ([dataset, hasQ, qFields]) => {
    return `${dataset.id}:${dataset.finalizedAt}:${!!hasQ}:${qFields ? qFields.join(',') : ''}`
  },
  max: 10000,
  maxAge: 1000 * 60 * 60, // 1 hour
})
```

- [ ] **Step 4: Implement `prepareQuery` clause changes**

In `api/src/datasets/es/commons.js`, in `prepareQuery`, the block currently at lines 378-427. Replace from `if (q || query.qs) {` through the matching `}` (the one right before the `// pre-build schema lookup maps` comment) with:

```javascript
  if (q || query.qs) {
    const { searchFields, qSearchFields, qStandardFields, qWildcardFields, esFields, copyToSearch, reduced } = getFilterableFields(dataset, q, qFields)
    if (query.qs) {
      if (!ignoreInvalidQS) checkQuery(query.qs, dataset.schema, esFields)
      const qs = { query_string: { query: query.qs, fields: searchFields } }
      if (qsAsFilter) filter.push(qs)
      else must.push(qs)
    }
    if (q) {
      const qBool = { bool: { should: [], minimum_should_match: 1 } }
      const qShould = qBool.bool.should
      // extra clause that boosts matches in semantically-important columns (label/description/...)
      // when the dataset uses the catch-all _search fields (replaces the old per-field ^3/^2 boosts)
      const pushBoosted = () => {
        if (copyToSearch) qShould.push({ simple_query_string: { query: q, fields: ['_search_boosted^3', '_search_boosted.text_standard^3'], ...sqsOptions } })
      }
      if (query.q_mode === 'complete') {
      // "complete" mode, we try to accomodate for most cases and give the most intuitive results
      // to a search query where the user might be using a autocomplete type control

        // if the user didn't define wildcards himself, we use wildcard to create a "startsWith" functionality
        // this is performed on the innerfield that uses standard analysis, as language stemming doesn't work well in this case
        // we also perform a contains filter if some wildcard functionnality is activate
        if (!q.includes('*') && !q.includes('?')) {
          if (qStandardFields.length) {
            qShould.push({ simple_query_string: { query: `${q}*`, fields: qStandardFields, ...sqsOptions } })
          }
          if (qWildcardFields.length) {
            qShould.push({ query_string: { query: `*${q}*`, fields: qWildcardFields, ...sqsOptions } })
          }
        }
        // if the user submitted a multi word query and didn't use quotes
        // we add some quotes to boost results with sequence of words
        if (qSearchFields.length && q.includes(' ') && !q.includes('"')) {
          qShould.push({ simple_query_string: { query: `"${q}"`, fields: qSearchFields, ...sqsOptions } })
        }
        if (qSearchFields.length) {
          qShould.push({ simple_query_string: { query: q, fields: qSearchFields, ...sqsOptions } })
        }
        pushBoosted()
      } else {
        // default "simple" mode uses ES simple query string directly
        // only tuning is that we match both on stemmed and raw inner fields to boost exact matches
        if (qSearchFields.length) {
          qShould.push({ simple_query_string: { query: q, fields: qSearchFields, ...sqsOptions } })
        }
        // in "reduced" mode we already dropped .text_standard from qSearchFields and skip this clause
        // (qStandardFields is still populated but only meant for the complete-mode prefix query)
        if (qStandardFields.length && !reduced) {
          qShould.push({ simple_query_string: { query: q, fields: qStandardFields, ...sqsOptions } })
        }
        pushBoosted()
      }
      must.push(qBool)
    }
  }
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx playwright test tests/features/datasets/query/q-fields.unit.spec.ts --project unit`
Expected: PASS (all cases). If a `prepareQuery` navigation assertion fails because the result shape differs from the test's assumption, fix the *test's* navigation (not the implementation) to match `commons.js`, then re-run.

- [ ] **Step 6: Run the existing search test suite to catch regressions**

Run: `npx playwright test tests/features/datasets/query --project api`
Expected: PASS (no regressions). If anything fails, investigate before continuing.

- [ ] **Step 7: Commit**

```bash
git add api/src/datasets/es/commons.js tests/features/datasets/query/q-fields.unit.spec.ts
git commit -m "feat(es): route q through _search catch-all (catch-all / reduced / full regimes)"
```

---

### Task 6: `queryAdvice` — suggest `q_fields` on wide datasets

**Files:**
- Modify: `api/src/misc/utils/query-advice.ts`
- Modify: `api/i18n/messages/en.json` (the `errors` object, after `queryAdviceSelect` on line 21)
- Modify: `api/i18n/messages/fr.json` (the `errors` object, after `queryAdviceSelect` on line 21)
- Test: `tests/features/infra/query-advice.unit.spec.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/features/infra/query-advice.unit.spec.ts` (inside the `test.describe('queryAdvice', ...)` block):

```ts
  test('qFields rule: fires on a wide dataset searched with q and no q_fields', () => {
    const wide = { schema: Array.from({ length: 31 }, (_, i) => ({ key: 'f' + i, type: 'string' })) }
    const narrow = { schema: Array.from({ length: 5 }, (_, i) => ({ key: 'f' + i, type: 'string' })) }
    assert.match(queryAdvice(fakeReq('/abc/lines', { q: 'x' }, wide)), /errors\.queryAdviceQFields/)
    assert.match(queryAdvice(fakeReq('/abc/lines', { _c_q: 'x' }, wide)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x', q_fields: 'f1,f2' }, wide)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', {}, wide)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x' }, narrow)), /errors\.queryAdviceQFields/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { q: 'x' })), /errors\.queryAdviceQFields/)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts --project unit`
Expected: FAIL — `errors.queryAdviceQFields` never appears.

- [ ] **Step 3: Implement**

In `api/src/misc/utils/query-advice.ts`, add the import at the top (after the existing `import { type Request } from 'express'`):

```ts
import { hasManyQSearchFields } from '../../datasets/es/commons.js'
```

Then, in `queryAdvice`, after rule 5 (`errors.queryAdviceSelect`) and before `if (keys.length === 0) return ''`, add:

```ts
  // 6. wide dataset full-text-searched without restricting the searched columns
  if ((q.q || q._c_q) && !q.q_fields && hasManyQSearchFields(req.dataset?.schema)) keys.push('errors.queryAdviceQFields')
```

In `api/i18n/messages/en.json`, after the `"queryAdviceSelect": ...,` line, add:

```json
		"queryAdviceQFields": "restrict full-text search to the relevant columns with q_fields=col1,col2 instead of searching every column",
```

In `api/i18n/messages/fr.json`, after the `"queryAdviceSelect": ...,` line, add:

```json
		"queryAdviceQFields": "restreignez la recherche plein texte aux colonnes pertinentes avec q_fields=col1,col2 plutôt que de rechercher dans toutes les colonnes",
```

(Watch the trailing comma: `queryAdviceSelect` is currently the last key in the `errors` object — it has no trailing comma — so add one to it when you insert the new key after it. JSON syntax must stay valid.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts --project unit`
Expected: PASS (all `queryAdvice` tests).

- [ ] **Step 5: Lint + type-check**

Run: `npm run lint && npm run check-types`
Expected: PASS (no new errors/warnings from these files).

- [ ] **Step 6: Commit**

```bash
git add api/src/misc/utils/query-advice.ts api/i18n/messages/en.json api/i18n/messages/fr.json tests/features/infra/query-advice.unit.spec.ts
git commit -m "feat(api): overload advice suggests q_fields on wide datasets"
```

---

### Task 7: End-to-end API test on a wide dataset

**Files:**
- Create: `tests/resources/datasets/wide-dataset.csv`
- Create: `tests/features/datasets/query/search-wide.api.spec.ts`

- [ ] **Step 1: Create the test CSV fixture**

Create `tests/resources/datasets/wide-dataset.csv` with 33 columns. Make `col0` carry an `rdfs:label`-able value, give one row a clearly distinctive token, and give one cell a value longer than 200 characters (to exercise the `ignore_above` × `copy_to` risk). Exact content:

```csv
col0,col1,col2,col3,col4,col5,col6,col7,col8,col9,col10,col11,col12,col13,col14,col15,col16,col17,col18,col19,col20,col21,col22,col23,col24,col25,col26,col27,col28,col29,col30,col31,col32
Acme Corporation,alpha,beta,gamma,delta,epsilon,zeta,eta,theta,iota,kappa,lambda,mu,nu,xi,omicron,pi,rho,sigma,tau,upsilon,phi,chi,psi,omega,aaa,bbb,ccc,ddd,eee,fff,ggg,hhh
Globex Industries,one,two,three,four,five,six,seven,eight,nine,ten,eleven,twelve,thirteen,fourteen,fifteen,sixteen,seventeen,eighteen,nineteen,twenty,xyzzy-unique-token,bee,cee,dee,ee,ff,gg,hh,ii,jj,kk,ll
Initech LLC,lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat,p2,p3,p4,p5,p6,p7,p8,p9,p10,p11,p12,p13,p14,p15,p16,p17,p18,p19,p20,p21,p22,p23,p24,p25,p26,p27,p28,p29,p30,p31,p32
```

- [ ] **Step 2: Write the test**

Create `tests/features/datasets/query/search-wide.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('search - wide dataset (_search catch-all)', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('a 33-column dataset gets the _search catch-all field and q works through it', async () => {
    const ax = testUser1
    let dataset = await sendDataset('datasets/wide-dataset.csv', ax)

    // index mapping carries the catch-all fields
    const diagnose = (await ax.get(`/api/v1/datasets/${dataset.id}/_diagnose`)).data
    const aliasedIndex = diagnose.esInfos.index ?? diagnose.esInfos.indices[0]
    const props = aliasedIndex.definition.mappings.properties
    assert.ok(props._search, 'index should have a _search field')
    assert.ok(props._search_boosted, 'index should have a _search_boosted field')
    assert.equal(props.col1.copy_to, '_search')

    // q matches a value in an arbitrary column
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'xyzzy-unique-token' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col0, 'Globex Industries')

    // q matches a token inside a >200-char cell (the ignore_above x copy_to verification)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'exercitation' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col0, 'Initech LLC')

    // mark col0 as a label column and re-finalize — the index is rebuilt with col0 copying into
    // _search_boosted as well; the catch-all path still returns correct results afterwards
    dataset.schema.find((f: any) => f.key === 'col0')['x-refersTo'] = 'http://www.w3.org/2000/01/rdf-schema#label'
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: dataset.schema })
    dataset = await waitForFinalize(ax, dataset.id)
    const diagnose2 = (await ax.get(`/api/v1/datasets/${dataset.id}/_diagnose`)).data
    const props2 = (diagnose2.esInfos.index ?? diagnose2.esInfos.indices[0]).definition.mappings.properties
    assert.deepEqual(props2.col0.copy_to, ['_search', '_search_boosted'])
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'Globex' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].col0, 'Globex Industries')
  })

  test('q_fields still restricts to the named columns on a wide dataset', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/wide-dataset.csv', ax)
    // 'xyzzy-unique-token' lives in col21; searching it scoped to col0 must return nothing
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'xyzzy-unique-token', q_fields: 'col0' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { q: 'xyzzy-unique-token', q_fields: 'col21' } })
    assert.equal(res.data.total, 1)
  })
})
```

(Notes for the implementer: (1) `sendDataset` returns the finalized dataset object — `dataset.schema` is the extended schema; find the `col0` entry by `key`. (2) If `GET /_diagnose` returns 403 for `test_user1`, switch the diagnose request to an admin client — check `tests/support/axios.ts` for an admin/superadmin helper and use it just for that call; the rest stays as `test_user1`. (3) If the `_diagnose` JSON shape for `esInfos.index` / `esInfos.indices` differs, adapt the navigation to find the index referenced by the alias — `datasetInfos` in `api/src/datasets/es/manage-indices.js` builds it, read that to confirm. (4) The boosting assertion above is intentionally conservative — it only asserts the row is found; if you want a real ranking assertion, edit the CSV so the probe word appears in `col0` of one row *and* a non-label column of another, then assert `results[0]` is the label row when sorting by `_score` (which `q` does implicitly).)

- [ ] **Step 3: Run the test**

Run: `npx playwright test tests/features/datasets/query/search-wide.api.spec.ts --project api`
Expected: PASS. If the `>200-char` search (`exercitation`) returns 0, that is the `ignore_above` × `copy_to` risk materializing — STOP and revisit (see the spec's "Top implementation risks": the fallback is a different mapping shape for wide datasets' text columns; do not paper over it).

- [ ] **Step 4: Commit**

```bash
git add tests/resources/datasets/wide-dataset.csv tests/features/datasets/query/search-wide.api.spec.ts
git commit -m "test: end-to-end coverage for the _search catch-all on a wide dataset"
```

---

### Task 8: Documentation

**Files:**
- Modify: `docs/architecture/load-management.md`

- [ ] **Step 1: Update the doc**

In `docs/architecture/load-management.md`, find the section that lists the `queryAdvice` rules and add a bullet for the new one:

> - **`q_fields` on wide datasets** — when a dataset has more than `Q_SEARCH_FIELDS_THRESHOLD` (30) text-bearing columns and a request uses `q` (or `_c_q`) without `q_fields`, the advice suggests restricting the searched columns.

Then add a new subsection (near the Elasticsearch query-controls part):

> ### The `_search` catch-all field on wide datasets
>
> A `q` search is compiled into one or more Elasticsearch `simple_query_string` clauses whose `fields` array normally has roughly one entry per text column (times the analyzed sub-fields). On datasets with many columns this array reaches hundreds of entries, which is expensive for Elasticsearch to parse and execute.
>
> When a dataset has more than `Q_SEARCH_FIELDS_THRESHOLD` (30) text-bearing columns (`hasManyQSearchFields` in `api/src/datasets/es/commons.js`), its index gets two extra internal fields, `_search` and `_search_boosted` (`indexDefinition` in `api/src/datasets/es/manage-indices.js`), and every text column gets a `copy_to` into `_search` (columns annotated with `rdfs:label` / `schema.org/description` / `DefinedTermSet` also copy into `_search_boosted`). A `q` query against such a dataset (when `q_fields` is not given) then targets just `_search` / `_search.text_standard`, plus a boosting clause on `_search_boosted`.
>
> Existing datasets are **not** reindexed eagerly. The boolean `dataset._esCopyToSearch` (set by the `finalize` worker; for virtual datasets it is `true` iff every descendant has it) records whether the dataset's current index actually carries `_search`. The query layer keys off this flag: `true` → use `_search`; otherwise, if the dataset is wide but not yet reindexed, a "reduced" path is used that drops the `.text_standard` sub-fields from the main query (still O(columns), but roughly half the array) while keeping them available for `q_mode=complete`'s prefix matching. A wide dataset picks up `_search` automatically the next time a schema change triggers a full reindex (`updateDatasetMapping` forces one when the dataset crosses the threshold).

(Match the exact heading levels and prose style of the surrounding doc; the wording above is a guide, not a literal paste.)

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/load-management.md
git commit -m "docs: document the _search catch-all field and the q_fields advice rule"
```

---

### Task 9: Full verification

- [ ] **Step 1: Lint + types**

Run: `npm run lint && npm run check-types`
Expected: PASS (no new errors; pre-existing UI lint warnings unrelated to this change are acceptable).

- [ ] **Step 2: Run the touched test areas**

Run: `npx playwright test tests/features/datasets/query tests/features/infra/query-advice.unit.spec.ts --project unit --project api`
Expected: PASS.

- [ ] **Step 3: Run the broader dataset/search suite for regressions**

Run: `npm run test-api`  (or, if too slow in this session, at least `npx playwright test tests/features/datasets --project api`)
Expected: PASS. The full suite also runs on push via the husky hook.

- [ ] **Step 4: Hand back to the user**

Report: tests run + results, the `ignore_above` × `copy_to` verification outcome (Task 7 step 3), and any deviation from the plan. Do not claim completion without the verification output (superpowers:verification-before-completion).

---

## Notes carried over from the spec / decisions made while planning

- **Flag is written in `finalize`, not `index-lines`** — one place, runs after every finalize, and `result.schema` there is already the extended schema that the index was built from, so the flag and the mapping agree. `indexDefinition` makes the same `hasManyQSearchFields(extendedSchema)` decision independently; both use the helper from Task 1.
- **`searchFields` (the `?qs=` structured-query field list) is never routed through `_search`** — only `qSearchFields` / `qStandardFields` (the `?q=` lists) change. Users reference real columns in `qs`, and `_search` is never in the schema.
- **`qWildcardFields` (`q_mode=complete` "contains" search) is left per-field in all regimes** — the `wildcard` ES type can't fold into a `text` field; it only exists for columns that opt into the `wildcard` capability, so the array is small anyway.
- **`_esCopyToSearch` is `DatasetInternal`-only (not in `api/types/dataset/schema.js`)** — same pattern as `_readApiKey` / `_partialRestStatus`: stored on the mongo doc, never in the public schema, stripped by `clean()`.
- **Open risk #1 (`ignore_above` × `copy_to`)** is exercised by Task 7 step 3 (the `exercitation` search inside a >200-char cell). If it fails, the design's fallback (different mapping shape for wide datasets' text columns — not simply removing `ignore_above`, which reopens the Lucene term-length exposure) must be designed before proceeding.
- **Open risk #2 (virtual re-finalization)** is satisfied by the existing `finalize.ts` block (`for await (const virtualDataset of mongo.datasets.find({ 'virtual.children': dataset.id })) ...`) which re-finalizes parent virtual datasets when a child changes, recursively up the chain.
