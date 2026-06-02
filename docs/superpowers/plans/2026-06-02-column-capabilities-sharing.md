# Column Capabilities: Single Source of Truth + Leaner Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Centralize the column-capability → query-operation mapping into one declarative table consumed by OpenAPI docs and self-orienting API errors, so the data-exploration subagent learns valid filters reactively without per-column schema verbosity — at zero added cost to the Elasticsearch query hot path.

**Architecture:** Add a `FILTER_CAPABILITIES` table plus pure `getColumnFilters` / `getColumnOperations` / `columnOperationsHint` helpers next to `hasCapability` in `api/src/datasets/es/operations.ts`. Drive the `commons.js` filter loop's capability check and `dataset-api-docs.ts`'s suffix enumeration from the table, and enrich the capability-rejection error messages (filters, sort, group, metric, word-agg) with the column's supported operations. The enrichment/enumeration helpers run only on the error and doc-generation paths, never on a successful query. `hasCapability` is unchanged. The agent gets a global suffix reference in its tool description + subagent prompt; `get_dataset_schema` output is untouched.

**Tech Stack:** Node.js (ESM), TypeScript + JS in `api/`, Elasticsearch query builder, `@playwright/test` + `node:assert/strict` for tests, `agent-tools` zero-dependency package.

---

## Design Constraints (read before starting)

- **Hot path:** `getColumnFilters` / `getColumnOperations` / `columnOperationsHint` allocate arrays/objects. They MUST be called only when building an error message or generating OpenAPI docs — never on the success path of a query. `hasCapability` stays byte-for-byte unchanged.
- **Table order is the canonical suffix order.** `FILTER_CAPABILITIES` keys are declared in the exact order the current `dataset-api-docs.ts` loop pushes them, so the regenerated OpenAPI filter list is byte-identical. This order is also safe for the `commons.js` `endsWith` suffix detection because every suffix is underscore-prefixed, so no suffix is a suffix-substring of another (`foo_nin`.endsWith(`_in`) is false — last 3 chars are `nin`, not `_in`).
- **`_search` is the only any-of capability** (`text` OR `textStandard`). It keeps its existing bespoke handling in `commons.js`; only `getColumnFilters` reads its array value.

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `api/src/datasets/es/operations.ts` | Capability primitives | Add `FILTER_CAPABILITIES`, `getColumnFilters`, `getColumnOperations`, `columnOperationsHint`; enrich `requiredCapability` message. `hasCapability` unchanged. |
| `api/src/datasets/es/commons.js` | Shared query building/enforcement | Derive `filterSuffixes` from the table; table-drive the loop's capability check; enrich `parseSort` error. |
| `api/src/datasets/es/values-agg.js` | Grouping aggregation | Enrich group-rejection error. |
| `api/src/datasets/es/metric-agg.js` | Metric aggregation | Enrich metric-rejection error. |
| `api/src/datasets/es/words-agg.js` | Word aggregation | Enrich word-agg-rejection error. |
| `api/contract/dataset-api-docs.ts` | OpenAPI generation | Replace inline suffix loop with `getColumnFilters`. |
| `agent-tools/_utils.ts` | Agent tool descriptions | Rewrite `filtersDescription` with real suffix list + error-driven rule. |
| `agent-tools/dataset-data-subagent.ts` | Subagent prompt | Add a short "Filtering" guidance block. |
| `tests/features/datasets/es/column-operations.unit.spec.ts` | New unit test | Cover the pure helpers + error enrichment. |
| `tests/features/datasets/schema/capabilities.api.spec.ts` | Existing API test | Add assertions that 400 messages list available operations. |
| `tests/features/agent-tools/filter-query-string.unit.spec.ts` | Existing agent-tools test | Add a sanity assertion on `filtersDescription`. |
| `docs/architecture/agent-integration.md` | Architecture doc | Note the subagent-prompt filtering guidance + error-driven discovery. |

---

## Task 1: Shared derivation helpers in `operations.ts`

**Files:**
- Modify: `api/src/datasets/es/operations.ts` (add after `requiredCapability`, ~line 28)
- Test: `tests/features/datasets/es/column-operations.unit.spec.ts` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/features/datasets/es/column-operations.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { FILTER_CAPABILITIES, getColumnFilters, getColumnOperations } from '../../../../api/src/datasets/es/operations.ts'

const DEFAULT_FILTERS = ['_eq', '_neq', '_in', '_nin', '_lt', '_lte', '_gt', '_gte', '_starts', '_exists', '_nexists', '_search']

test.describe('FILTER_CAPABILITIES table', () => {
  test('keys are the canonical suffix set in docs order', () => {
    assert.deepEqual(Object.keys(FILTER_CAPABILITIES), [...DEFAULT_FILTERS.slice(0, 11), '_contains', '_search'])
  })
})

test.describe('getColumnFilters', () => {
  test('a default string column gets all index + search filters (no _contains)', () => {
    assert.deepEqual(getColumnFilters({ key: 'name', type: 'string' }), DEFAULT_FILTERS)
  })
  test('index:false drops all exact/range/exists filters but keeps _search', () => {
    assert.deepEqual(getColumnFilters({ key: 'bio', type: 'string', 'x-capabilities': { index: false } }), ['_search'])
  })
  test('wildcard:true adds _contains', () => {
    const filters = getColumnFilters({ key: 'code', type: 'string', 'x-capabilities': { wildcard: true } })
    assert.ok(filters.includes('_contains'))
    assert.equal(filters.indexOf('_contains'), 11) // canonical position
  })
  test('text:false + textStandard:false drops _search', () => {
    const filters = getColumnFilters({ key: 'code', type: 'string', 'x-capabilities': { text: false, textStandard: false } })
    assert.ok(!filters.includes('_search'))
  })
  test('_search survives if only one of text/textStandard is enabled (any-of)', () => {
    assert.ok(getColumnFilters({ key: 'x', type: 'string', 'x-capabilities': { text: false } }).includes('_search'))
    assert.ok(getColumnFilters({ key: 'x', type: 'string', 'x-capabilities': { textStandard: false } }).includes('_search'))
  })
})

test.describe('getColumnOperations', () => {
  test('default numeric column: sortable, groupable, metric, not wordAgg', () => {
    const ops = getColumnOperations({ key: 'age', type: 'integer' })
    assert.equal(ops.sortable, true)
    assert.equal(ops.groupable, true)
    assert.equal(ops.metric, true)
    assert.equal(ops.wordAgg, false)
  })
  test('values:false makes it not sortable/groupable/metric', () => {
    const ops = getColumnOperations({ key: 'bio', type: 'string', 'x-capabilities': { values: false } })
    assert.equal(ops.groupable, false)
    assert.equal(ops.metric, false)
  })
  test('insensitive keeps a values:false string sortable', () => {
    const ops = getColumnOperations({ key: 'name', type: 'string', 'x-capabilities': { values: false } })
    assert.equal(ops.sortable, true) // insensitive defaults true
  })
  test('textAgg:true enables wordAgg', () => {
    assert.equal(getColumnOperations({ key: 't', type: 'string', 'x-capabilities': { textAgg: true } }).wordAgg, true)
  })
  test('_geo* columns are not groupable', () => {
    assert.equal(getColumnOperations({ key: '_geopoint', type: 'string' }).groupable, false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/es/column-operations.unit.spec.ts`
Expected: FAIL — `FILTER_CAPABILITIES`/`getColumnFilters`/`getColumnOperations` are not exported.

- [ ] **Step 3: Write minimal implementation**

In `api/src/datasets/es/operations.ts`, immediately after the `requiredCapability` definition (currently ends ~line 28), add:

```ts
/**
 * The single source of truth: maps each filter suffix to the capability it requires.
 * Declared in canonical order (matches OpenAPI doc output). `_search` is any-of (text OR textStandard).
 */
export const FILTER_CAPABILITIES: Record<string, string | string[]> = {
  _eq: 'index',
  _neq: 'index',
  _in: 'index',
  _nin: 'index',
  _lt: 'index',
  _lte: 'index',
  _gt: 'index',
  _gte: 'index',
  _starts: 'index',
  _exists: 'index',
  _nexists: 'index',
  _contains: 'wildcard',
  _search: ['text', 'textStandard']
}

/**
 * The filter suffixes valid for a column, in canonical order.
 * NOTE: allocates — call only on error/doc paths, never on the query success path.
 */
export const getColumnFilters = (prop: any): string[] => {
  const filters: string[] = []
  for (const suffix of Object.keys(FILTER_CAPABILITIES)) {
    const cap = FILTER_CAPABILITIES[suffix]
    const ok = Array.isArray(cap) ? cap.some(c => hasCapability(prop, c)) : hasCapability(prop, cap)
    if (ok) filters.push(suffix)
  }
  return filters
}

/**
 * A fuller summary of the query operations a column supports.
 * Mirrors the enforcement in commons.js (parseSort), values-agg.js, metric-agg.js, words-agg.js.
 * NOTE: allocates — call only on error/doc paths.
 */
export const getColumnOperations = (prop: any): { filters: string[], sortable: boolean, groupable: boolean, metric: boolean, wordAgg: boolean } => {
  const caps = prop['x-capabilities'] ?? {}
  return {
    filters: getColumnFilters(prop),
    sortable: caps.values !== false || caps.insensitive !== false,
    groupable: !String(prop.key).startsWith('_geo') && caps.values !== false,
    metric: ['number', 'integer'].includes(prop.type) && caps.values !== false,
    wordAgg: hasCapability(prop, 'textAgg')
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/datasets/es/column-operations.unit.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/operations.ts tests/features/datasets/es/column-operations.unit.spec.ts
git commit -m "feat(es): add FILTER_CAPABILITIES table + getColumnFilters/getColumnOperations"
```

---

## Task 2: Self-orienting error in `requiredCapability` + `columnOperationsHint`

**Files:**
- Modify: `api/src/datasets/es/operations.ts:24-28` (`requiredCapability`) and add `columnOperationsHint`
- Test: `tests/features/datasets/es/column-operations.unit.spec.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/features/datasets/es/column-operations.unit.spec.ts`:

```ts
import { columnOperationsHint, requiredCapability } from '../../../../api/src/datasets/es/operations.ts'

test.describe('columnOperationsHint', () => {
  test('lists filters and sort/group flags for a default column', () => {
    const hint = columnOperationsHint({ key: 'name', type: 'string' })
    assert.ok(hint.includes('_eq'))
    assert.ok(hint.includes('_search'))
    assert.ok(/tri\s*:\s*oui/.test(hint))
    assert.ok(/groupement\s*:\s*oui/.test(hint))
  })
  test('says "aucun" when no filters are available', () => {
    const hint = columnOperationsHint({ key: 'bio', type: 'string', 'x-capabilities': { index: false, text: false, textStandard: false } })
    assert.ok(hint.includes('aucun'))
  })
})

test.describe('requiredCapability error', () => {
  test('rejection message names the available filters for the column', () => {
    assert.throws(
      () => requiredCapability({ key: 'name', type: 'string', 'x-capabilities': { wildcard: false } }, '_contains', 'wildcard'),
      (err: any) => err.status === 400 && err.message.includes('_eq') && err.message.includes('_search')
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/es/column-operations.unit.spec.ts`
Expected: FAIL — `columnOperationsHint` not exported; `requiredCapability` message has no suffix list.

- [ ] **Step 3: Write minimal implementation**

In `api/src/datasets/es/operations.ts`, add after `getColumnOperations`:

```ts
/**
 * A French, agent- and user-friendly sentence describing what a column supports.
 * Appended to capability-rejection errors so the caller can self-correct.
 * NOTE: allocates — call only on error paths.
 */
export const columnOperationsHint = (prop: any): string => {
  const ops = getColumnOperations(prop)
  const filters = ops.filters.length ? ops.filters.join(', ') : 'aucun'
  return `Opérations disponibles sur ce champ — filtres : ${filters} ; tri : ${ops.sortable ? 'oui' : 'non'} ; groupement : ${ops.groupable ? 'oui' : 'non'}.`
}
```

Then change `requiredCapability` (currently lines 24-28) to append the hint:

```ts
export const requiredCapability = (prop: any, filterName: string, capability: string = 'index'): void => {
  if (!hasCapability(prop, capability)) {
    throw httpError(400, `Impossible d'appliquer un filtre ${filterName} sur le champ ${prop.key}. La fonctionnalité "${capabilities.properties[capability]?.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
  }
}
```

(Note: `columnOperationsHint` is defined above `requiredCapability` is fine in module scope since it is only called at throw time — but to avoid any temporal-dead-zone confusion, ensure `columnOperationsHint` and `getColumnOperations`/`getColumnFilters` are declared ABOVE `requiredCapability`, OR keep `requiredCapability` where it is since `const` arrow functions are only invoked at runtime. Both work because the call happens at throw time, not at definition time. If you prefer, move the helper block above `requiredCapability`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/datasets/es/column-operations.unit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/operations.ts tests/features/datasets/es/column-operations.unit.spec.ts
git commit -m "feat(es): self-orienting capability errors via columnOperationsHint"
```

---

## Task 3: Table-drive the `commons.js` filter loop + enrich `parseSort` error

**Files:**
- Modify: `api/src/datasets/es/commons.js` — import block (lines 19-28), `filterSuffixes` (line 33), `parseSort` error (lines 70-73), filter loop (lines 284-377), and the re-export line (39)
- Safety net: `tests/features/datasets/schema/capabilities.api.spec.ts` (existing — must stay green)

- [ ] **Step 1: Run the existing capability API test to capture the baseline (must pass before changes)**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts`
Expected: PASS. (If the dev stack is not up, ask the user — this spec needs the API + Elasticsearch running.)

- [ ] **Step 2: Add table imports + re-export in `commons.js`**

In the import block from `./operations.ts` (lines 19-28), add `FILTER_CAPABILITIES`, `getColumnFilters`, `getColumnOperations`, `columnOperationsHint`:

```js
import {
  hasCapability,
  requiredCapability,
  esProperty as esPropertyPure,
  Q_SEARCH_FIELDS_THRESHOLD,
  isBoostEligible,
  hasManyQSearchFields,
  getFilterableFields,
  buildQClauses,
  FILTER_CAPABILITIES,
  getColumnFilters,
  getColumnOperations,
  columnOperationsHint
} from './operations.ts'
```

Add `getColumnFilters` to the re-export at line 39 so `dataset-api-docs.ts` can import it from `commons.js` (mirrors how it imports `hasCapability` today):

```js
export { Q_SEARCH_FIELDS_THRESHOLD, isBoostEligible, hasManyQSearchFields, getFilterableFields, getColumnFilters }
```

- [ ] **Step 3: Derive `filterSuffixes` from the table**

Replace line 33:

```js
const filterSuffixes = ['_in', '_nin', '_eq', '_neq', '_gt', '_lt', '_gte', '_lte', '_search', '_contains', '_starts', '_exists', '_nexists']
```

with:

```js
// derived from the single source of truth — keep no second hardcoded list
const filterSuffixes = Object.keys(FILTER_CAPABILITIES)
```

(Order differs from the old array but is collision-free for `endsWith` detection — see Design Constraints.)

- [ ] **Step 4: Hoist the capability check in the filter loop and remove the per-branch duplicates**

In the filter loop (lines 284-377), right after `prop` is resolved (just before `if (filterSuffix === '_in')`, ~line 298), insert a single table-driven check for every suffix except the any-of `_search`:

```js
    // single source of truth: every suffix except the any-of _search requires exactly one capability
    if (filterSuffix !== '_search') requiredCapability(prop, filterSuffix, FILTER_CAPABILITIES[filterSuffix])
```

Then DELETE the now-redundant `requiredCapability(...)` calls inside the individual branches:
- `_in`, `_nin`, `_eq`, `_neq`, `_gt`, `_gte`, `_lt`, `_lte`, `_starts`, `_exists`, `_nexists`: remove their `requiredCapability(prop, filterSuffix)` line.
- `_contains`: remove `requiredCapability(prop, filterSuffix, 'wildcard')` (now covered by the hoisted call, since `FILTER_CAPABILITIES._contains === 'wildcard'`).
- `_search`: leave its branch exactly as-is (the bespoke `subfields` logic and its `requiredCapability(prop, filterSuffix, 'textStandard')` fallback when neither text nor textStandard is present).

The ES query construction in every branch (terms/range/prefix/wildcard/date handling) is untouched.

- [ ] **Step 5: Enrich the `parseSort` error**

Replace the throw at lines 71-73:

```js
    if (capabilities.values === false && capabilities.insensitive === false) {
      throw httpError(400, `Impossible de trier sur le champ ${key}. La fonctionnalité "Triable et groupable" n'est pas activée dans la configuration technique du champ.`)
    }
```

with (using the resolved `field`):

```js
    if (capabilities.values === false && capabilities.insensitive === false) {
      throw httpError(400, `Impossible de trier sur le champ ${key}. La fonctionnalité "Triable et groupable" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(field)}`)
    }
```

- [ ] **Step 6: Run the capability API test to verify behavior is unchanged**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts`
Expected: PASS (same enforcement outcomes; only message text gained a suffix list).

- [ ] **Step 7: Commit**

```bash
git add api/src/datasets/es/commons.js
git commit -m "refactor(es): drive filter-loop capability check from FILTER_CAPABILITIES table"
```

---

## Task 4: Enrich group / metric / word-agg rejection errors

**Files:**
- Modify: `api/src/datasets/es/values-agg.js:49-51`
- Modify: `api/src/datasets/es/metric-agg.js:67-69`
- Modify: `api/src/datasets/es/words-agg.js:14-16`

- [ ] **Step 1: Add the helper import to each file**

At the top of each of the three files, alongside the existing `capabilities` import, add an import of `columnOperationsHint` from `./commons.js` (re-export) or directly from `./operations.ts`. Use `./operations.ts` to avoid widening the `commons.js` re-export surface:

`values-agg.js`, `metric-agg.js`, `words-agg.js` — add:

```js
import { columnOperationsHint } from './operations.ts'
```

- [ ] **Step 2: Enrich `values-agg.js` (group) error**

Replace lines 49-51:

```js
    if (props[i]['x-capabilities'] && props[i]['x-capabilities'].values === false) {
      throw httpError(400, `Impossible de grouper sur le champ ${props[i].key}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ.`)
    }
```

with:

```js
    if (props[i]['x-capabilities'] && props[i]['x-capabilities'].values === false) {
      throw httpError(400, `Impossible de grouper sur le champ ${props[i].key}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(props[i])}`)
    }
```

- [ ] **Step 3: Enrich `metric-agg.js` (metric) error**

Replace lines 67-69:

```js
  if (field['x-capabilities'] && field['x-capabilities'].values === false) {
    throw httpError(400, `Impossible de calculer une métrique sur le champ ${metricField}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ.`)
  }
```

with:

```js
  if (field['x-capabilities'] && field['x-capabilities'].values === false) {
    throw httpError(400, `Impossible de calculer une métrique sur le champ ${metricField}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(field)}`)
  }
```

- [ ] **Step 4: Enrich `words-agg.js` (word-agg) error**

Replace lines 14-16:

```js
  if (prop['x-capabilities'] && !prop['x-capabilities'].textAgg) {
    throw httpError(400, `Impossible d'agréger sur le champ ${prop.key}. La fonctionnalité "${capabilities.properties.textAgg.title}" n'est pas activée dans la configuration technique du champ.`)
  }
```

with:

```js
  if (prop['x-capabilities'] && !prop['x-capabilities'].textAgg) {
    throw httpError(400, `Impossible d'agréger sur le champ ${prop.key}. La fonctionnalité "${capabilities.properties.textAgg.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
  }
```

- [ ] **Step 5: Verify nothing broke at the unit level**

Run: `npx playwright test tests/features/datasets/es/column-operations.unit.spec.ts`
Expected: PASS (these edits don't change the helpers; this confirms imports resolve).

- [ ] **Step 6: Commit**

```bash
git add api/src/datasets/es/values-agg.js api/src/datasets/es/metric-agg.js api/src/datasets/es/words-agg.js
git commit -m "feat(es): name available operations in group/metric/word-agg rejection errors"
```

---

## Task 5: Drive OpenAPI doc suffix enumeration from `getColumnFilters`

**Files:**
- Modify: `api/contract/dataset-api-docs.ts:12` (import) and `:143-169` (the `filterItems` build loop)

- [ ] **Step 1: Add the import**

Change line 12 from:

```ts
import { hasCapability } from '../src/datasets/es/commons.js'
```

to:

```ts
import { hasCapability, getColumnFilters } from '../src/datasets/es/commons.js'
```

(`hasCapability` may still be used elsewhere in the file — keep it.)

- [ ] **Step 2: Replace the inline suffix loop**

Replace the block at lines 144-169:

```ts
  const filterItems: any[] = []
  if (!isSampleDataset) {
    for (const p of schema) {
      if (hasCapability(p, 'index') || hasCapability(p, 'wildcard') || hasCapability(p, 'text') || hasCapability(p, 'textStandard')) {
        filterItems.push({ header: true, title: p.title ?? p['x-originalName'] ?? p.key })
      }
      if (hasCapability(p, 'index')) {
        filterItems.push(p.key + '_eq')
        filterItems.push(p.key + '_neq')
        filterItems.push(p.key + '_in')
        filterItems.push(p.key + '_nin')
        filterItems.push(p.key + '_lt')
        filterItems.push(p.key + '_lte')
        filterItems.push(p.key + '_gt')
        filterItems.push(p.key + '_gte')
        filterItems.push(p.key + '_starts')
        filterItems.push(p.key + '_exists')
        filterItems.push(p.key + '_nexists')
      }
      if (hasCapability(p, 'wildcard')) {
        filterItems.push(p.key + '_contains')
      }
      if (hasCapability(p, 'textStandard') || hasCapability(p, 'text')) {
        filterItems.push(p.key + '_search')
      }
    }
  }
```

with:

```ts
  const filterItems: any[] = []
  if (!isSampleDataset) {
    for (const p of schema) {
      const colFilters = getColumnFilters(p)
      if (!colFilters.length) continue
      filterItems.push({ header: true, title: p.title ?? p['x-originalName'] ?? p.key })
      for (const suffix of colFilters) filterItems.push(p.key + suffix)
    }
  }
```

This is byte-identical output: the header was pushed iff any of index/wildcard/text/textStandard held — which is exactly `colFilters.length > 0` — and `getColumnFilters` emits suffixes in the same canonical order the old loop pushed them.

- [ ] **Step 3: Type-check the contract module**

Run: `npm run check-types 2>&1 | grep -i "dataset-api-docs" || echo "no new dataset-api-docs type errors"`
Expected: `no new dataset-api-docs type errors`. (The repo has many pre-existing `check-types` errors — only confirm you introduced none in this file.)

- [ ] **Step 4: Commit**

```bash
git add api/contract/dataset-api-docs.ts
git commit -m "refactor(api-docs): derive per-column filter suffixes from getColumnFilters"
```

---

## Task 6: Assert self-orienting errors in the API test

**Files:**
- Modify: `tests/features/datasets/schema/capabilities.api.spec.ts` (extend existing rejection cases)

- [ ] **Step 1: Read the existing rejection assertions**

Run: `grep -n "n'est pas activée\|requiredCapability\|400\|_contains\|assert" tests/features/datasets/schema/capabilities.api.spec.ts | head -40`
Identify the test that disables `index` and asserts an exact-filter rejection (the spec's "Test 133" area) and the `_contains`/wildcard rejection.

- [ ] **Step 2: Add an assertion that the rejection message lists available operations**

In the existing test that expects a 400 when filtering on a capability-disabled column, after the status assertion, add a message-content assertion. Pattern (adapt to the file's existing request/assert style — it uses the shared `axios`/`assert` helpers):

```ts
// the error should now re-orient the caller by listing what the column DOES support
assert.ok(err.data?.includes?.('Opérations disponibles sur ce champ') ?? String(err).includes('Opérations disponibles sur ce champ'))
```

Place this in at least the `index:false` (exact filter) case and the `wildcard` (`_contains`) case so both the hoisted check and the message wiring are covered end-to-end.

- [ ] **Step 3: Run the capability API test**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts`
Expected: PASS, including the new message assertions.

- [ ] **Step 4: Commit**

```bash
git add tests/features/datasets/schema/capabilities.api.spec.ts
git commit -m "test(es): assert capability errors list available column operations"
```

---

## Task 7: Global suffix reference for the agent

**Files:**
- Modify: `agent-tools/_utils.ts:31` (`filtersDescription`)
- Modify: `agent-tools/dataset-data-subagent.ts:12-44` (prompt)
- Test: `tests/features/agent-tools/filter-query-string.unit.spec.ts` (extend)

- [ ] **Step 1: Write the failing test**

Append to `tests/features/agent-tools/filter-query-string.unit.spec.ts`:

```ts
import { filtersDescription } from '../../../agent-tools/_utils.ts'

test.describe('filtersDescription', () => {
  test('lists the real suffixes and the error-driven correction rule', () => {
    for (const s of ['_eq', '_in', '_gte', '_lte', '_starts', '_search', '_contains', '_exists']) {
      assert.ok(filtersDescription.includes(s), `missing ${s}`)
    }
    assert.ok(/error/i.test(filtersDescription)) // mentions reacting to rejection errors
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/agent-tools/filter-query-string.unit.spec.ts`
Expected: FAIL — current `filtersDescription` lacks the suffix list and the rule.

- [ ] **Step 3: Rewrite `filtersDescription`**

Replace line 31 of `agent-tools/_utils.ts`:

```ts
export const filtersDescription = 'Column filters as key-value pairs. Key format: column_key + suffix (see server instructions for available suffixes). All values must be strings, even for numbers/dates. If a column key has underscores (e.g., code_postal), just append the suffix: code_postal_eq. Example: { "nom_search": "Jean", "age_lte": "30", "ville_eq": "Paris" }'
```

with:

```ts
export const filtersDescription = `Column filters as key-value pairs. Key format: column_key + suffix. All values are strings, even for numbers/dates. If a column key has underscores (e.g. code_postal), just append the suffix: code_postal_eq.

Suffixes:
- _eq / _neq: equals / not equals
- _in / _nin: in / not in a comma-separated list
- _gt / _gte / _lt / _lte: numeric or date range comparisons
- _starts: value starts with a string (prefix)
- _exists / _nexists: column has / has no value
- _search: free-text word search (DEFAULT choice for matching text)
- _contains: substring match — only on columns explicitly enabled for it

Most columns support all of the above except _contains. A few long-text columns disable exact filters, and _search needs a text-analyzed column. You do NOT get a per-column capability list up front: just try the suffix that fits. If the API rejects a filter, the 400 error states exactly which filters that column supports ("Opérations disponibles sur ce champ — …") — read it and switch.

Example: { "nom_search": "Jean", "age_lte": "30", "ville_eq": "Paris" }`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/agent-tools/filter-query-string.unit.spec.ts`
Expected: PASS.

- [ ] **Step 5: Add a short "Filtering" block to the subagent prompt**

In `agent-tools/dataset-data-subagent.ts`, inside the `prompt` template, add a `Filtering:` section between the `Workflow:` list (ends line ~21) and the `Format:` section (line ~22):

```ts
Filtering:
- Build column filters as column_key + suffix (_eq, _neq, _in, _nin, _gt, _gte, _lt, _lte, _starts, _exists, _nexists, _search, _contains).
- Prefer _search for free-text matching; use _eq/_in for exact values; _gte/_lte for ranges.
- Do not assume a column supports every suffix. If a filter is rejected with a 400, the error lists the operations that column DOES support — switch to one of those instead of retrying the same filter.
```

- [ ] **Step 6: Commit**

```bash
git add agent-tools/_utils.ts agent-tools/dataset-data-subagent.ts tests/features/agent-tools/filter-query-string.unit.spec.ts
git commit -m "feat(agent-tools): document real filter suffixes + error-driven correction"
```

---

## Task 8: Update architecture doc + full verification

**Files:**
- Modify: `docs/architecture/agent-integration.md` (the data-exploration / subagent section)

- [ ] **Step 1: Document the new behavior**

In `docs/architecture/agent-integration.md`, in the section describing the `dataset_data` subagent / data tools, add a short note:

```markdown
### Filter capability discovery (error-driven)

The agent is NOT given a per-column capability list in `get_dataset_schema` (kept lean).
Instead it knows the global suffix list (tool description + subagent prompt) and assumes
the common defaults. When a filter/sort/group/metric/word-agg call hits a column whose
`x-capabilities` forbid it, the API returns a 400 whose message lists the operations that
column does support ("Opérations disponibles sur ce champ — …"), so the agent self-corrects
on the next call. The capability→operation mapping is a single source of truth:
`FILTER_CAPABILITIES` + `getColumnFilters`/`getColumnOperations` in
`api/src/datasets/es/operations.ts`, also consumed by the OpenAPI doc generator.
```

- [ ] **Step 2: Run the full related test set**

Run:
```bash
npx playwright test tests/features/datasets/es/column-operations.unit.spec.ts tests/features/agent-tools/filter-query-string.unit.spec.ts tests/features/datasets/schema/capabilities.api.spec.ts
```
Expected: all PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: no errors (the pre-commit hook also runs this).

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/agent-integration.md
git commit -m "docs(agent): document error-driven filter capability discovery"
```

---

## Self-Review Notes

- **Spec coverage:** Part 1 → Task 1; Part 2 (errors) → Tasks 2/3/4; Part 3 (consumers: commons + docs) → Tasks 3/5; Part 4 (agent global reference) → Task 7; hot-path guarantee → enforced by Design Constraints + the hoisted-check structure in Task 3 (helpers only on error/doc paths); single-source unit test → Task 1 Step 1 (`FILTER_CAPABILITIES` keys) + structural (commons derives `filterSuffixes` from the table).
- **`hasCapability` unchanged:** confirmed — no task edits it.
- **Order preservation:** `getColumnFilters` returns canonical (docs) order; `dataset-api-docs.ts` output is byte-identical; `commons.js` `endsWith` detection is collision-free for any order.
- **Metric-agg** was added (Task 4) for consistency even though the spec's file table listed only values-agg/words-agg; it shares the identical `values` rejection pattern.
