# Catalog Search Implementation Plan

> **Superseded in part by [2026-09-18-text-search-util-design.md](2026-09-18-text-search-util-design.md).**
> This pair still describes the MongoDB `$text` engine and the per-organization `catalogSearch`
> switches, both of which were replaced before merge — the owned term index took over `q=`, and
> schema-label indexing became unconditional with no organization setting. Kept as the record of
> the evidence and the reasoning; see [docs/architecture/catalog-search.md](../architecture/catalog-search.md)
> for what shipped.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the dataset catalog search work for French catalogs and for the way people and agents actually phrase queries: a French text index, a hidden per-dataset `searchTerms` field the assistant helps fill, and a bounded, permission-guarded `_searchText` calculated from the schema.

**Architecture:** Everything is content on the Mongo dataset document plus one text index definition. `searchTerms` is an ordinary metadata field; `_searchText` is a calculated field (like `_modified`) produced by a pure function and stamped in the same `$set` as the write that changes its inputs (dataset create, schema patch, permissions PUT, organization settings change). Nothing outside `findDatasets` and the index knows the engine, so an Elasticsearch phase later replaces one module.

**Tech Stack:** Node 24 / TypeScript (api), MongoDB text index, Vue 3 + Vuetify + vjsf (ui), `@data-fair/lib-vue-agents` (assistant tools), Playwright test runner (`*.unit.spec.ts`, `*.api.spec.ts`, `*.e2e.spec.ts`).

**Spec:** `docs/plans/2026-09-16-catalog-search-design.md` — evidence in `benchmark/catalog-search/FINDINGS.md`.

## Global Constraints

- Work on the `feat-better-catalog-search` worktree. All paths below are relative to its root.
- Never start, stop or restart dev processes; the user manages them (AGENTS.md). The dev API restarts itself through nodemon when `api/` files change — the Mongo index rebuild happens on that restart (`bash dev/status.sh` to check health).
- Run only the related tests while iterating (`npx playwright test <file>`); the full suite runs on push.
- Pure logic goes in `operations.ts` / `*-logic.ts` modules and is unit-tested there; no node config tricks in unit tests.
- Index weights: `title: 3, searchTerms: 3, summary: 2`, everything else 1. Index language from `config.catalogSearch.language`, default `'french'`.
- `_searchText` limits (constants, exact values): column title hard cap 200 chars; description head 200 chars cut at a word boundary; enum value ≤ 100 chars; ≤ 500 enum values; labels part ≤ 8192 bytes; enum part ≤ 8192 bytes; when a cap is hit the remaining columns are dropped whole.
- Column keys are NOT indexed. Extension columns keep their labels; `x-calculated` columns are excluded.
- Guard: a permission grantee holding `list` without `readSchema` drops the labels part; without `readLines` drops the enum part.
- `searchTerms`: string, `maxLength: 1000`, gated by `settings.datasetsMetadata.searchTerms.active` with default `true`; missing setting = active.
- `settings.catalogSearch.indexSchemaLabels` default `true`; `settings.catalogSearch.indexEnumValues` default `false`.
- Upgrade script folder = last released version = `6.20.0` (`jq -r .version package.json`). Script must be idempotent.
- Commit after each task, message in the repo's conventional style (`feat(scope): …`), ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Lint runs in the pre-commit hook (`eslint`, single quotes, no semicolons); type ratchet gate runs on push.

---

## File structure

| File | Responsibility |
|---|---|
| `api/config/default.cjs`, `api/config/type/schema.json`, `api/config/custom-environment-variables.cjs` | new `catalogSearch.language` config |
| `api/src/mongo.ts` | the `datasets.fulltext` / `applications.fulltext` index definitions |
| `api/types/dataset/schema.js`, `api/doc/datasets/patch-req/schema.js` | `searchTerms` property and its patchability |
| `api/types/settings/schema.js` | `datasetsMetadata.searchTerms` toggle and the `catalogSearch` object |
| `api/src/misc/utils/permissions.ts` | export `permissionOperations`; recompute `_searchText` on PUT `/permissions` |
| `api/src/datasets/operations.ts` | `computeSearchText` (pure) and its constants |
| `api/src/datasets/utils/search-text.ts` (new) | `getCatalogSearchSettings(owner)` + `searchTextPatch(dataset)`: the I/O wrapper around the pure function |
| `api/src/datasets/service.ts` | stamp `_searchText` in `createDataset` and `applyPatch`; hide it from `select` |
| `api/src/datasets/utils/index.ts` | `clean` drops `_searchText` |
| `api/src/settings/service.ts` | recompute the owner's datasets when `catalogSearch` changes |
| `api/upgrade/6.20.0/backfill-search-text.ts` (new) | one-time backfill |
| `ui/src/components/dataset/metadata/dataset-metadata-form.vue` | `searchTerms` textarea + action button |
| `ui/src/components/settings/settings-catalog-search.vue` (new), `ui/src/pages/settings.vue` | organization switches + disclaimer |
| `ui/src/composables/dataset/agent-metadata-tools-logic.ts`, `agent-metadata-tools.ts` | `searchTerms` in the metadata tools; `search_terms_writer` subagent |
| `ui/src/pages/dataset/[id]/index.vue` | tab `agentDesc` mention |
| `simulations/cases/index.ts` | one judged case |
| `docs/architecture/data-catalog-exploration.md`, `agent-integration.md`, `agent-integration-gaps.md` | documentation |
| `tests/features/datasets/compute-search-text.unit.spec.ts` (new), `tests/features/datasets/catalog-search.api.spec.ts` (new), `tests/features/agent-tools/dataset-metadata-tools.unit.spec.ts`, `tests/features/ui/dataset-pages.e2e.spec.ts`, `tests/features/ui/settings-page.e2e.spec.ts` | tests |

---

### Task 1: French text index with the new fields and weights

**Files:**
- Modify: `api/config/default.cjs` (after the `mongo` block, ~line 76)
- Modify: `api/config/type/schema.json` (`required` list line 15–40; a new property next to `"mongo"` ~line 205)
- Modify: `api/config/custom-environment-variables.cjs` (next to the mongo entries ~line 109)
- Modify: `api/src/mongo.ts:67` and `:94`
- Test: `tests/features/datasets/catalog-search.api.spec.ts` (new)

**Interfaces:**
- Produces: `config.catalogSearch.language: string` (default `'french'`); the `datasets.fulltext` index with fields `title, searchTerms, summary, description, keywords, topics.title, owner.name, owner.departmentName, _searchText` and weights `{ title: 3, searchTerms: 3, summary: 2 }`.

- [ ] **Step 1: Write the failing API test**

Create `tests/features/datasets/catalog-search.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const u1 = await axiosAuth('test_user1@test.com')

const metaOnly = async (id: string, body: Record<string, any>) => {
  await u1.post('/api/v1/datasets/' + id, { isMetaOnly: true, title: id, ...body })
}

test.describe('catalog search', () => {
  test.beforeEach(async () => { await clean() })
  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('french stopwords and stemming in the catalog index', async () => {
    await metaOnly('cs-logements', { title: 'Les logements sociaux', description: 'Répertoire des logements conventionnés de la métropole' })
    await metaOnly('cs-carburants', { title: 'Prix des carburants', description: 'Prix relevés dans les stations-service' })
    await metaOnly('cs-radars', { title: 'Radars fixes', description: 'Liste des radars automatiques' })

    // bare French stopwords are not terms any more (english index: they matched every dataset)
    for (const q of ['des', 'les', 'à']) {
      const res = (await u1.get('/api/v1/datasets', { params: { q, size: 0 } })).data
      assert.equal(res.count, 0, `q=${q} should match nothing`)
    }
    // a phrased query no longer drags the whole catalog in
    const phrased = (await u1.get('/api/v1/datasets', { params: { q: 'le prix des carburants dans les stations', select: 'id' } })).data
    assert.equal(phrased.count, 1)
    assert.equal(phrased.results[0].id, 'cs-carburants')
    // singular query, plural in the title: the french stemmer joins them
    const stem = (await u1.get('/api/v1/datasets', { params: { q: 'logement', select: 'id' } })).data
    assert.equal(stem.count, 1)
    assert.equal(stem.results[0].id, 'cs-logements')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts`
Expected: FAIL — `q=des should match nothing` (count is 3 under the English index).

- [ ] **Step 3: Add the config**

`api/config/default.cjs`, right after the `mongo: { ... }` block:

```js
  catalogSearch: {
    // language of the MongoDB text index over dataset/application metadata (any mongo text-index
    // language name, or 'none' for no stemming and no stopwords)
    language: 'french'
  },
```

`api/config/type/schema.json`: add `"catalogSearch"` to the top-level `required` array (after `"mongo"`), and next to the `"mongo"` property:

```json
    "catalogSearch": {
      "type": "object",
      "required": ["language"],
      "properties": {
        "language": { "type": "string" }
      }
    },
```

`api/config/custom-environment-variables.cjs`, next to the mongo entries:

```js
  catalogSearch: {
    language: 'CATALOG_SEARCH_LANGUAGE'
  },
```

Then rebuild the config types: `npm run build-types`.

- [ ] **Step 4: Redefine the indexes**

`api/src/mongo.ts:67` becomes:

```ts
        fulltext: [
          { title: 'text', searchTerms: 'text', summary: 'text', description: 'text', 'owner.name': 'text', 'owner.departmentName': 'text', keywords: 'text', 'topics.title': 'text', _searchText: 'text' },
          { weights: { title: 3, searchTerms: 3, summary: 2 }, default_language: config.catalogSearch.language }
        ],
```

`api/src/mongo.ts:94` (applications) becomes:

```ts
        fulltext: [{ title: 'text', summary: 'text', description: 'text', 'owner.name': 'text', 'owner.departmentName': 'text' }, { weights: { title: 3, summary: 2 }, default_language: config.catalogSearch.language }],
```

`config` is already imported in that file. lib-node's `ensureIndex` drops and recreates a named index whose definition conflicts, so the dev API picks the new definition up on its nodemon restart — wait for `bash dev/status.sh` to show `dev-api UP` before running the test.

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts`
Expected: PASS.

- [ ] **Step 6: Re-run the suites that assert on `q=` against the datasets list**

Run: `npx playwright test tests/features/datasets tests/features/applications tests/features/catalog -g "q=|search|text"`
Expected: PASS. If an expectation flips because of French stemming (e.g. a test relying on an English plural rule), adjust that expectation, never the index.

- [ ] **Step 7: Commit**

```bash
git add api/config api/src/mongo.ts tests/features/datasets/catalog-search.api.spec.ts
git commit -m "feat(catalog-search): french text index over dataset metadata, searchTerms and _searchText fields"
```

---

### Task 2: the `searchTerms` metadata field

**Files:**
- Modify: `api/types/dataset/schema.js` (after `keywords` ~line 116; and the property list ~line 1083)
- Modify: `api/doc/datasets/patch-req/schema.js:4-10`
- Modify: `api/types/settings/schema.js` (after the `keywords` entry inside `datasetsMetadata.properties`, ~line 466)
- Test: `tests/features/datasets/catalog-search.api.spec.ts`

**Interfaces:**
- Produces: dataset property `searchTerms?: string` (patchable, selectable); settings `datasetsMetadata.searchTerms: { active: boolean (default true), title?: string }`.

- [ ] **Step 1: Write the failing test** (append inside the describe block)

```ts
  test('searchTerms is patchable, searchable at title weight, and readable', async () => {
    await metaOnly('cs-bureaux', { title: 'Contours des bureaux de vote', description: 'Découpage géographique des bureaux' })
    await metaOnly('cs-legislatives', { title: 'Circonscriptions législatives', description: 'Résultats des élections législatives par circonscription' })

    const patched = await u1.patch('/api/v1/datasets/cs-bureaux', { searchTerms: 'élections scrutin électeurs' })
    assert.equal(patched.data.searchTerms, 'élections scrutin électeurs')
    const fetched = (await u1.get('/api/v1/datasets/cs-bureaux')).data
    assert.equal(fetched.searchTerms, 'élections scrutin électeurs')

    // both match "élections"; the searchTerms hit (weight 3) outranks the description hit (weight 1)
    const res = (await u1.get('/api/v1/datasets', { params: { q: 'élections', select: 'id,searchTerms' } })).data
    assert.equal(res.count, 2)
    assert.equal(res.results[0].id, 'cs-bureaux')
    assert.equal(res.results[0].searchTerms, 'élections scrutin électeurs')

    await assert.rejects(u1.patch('/api/v1/datasets/cs-bureaux', { searchTerms: 'x'.repeat(1001) }), { status: 400 })
  })
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts -g "searchTerms"`
Expected: FAIL with status 400 on the first PATCH (unknown property).

- [ ] **Step 3: Add the property**

`api/types/dataset/schema.js`, after the `keywords` property:

```js
  searchTerms: {
    type: 'string',
    maxLength: 1000,
    description: 'Free text used only by the catalog search, never displayed: synonyms, acronyms and their expansion, everyday wording'
  },
```

and in the property list that ends with `keywords: datasetProperties.keywords, frequency: ..., customMetadata: ...` (~line 1083) add `searchTerms: datasetProperties.searchTerms,` after `keywords`.

`api/doc/datasets/patch-req/schema.js`: add `'searchTerms'` after `'keywords'` in `patchKeys`.

`api/types/settings/schema.js`, after the `keywords` entry inside `datasetsMetadata.properties`:

```js
        searchTerms: {
          type: 'object',
          properties: {
            active: {
              title: 'Termes de recherche associés',
              type: 'boolean',
              default: true,
              layout: { cols: 6 }
            },
            title: {
              title: 'Libellé personnalisé',
              type: 'string',
              layout: {
                if: 'parent.data.active',
                cols: 6,
                props: { variant: 'outlined', placeholder: 'Termes de recherche associés' }
              }
            }
          }
        },
```

Rebuild types: `npm run build-types`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts`
Expected: PASS (both tests).

- [ ] **Step 5: Commit**

```bash
git add api/types api/doc tests/features/datasets/catalog-search.api.spec.ts
git commit -m "feat(datasets): searchTerms metadata field, hidden from display and indexed like a title"
```

---

### Task 3: `computeSearchText` — the pure function

**Files:**
- Modify: `api/src/datasets/operations.ts` (append)
- Test: `tests/features/datasets/compute-search-text.unit.spec.ts` (new)

**Interfaces:**
- Consumes: `operationsClasses` from `@data-fair/data-fair-shared/permissions/operations.ts` (the `shared/` workspace: config-free and side-effect-free by design, so it keeps `operations.ts` pure — do NOT import `misc/utils/permissions.ts`, which pulls in `#config` and `#mongo`); `Permission` type from `#types`.
- Produces:

```ts
export interface CatalogSearchSettings { indexSchemaLabels?: boolean, indexEnumValues?: boolean }
export const SEARCH_TEXT_LIMITS = { titleMax: 200, descriptionHead: 200, enumValueMax: 100, enumValuesMax: 500, labelsBytes: 8192, enumsBytes: 8192 } as const
export function computeSearchText (dataset: { schema?: any[] | null, permissions?: Permission[] | null }, catalogSearch?: CatalogSearchSettings | null): string | undefined
```

- [ ] **Step 1: Write the failing unit tests**

Create `tests/features/datasets/compute-search-text.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { computeSearchText, SEARCH_TEXT_LIMITS } from '../../../api/src/datasets/operations.ts'

const col = (key: string, extra: Record<string, any> = {}) => ({ key, type: 'string', ...extra })

test.describe('computeSearchText', () => {
  test('column titles and descriptions by default, keys never', () => {
    const text = computeSearchText({ schema: [col('p_chom1564', { title: 'Chômeurs 15-64 ans', description: 'Nombre de chômeurs au sens du recensement' })] })
    assert.ok(text)
    assert.match(text, /Chômeurs 15-64 ans/)
    assert.match(text, /Nombre de chômeurs/)
    assert.doesNotMatch(text, /p_chom1564/)
  })

  test('undefined when nothing remains', () => {
    assert.equal(computeSearchText({ schema: [col('a')] }), undefined)
    assert.equal(computeSearchText({ schema: [col('a', { title: 'A' })] }, { indexSchemaLabels: false }), undefined)
    assert.equal(computeSearchText({}), undefined)
  })

  test('x-calculated columns are skipped, extension columns are kept', () => {
    const text = computeSearchText({ schema: [
      col('_geopoint', { title: 'Point', 'x-calculated': true }),
      col('_ext_city', { title: 'Commune enrichie', 'x-extension': 'geo' })
    ] })
    assert.equal(text, 'Commune enrichie')
  })

  test('enum values only when enabled, strings only, capped per value', () => {
    const schema = [col('type_syndic', { title: 'Type de syndic', enum: ['professionnel', 'bénévole', 42, 'x'.repeat(200)] })]
    assert.doesNotMatch(computeSearchText({ schema })!, /bénévole/)
    const text = computeSearchText({ schema }, { indexEnumValues: true })!
    assert.match(text, /bénévole/)
    assert.doesNotMatch(text, /42/)
    assert.doesNotMatch(text, /x{101}/)
  })

  test('description head is cut at a word boundary', () => {
    const description = 'mot '.repeat(80).trim() // 319 chars, words of 3
    const text = computeSearchText({ schema: [col('a', { description })] })!
    assert.ok(text.length <= SEARCH_TEXT_LIMITS.descriptionHead)
    assert.ok(text.endsWith('mot'), 'no partial word')
  })

  test('identical labels are deduplicated', () => {
    const text = computeSearchText({ schema: [col('a', { title: 'Femmes 15 ans' }), col('b', { title: 'Femmes 15 ans' })] })
    assert.equal(text, 'Femmes 15 ans')
  })

  test('caps drop whole columns, in schema order', () => {
    const schema = Array.from({ length: 200 }, (_, i) => col('c' + i, { title: `Colonne ${i} ` + 'libellé long '.repeat(10) }))
    const text = computeSearchText({ schema })!
    assert.ok(Buffer.byteLength(text, 'utf8') <= SEARCH_TEXT_LIMITS.labelsBytes)
    assert.match(text, /^Colonne 0 /)
    const kept = text.split('\n').length
    assert.doesNotMatch(text, new RegExp(`Colonne ${kept} `), 'the first dropped column is absent entirely')
  })

  test('guard: a grantee with list but not readSchema drops the labels, not readLines drops the enums', () => {
    const schema = [col('a', { title: 'Libellé', enum: ['valeur'] })]
    const settings = { indexEnumValues: true }
    const full = computeSearchText({ schema, permissions: [{ classes: ['list', 'read'] }] }, settings)!
    assert.match(full, /Libellé/); assert.match(full, /valeur/)

    const listOnly = computeSearchText({ schema, permissions: [{ classes: ['list'] }] }, settings)
    assert.equal(listOnly, undefined)

    const noLines = computeSearchText({ schema, permissions: [{ classes: ['list'], operations: ['readSchema'] }] }, settings)!
    assert.match(noLines, /Libellé/); assert.doesNotMatch(noLines, /valeur/)

    // an org entry restricted to a role is still a grantee
    const orgListOnly = computeSearchText({ schema, permissions: [{ type: 'organization', id: 'o1', roles: ['user'], classes: ['list'] }] }, settings)
    assert.equal(orgListOnly, undefined)
    // a grantee without list at all changes nothing
    const readOnly = computeSearchText({ schema, permissions: [{ classes: ['read'] }] }, settings)!
    assert.match(readOnly, /Libellé/)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/datasets/compute-search-text.unit.spec.ts`
Expected: FAIL — `computeSearchText` is not exported.

- [ ] **Step 3: Implement the pure function**

Append to `api/src/datasets/operations.ts` (the imports go at the top of the file, above the existing code):

```ts
import type { Permission } from '#types'
import { operationsClasses } from '@data-fair/data-fair-shared/permissions/operations.ts'

export interface CatalogSearchSettings { indexSchemaLabels?: boolean, indexEnumValues?: boolean }

// the concrete operations a permission entry grants (same expansion as permissions.ts's
// permissionOperations, kept here so this module stays free of #config / #mongo)
const grantedOperations = (permission: Permission): Set<string> => {
  const granted = new Set<string>(permission.operations ?? [])
  for (const opClass of permission.classes ?? []) {
    for (const op of operationsClasses.datasets[opClass] ?? []) granted.add(op)
  }
  return granted
}

export const SEARCH_TEXT_LIMITS = {
  titleMax: 200,
  descriptionHead: 200,
  enumValueMax: 100,
  enumValuesMax: 500,
  labelsBytes: 8192,
  enumsBytes: 8192
} as const

// first `max` characters, cut back to the last whitespace so no word is split
const head = (text: string, max: number): string => {
  if (text.length <= max) return text
  const cut = text.slice(0, max)
  const space = cut.lastIndexOf(' ')
  return (space > 0 ? cut.slice(0, space) : cut).trim()
}

// concatenate strings in order, dropping whole entries once the byte budget is reached
const bounded = (parts: string[], maxBytes: number): string[] => {
  const kept: string[] = []
  let bytes = 0
  for (const part of parts) {
    const size = Buffer.byteLength(part, 'utf8') + 1
    if (bytes + size > maxBytes) break
    kept.push(part)
    bytes += size
  }
  return kept
}

// which schema-derived parts a viewer allowed to merely list the dataset could otherwise infer
const guardedParts = (permissions: Permission[] | null | undefined): { labels: boolean, enums: boolean } => {
  let labels = true
  let enums = true
  for (const permission of permissions ?? []) {
    const ops = grantedOperations(permission)
    if (!ops.has('list')) continue
    if (!ops.has('readSchema')) labels = false
    if (!ops.has('readLines')) enums = false
  }
  return { labels, enums }
}

/**
 * The calculated `_searchText` of a dataset: column labels (and, when the owner opts in, enum
 * values) so the catalog search sees the vocabulary of the data. Bounded because MongoDB's text
 * score dilutes a field's terms by its length. `undefined` means "unset the field".
 */
export function computeSearchText (
  dataset: { schema?: any[] | null, permissions?: Permission[] | null },
  catalogSearch?: CatalogSearchSettings | null
): string | undefined {
  const columns = (dataset.schema ?? []).filter(p => !p['x-calculated'])
  const guard = guardedParts(dataset.permissions)
  const parts: string[] = []

  if (catalogSearch?.indexSchemaLabels !== false && guard.labels) {
    const seen = new Set<string>()
    const labels: string[] = []
    for (const column of columns) {
      const pieces: string[] = []
      if (typeof column.title === 'string' && column.title.trim()) pieces.push(column.title.trim().slice(0, SEARCH_TEXT_LIMITS.titleMax))
      if (typeof column.description === 'string' && column.description.trim()) pieces.push(head(column.description.trim(), SEARCH_TEXT_LIMITS.descriptionHead))
      const label = pieces.join(' ')
      if (!label || seen.has(label)) continue
      seen.add(label)
      labels.push(label)
    }
    parts.push(...bounded(labels, SEARCH_TEXT_LIMITS.labelsBytes))
  }

  if (catalogSearch?.indexEnumValues === true && guard.enums) {
    const seen = new Set<string>()
    const values: string[] = []
    for (const column of columns) {
      for (const value of column.enum ?? []) {
        if (typeof value !== 'string' || !value.trim()) continue
        if (value.length > SEARCH_TEXT_LIMITS.enumValueMax) continue
        if (seen.has(value)) continue
        seen.add(value)
        values.push(value.trim())
        if (values.length >= SEARCH_TEXT_LIMITS.enumValuesMax) break
      }
      if (values.length >= SEARCH_TEXT_LIMITS.enumValuesMax) break
    }
    parts.push(...bounded(values, SEARCH_TEXT_LIMITS.enumsBytes))
  }

  return parts.length ? parts.join('\n') : undefined
}
```

Note on the enum-value test: the 200-char value is skipped by `value.length > enumValueMax` (so no partial enum values either).

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/features/datasets/compute-search-text.unit.spec.ts`
Expected: PASS (8 tests). The unit project loads `operations.ts` directly under Node: if it fails on a `#config` or `#mongo` import, a non-pure import slipped into `operations.ts` — remove it, do not work around it.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/operations.ts tests/features/datasets/compute-search-text.unit.spec.ts
git commit -m "feat(datasets): computeSearchText, the bounded and permission-guarded schema vocabulary of a dataset"
```

---

### Task 4: organization settings `catalogSearch`

**Files:**
- Modify: `api/types/settings/schema.js` (top-level `properties`, after `datasetsMetadata` ~line 525)
- Test: `tests/features/settings/settings.api.spec.ts` (append one test)

**Interfaces:**
- Produces: `settings.catalogSearch?: { indexSchemaLabels?: boolean, indexEnumValues?: boolean }` accepted by PUT/PATCH `/api/v1/settings/:type/:id`; `Settings['catalogSearch']` type.

- [ ] **Step 1: Write the failing test** (append inside the `settings API` describe)

```ts
  test('accepts catalogSearch switches', async () => {
    const res = await testUser1Org.put('/api/v1/settings/organization/test_org1', {
      catalogSearch: { indexSchemaLabels: false, indexEnumValues: true }
    })
    assert.deepEqual(res.data.catalogSearch, { indexSchemaLabels: false, indexEnumValues: true })
    const fetched = (await testUser1Org.get('/api/v1/settings/organization/test_org1')).data
    assert.deepEqual(fetched.catalogSearch, { indexSchemaLabels: false, indexEnumValues: true })
    await assert.rejects(testUser1Org.put('/api/v1/settings/organization/test_org1', { catalogSearch: { unknown: true } }), { status: 400 })
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/settings/settings.api.spec.ts -g "catalogSearch"`
Expected: FAIL with status 400 (`additionalProperties: false` on settings).

- [ ] **Step 3: Add the schema object**

In `api/types/settings/schema.js`, after the `datasetsMetadata` property (before `compatODS`):

```js
    catalogSearch: {
      type: 'object',
      title: 'Recherche du catalogue',
      'x-i18n-title': { en: 'Catalog search' },
      description: 'Ce que la recherche textuelle du catalogue voit en plus des métadonnées. Une correspondance peut révéler qu\'une colonne ou une valeur existe à quiconque peut lister le jeu de données, même sans accès à son schéma ou à ses lignes ; les jeux de données exposés à de tels lecteurs sont automatiquement exclus.',
      'x-i18n-description': { en: 'What the catalog text search sees on top of the metadata. A match can reveal that a column or a value exists to anyone who can list the dataset, even without access to its schema or lines; datasets exposed to such readers are excluded automatically.' },
      additionalProperties: false,
      properties: {
        indexSchemaLabels: {
          type: 'boolean',
          title: 'Libellés et descriptions de colonnes',
          'x-i18n-title': { en: 'Column titles and descriptions' },
          default: true
        },
        indexEnumValues: {
          type: 'boolean',
          title: 'Valeurs distinctes des colonnes à faible cardinalité',
          'x-i18n-title': { en: 'Distinct values of low-cardinality columns' },
          default: false
        }
      }
    },
```

Rebuild types: `npm run build-types`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/features/settings/settings.api.spec.ts -g "catalogSearch"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/types/settings tests/features/settings/settings.api.spec.ts
git commit -m "feat(settings): catalogSearch switches for schema labels and enum values"
```

---

### Task 5: stamp `_searchText` on create and on schema patches, hide it from outputs

**Files:**
- Create: `api/src/datasets/utils/search-text.ts`
- Modify: `api/src/datasets/service.ts` (`createDataset` ~line 377; `applyPatch` ~lines 537–545 and the mongo write ~lines 594–603; `findDatasets` line 145)
- Modify: `api/src/datasets/utils/index.ts:199` (`clean`)
- Test: `tests/features/datasets/catalog-search.api.spec.ts`

**Interfaces:**
- Consumes: `computeSearchText`, `CatalogSearchSettings` (Task 3).
- Produces:

```ts
// api/src/datasets/utils/search-text.ts
export const getCatalogSearchSettings = (owner: { type: string, id: string }): Promise<CatalogSearchSettings | undefined>
export const searchTextPatch = (dataset: { owner: { type: string, id: string }, schema?: any[] | null, permissions?: any[] | null }): Promise<{ _searchText: string | null }>
```
`_searchText: null` means "unset" (the mongo write loop turns `null` into `$unset`).

- [ ] **Step 1: Write the failing tests** (append inside the describe)

```ts
  test('column labels feed the search, keys do not, and _searchText never leaves the API', async () => {
    await u1.post('/api/v1/datasets/cs-erp', {
      isRest: true,
      title: 'Accessibilité des ERP',
      schema: [
        { key: 'accueil_chambre_nombre_accessibles', type: 'integer', title: 'Nombre de chambres accessibles à une personne en fauteuil roulant' },
        { key: 'nom', type: 'string' }
      ]
    })
    const byLabel = (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', select: 'id' } })).data
    assert.equal(byLabel.count, 1)
    assert.equal(byLabel.results[0].id, 'cs-erp')
    const byKey = (await u1.get('/api/v1/datasets', { params: { q: 'accueil_chambre_nombre_accessibles', size: 0 } })).data
    assert.equal(byKey.count, 0)

    for (const res of [
      (await u1.get('/api/v1/datasets/cs-erp')).data,
      (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil' } })).data.results[0],
      (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', select: 'id,_searchText' } })).data.results[0],
      (await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', select: 'id,_searchText', raw: 'true' } })).data.results[0]
    ]) assert.equal(res._searchText, undefined)

    // a title edit is an innocuous schema patch (no reprocessing): still recomputed
    await u1.patch('/api/v1/datasets/cs-erp', { schema: [
      { key: 'accueil_chambre_nombre_accessibles', type: 'integer', title: 'Chambres PMR' },
      { key: 'nom', type: 'string' }
    ] })
    assert.equal((await u1.get('/api/v1/datasets', { params: { q: 'fauteuil', size: 0 } })).data.count, 0)
    assert.equal((await u1.get('/api/v1/datasets', { params: { q: 'PMR', size: 0 } })).data.count, 1)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts -g "column labels"`
Expected: FAIL — `byLabel.count` is 0.

- [ ] **Step 3: The I/O wrapper**

Create `api/src/datasets/utils/search-text.ts`:

```ts
import mongo from '#mongo'
import { computeSearchText, type CatalogSearchSettings } from '../operations.ts'

// the owner's main settings (department settings never carry catalogSearch)
export const getCatalogSearchSettings = async (owner: { type: string, id: string }): Promise<CatalogSearchSettings | undefined> => {
  const settings = await mongo.settings.findOne(
    { type: owner.type, id: owner.id, department: { $exists: false } },
    { projection: { catalogSearch: 1 } }
  )
  return (settings as { catalogSearch?: CatalogSearchSettings } | null)?.catalogSearch
}

/** The `_searchText` value to write for a dataset, `null` to unset it. */
export const searchTextPatch = async (dataset: { owner: { type: string, id: string }, schema?: any[] | null, permissions?: any[] | null }): Promise<{ _searchText: string | null }> => {
  const catalogSearch = await getCatalogSearchSettings(dataset.owner)
  return { _searchText: computeSearchText(dataset, catalogSearch) ?? null }
}
```

- [ ] **Step 4: Stamp at creation and on schema patches**

`api/src/datasets/service.ts`, import `import { searchTextPatch } from './utils/search-text.ts'`.

In `createDataset`, right after `dataset._modified = computeModified(dataset)` (~line 377):

```ts
  const { _searchText } = await searchTextPatch(dataset)
  if (_searchText) dataset._searchText = _searchText
```

In `applyPatch`, right after the `_modified` recompute block (~line 540, before `Object.assign(dataset, patch)`). This single branch also covers finalization: `finalize.ts` builds its patch as `{ status: 'finalized', schema: dataset.schema, … }` (line 6) and hands it to `applyPatch`, so the enum values stamped during finalize reach `_searchText` through `patch.schema` with no call site in the worker:

```ts
  // schema-derived search text: recomputed when the schema is patched (finalize patches it with
  // the enums stamped; column title/description edits are innocuous props that trigger no
  // reprocessing, so nothing else would). Skipped for drafts — the field describes the published
  // dataset. Kept out of `patch`: the write routes report Object.keys(patch) to the user as the
  // fields they modified.
  let searchTextUpdate: { _searchText: string | null } | undefined
  if (patch.schema && !dataset.draftReason && !patch.draftReason) {
    searchTextUpdate = await searchTextPatch({ ...dataset, ...patch })
  }
```

Then, in the mongo write section (~line 594), after the `for (const key of Object.keys(patch))` loop that fills `mongoPatch` and before `await db.collection('datasets').updateOne({ id: dataset.id }, mongoPatch)`:

```ts
  if (searchTextUpdate) {
    if (searchTextUpdate._searchText === null) (mongoPatch.$unset ??= {})._searchText = true
    else (mongoPatch.$set ??= {})._searchText = searchTextUpdate._searchText
    dataset._searchText = searchTextUpdate._searchText ?? undefined
  }
```

- [ ] **Step 5: Hide it from outputs**

`api/src/datasets/service.ts:145`: `findUtils.project(reqQuery.select, ['_modified', '_searchText'], reqQuery.raw === 'true')`.

`api/src/datasets/utils/index.ts`, in `clean`, next to `delete dataset._modified`: `delete dataset._searchText`.

- [ ] **Step 6: Run to verify it passes**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts`
Expected: PASS (3 tests). If the `raw: 'true'` variant still returns `_searchText`, check `findUtils.project`: with `raw` the `exclude` list is still deleted from the projection (line 190–192), so the field is not selected — the `clean` in the list route handles the non-select case.

- [ ] **Step 7: Run the neighbouring suites**

Run: `npx playwright test tests/features/datasets/conforms-to.api.spec.ts tests/features/datasets/compute-modified.unit.spec.ts tests/features/datasets/rest`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add api/src/datasets tests/features/datasets/catalog-search.api.spec.ts
git commit -m "feat(datasets): stamp _searchText on create and schema patch, hidden from every output"
```

---

### Task 6: recompute on PUT `/permissions`

**Files:**
- Modify: `api/src/misc/utils/permissions.ts:383-390`
- Test: `tests/features/datasets/catalog-search.api.spec.ts`

**Interfaces:**
- Consumes: `searchTextPatch` (Task 5).

- [ ] **Step 1: Write the failing test** (append)

```ts
  test('a list-only grantee removes the schema vocabulary from the search', async () => {
    await u1.post('/api/v1/datasets/cs-guard', {
      isRest: true,
      title: 'Annuaire santé',
      schema: [{ key: 'spec', type: 'string', title: 'Spécialité du médecin' }]
    })
    const count = async () => (await u1.get('/api/v1/datasets', { params: { q: 'médecin', size: 0 } })).data.count
    assert.equal(await count(), 1)
    // public may list but not read the schema: the labels must not leak through search matches
    await u1.put('/api/v1/datasets/cs-guard/permissions', [{ classes: ['list'] }])
    assert.equal(await count(), 0)
    await u1.put('/api/v1/datasets/cs-guard/permissions', [{ classes: ['list', 'read'] }])
    assert.equal(await count(), 1)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts -g "list-only"`
Expected: FAIL — count stays 1 after the first PUT.

- [ ] **Step 3: Recompute in the same `$set`**

In `api/src/misc/utils/permissions.ts`, add the import `import { searchTextPatch } from '../../datasets/utils/search-text.ts'` (the file already imports from `../../integrity/`, so a datasets import is in keeping). Then replace:

```ts
      const permissionsUpdate: any = { $set: { permissions: req.body, updatedAt: new Date().toISOString() } }
```

with:

```ts
      const permissionsUpdate: any = { $set: { permissions: req.body, updatedAt: new Date().toISOString() } }
      if (resourceType === 'datasets') {
        // the permission guard of the schema-derived search text depends on the grantees
        const { _searchText } = await searchTextPatch({ ...(resource as any), permissions })
        if (_searchText === null) permissionsUpdate.$unset = { _searchText: true }
        else permissionsUpdate.$set._searchText = _searchText
      }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts tests/features/permissions`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/misc/utils/permissions.ts tests/features/datasets/catalog-search.api.spec.ts
git commit -m "feat(permissions): recompute the guarded search text when a dataset's permissions change"
```

---

### Task 7: recompute the owner's datasets when `catalogSearch` changes; enum values opt-in

**Files:**
- Modify: `api/src/settings/service.ts` (`writeSettings` ~line 39–60; a new `updateCatalogSearch` next to `updateDatasetsMetadata` ~line 194)
- Test: `tests/features/datasets/catalog-search.api.spec.ts`

**Interfaces:**
- Consumes: `computeSearchText` (Task 3), `getCatalogSearchSettings` is not needed here (the new settings are in hand).

- [ ] **Step 1: Write the failing test** (append; `sendDataset` uploads and waits for finalize, which stamps `enum` on low-cardinality columns)

```ts
  test('enum values are searchable only when the organization opts in, and switches recompute existing datasets', async () => {
    const u1Org = await axiosAuth('test_user1@test.com', 'test_org1')
    const settings = async (catalogSearch: Record<string, boolean>) => u1Org.put('/api/v1/settings/organization/test_org1', { catalogSearch })
    await settings({ indexSchemaLabels: true, indexEnumValues: false })

    // dataset1.csv has an `adr` column whose few distinct values include "bureau"
    const dataset = await sendDataset('datasets/dataset1.csv', u1Org)
    const enumCol = dataset.schema.find((p: any) => p.enum?.length)
    assert.ok(enumCol, 'the fixture must carry an enum column')
    const value: string = enumCol.enum.find((v: any) => typeof v === 'string' && /^[a-zé]{4,}$/i.test(v))
    const count = async (q: string) => (await u1Org.get('/api/v1/datasets', { params: { q, size: 0 } })).data.count

    assert.equal(await count(value), 0, 'enum values are off by default')
    await settings({ indexSchemaLabels: true, indexEnumValues: true })
    assert.equal(await count(value), 1, 'the switch recomputes existing datasets')
    await settings({ indexSchemaLabels: false, indexEnumValues: false })
    assert.equal(await count(value), 0)
    assert.equal(await count(enumCol.title ?? enumCol.key), 0, 'labels off too')
  })
```

Add `import { sendDataset } from '../../support/workers.ts'` at the top of the file. Before relying on `dataset1.csv`, check its enum columns with a quick look at `tests/resources/datasets/dataset1.csv` (a column with ≤ 50 distinct string values on ≥ 20% of rows); if none qualifies, use `tests/resources/datasets/dataset2.csv` or another fixture and adjust the comment.

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts -g "enum values"`
Expected: FAIL at `the switch recomputes existing datasets` (count stays 0).

- [ ] **Step 3: Recompute on settings change**

In `api/src/settings/service.ts`, add the imports `import { computeSearchText, type CatalogSearchSettings } from '../datasets/operations.ts'` and (if not present) `import equal from 'deep-equal'` — check what the file already imports for `equal` at line ~195 and reuse it.

Add next to `updateDatasetsMetadata`:

```ts
// the schema-derived search text of every dataset of the owner depends on these switches
const updateCatalogSearch = async (owner: AccountKeys, oldCatalogSearch: CatalogSearchSettings | undefined, newCatalogSearch: CatalogSearchSettings | undefined) => {
  if (equal(oldCatalogSearch ?? {}, newCatalogSearch ?? {})) return
  const cursor = mongo.datasets.find(
    { 'owner.type': owner.type, 'owner.id': owner.id, draftReason: { $exists: false } },
    { projection: { id: 1, schema: 1, permissions: 1, _searchText: 1 } }
  )
  const ops: any[] = []
  const flush = async () => {
    if (ops.length) await mongo.datasets.bulkWrite(ops, { ordered: false })
    ops.length = 0
  }
  for await (const dataset of cursor) {
    const _searchText = computeSearchText(dataset, newCatalogSearch)
    if ((_searchText ?? null) === (dataset._searchText ?? null)) continue
    ops.push({ updateOne: { filter: { id: dataset.id }, update: _searchText ? { $set: { _searchText } } : { $unset: { _searchText: true } } } })
    if (ops.length >= 200) await flush()
  }
  await flush()
}
```

Then in `writeSettings`, find where `updateDatasetsMetadata(owner, existingSettings?.datasetsMetadata ?? {}, settings.datasetsMetadata ?? {})` is called and add right after it:

```ts
  if (isMainSettings(settings)) await updateCatalogSearch(owner, (existingSettings as any)?.catalogSearch, settings.catalogSearch)
```

(`isMainSettings` is already imported from `./operations.ts`.)

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/features/datasets/catalog-search.api.spec.ts tests/features/settings/settings.api.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/settings/service.ts tests/features/datasets/catalog-search.api.spec.ts
git commit -m "feat(settings): recompute every dataset's search text when the catalogSearch switches change"
```

---

### Task 8: backfill `_searchText` on existing datasets

**Files:**
- Create: `api/upgrade/6.20.0/backfill-search-text.ts`

**Interfaces:**
- Consumes: `computeSearchText` (Task 3).

- [ ] **Step 1: Write the script**

```ts
import type { UpgradeScript } from '@data-fair/lib-node/upgrade-scripts.js'
import { computeSearchText, type CatalogSearchSettings } from '../../src/datasets/operations.ts'

const upgradeScript: UpgradeScript = {
  description: 'Stamp the schema-derived _searchText on existing datasets',
  async exec (db, debug) {
    const settingsByOwner = new Map<string, CatalogSearchSettings | undefined>()
    const catalogSearchOf = async (owner: { type: string, id: string }) => {
      const key = `${owner.type}:${owner.id}`
      if (!settingsByOwner.has(key)) {
        const settings = await db.collection('settings').findOne(
          { type: owner.type, id: owner.id, department: { $exists: false } },
          { projection: { catalogSearch: 1 } }
        )
        settingsByOwner.set(key, settings?.catalogSearch)
      }
      return settingsByOwner.get(key)
    }

    let stamped = 0
    // idempotent: datasets already carrying the field are skipped; re-runs only fill gaps
    const cursor = db.collection('datasets').find(
      { _searchText: { $exists: false }, draftReason: { $exists: false }, 'schema.0': { $exists: true } },
      { projection: { id: 1, owner: 1, schema: 1, permissions: 1 } }
    )
    for await (const dataset of cursor) {
      const _searchText = computeSearchText(dataset as any, await catalogSearchOf(dataset.owner))
      if (!_searchText) continue
      await db.collection('datasets').updateOne({ _id: dataset._id }, { $set: { _searchText } })
      stamped++
    }
    debug(`stamped _searchText on ${stamped} datasets`)
  }
}

export default upgradeScript
```

Check how the other scripts in `api/upgrade/6.16.1/` import from `src` (relative path) and match it exactly.

- [ ] **Step 2: Verify it type-checks and lints**

Run: `npx eslint api/upgrade/6.20.0/backfill-search-text.ts && npx tsc --noEmit -p api 2>&1 | grep backfill-search-text`
Expected: no lint error; no tsc line mentioning the file (the project's tsc has pre-existing errors elsewhere — only this file matters).

- [ ] **Step 3: Walk it through on the dev database**

The runner executes at API start. Ask the user to restart `dev-api` (never do it yourself) with `DEBUG=upgrade,upgrade:*`, or verify by hand: in the dev Mongo (port from `.env`, `MONGO_PORT`), `db.datasets.countDocuments({ _searchText: { $exists: true } })` before and after the next restart. Record the result in the commit message body.

- [ ] **Step 4: Commit**

```bash
git add api/upgrade/6.20.0/backfill-search-text.ts
git commit -m "chore(upgrade): backfill _searchText on existing datasets"
```

---

### Task 9: `searchTerms` in the metadata form, with its assistant button

**Files:**
- Modify: `ui/src/components/dataset/metadata/dataset-metadata-form.vue` (template after the `keywords` combobox ~line 141; `<i18n>` block ~line 266; script next to `summarizeContext` ~line 427)
- Test: `tests/features/ui/dataset-pages.e2e.spec.ts` (append)

**Interfaces:**
- Consumes: dataset property `searchTerms` (Task 2), settings `datasetsMetadata.searchTerms.active` (Task 2).
- Produces: the action button `action-id="suggest-search-terms"` whose hidden context names the `search_terms_writer` subagent (Task 12) and `set_dataset_metadata (searchTerms field)` (Task 11).

- [ ] **Step 1: Write the failing e2e test**

Open `tests/features/ui/dataset-pages.e2e.spec.ts`, look at how an existing test creates a dataset and opens its "informations" tab (it uses `axiosAuth` + `page.goto('/data-fair/dataset/<id>')` and clicks the tab by title), then append:

```ts
test('edits the hidden search terms from the metadata form', async ({ page }) => {
  const u1 = await axiosAuth('test_user1@test.com')
  await u1.post('/api/v1/datasets/e2e-search-terms', { isMetaOnly: true, title: 'Bureaux de vote' })
  await page.goto('/data-fair/dataset/e2e-search-terms')
  await page.getByRole('tab', { name: /informations/i }).click()
  const field = page.getByLabel('Termes de recherche associés')
  await expect(field).toBeVisible()
  await field.fill('élections scrutin')
  await page.getByRole('button', { name: /enregistrer/i }).click()
  await expect.poll(async () => (await u1.get('/api/v1/datasets/e2e-search-terms')).data.searchTerms).toBe('élections scrutin')
})
```

(Adjust the tab/button selectors to the ones the neighbouring tests in that file already use.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts -g "search terms"`
Expected: FAIL — the field is not visible.

- [ ] **Step 3: Add the field and its button**

In the template, right after the `keywords` `<v-combobox … />` block:

```vue
        <!-- hidden search vocabulary: indexed, never displayed -->
        <div
          v-if="datasetsMetadata?.searchTerms?.active !== false"
          class="d-flex align-start gap-1 mb-4"
        >
          <v-textarea
            v-model="dataset.searchTerms"
            :disabled="!can('writeDescription')"
            :label="datasetsMetadata?.searchTerms?.title || t('searchTerms')"
            :base-color="fieldColor('searchTerms')"
            :color="fieldColor('searchTerms')"
            :counter="1000"
            :rules="[(val: string) => !val || val.length <= 1000]"
            rows="3"
            variant="outlined"
            density="compact"
            class="flex-grow-1"
          >
            <template #append-inner>
              <help-tooltip :text="t('searchTermsHelp')" />
            </template>
          </v-textarea>
          <df-agent-chat-action
            v-if="can('writeDescription')"
            action-id="suggest-search-terms"
            :visible-prompt="t('searchTermsPrompt')"
            :hidden-context="searchTermsContext"
            :btn-props="{ class: 'ml-1' }"
            :title="t('searchTermsPrompt')"
          />
        </div>
```

In the `<i18n>` block, under `fr:` (next to `keywords:`):

```yaml
  searchTerms: Termes de recherche associés
  searchTermsHelp: "Texte libre utilisé uniquement par la recherche du catalogue, jamais affiché : synonymes, sigles et leur développement, formulations courantes."
  searchTermsPrompt: Aide-moi à trouver des termes de recherche pour ce jeu de données
```

and under `en:`:

```yaml
  searchTerms: Search terms
  searchTermsHelp: "Free text used only by the catalog search, never displayed: synonyms, acronyms with their expansion, everyday wording."
  searchTermsPrompt: Help me find search terms for this dataset
```

(Quote the strings containing " : " — an unquoted colon-space blanks the whole SPA, see the vue-i18n YAML colon trap.)

In the script, next to `summarizeContext`:

```ts
const searchTermsContext = computed(() => {
  return 'Use the search_terms_writer subagent to propose hidden search terms for this dataset (synonyms, acronyms with their expansion, everyday wording — never displayed, only used by the catalog search). Present the list to the user and ask for their approval before applying it. If approved, apply it with set_dataset_metadata (searchTerms field, one line of terms separated by commas or newlines). If the user wants changes, adjust accordingly.'
})
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts -g "search terms"`
Expected: PASS. Then `npm -w ui run lint && npm -w ui run check-types`.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/metadata/dataset-metadata-form.vue tests/features/ui/dataset-pages.e2e.spec.ts
git commit -m "feat(ui): searchTerms field in the metadata form with an assistant suggestion button"
```

---

### Task 10: organization settings UI for `catalogSearch`

**Files:**
- Create: `ui/src/components/settings/settings-catalog-search.vue`
- Modify: `ui/src/pages/settings.vue` (the `datasetsMetadata` tab window ~line 125; `normalizeSettings` ~line 446; `qualityEdit` keys ~line 463)
- Test: `tests/features/ui/settings-page.e2e.spec.ts` (append)

**Interfaces:**
- Consumes: `settingsSchema.properties.catalogSearch` (Task 4), `Settings['catalogSearch']`.

- [ ] **Step 1: Write the failing e2e test**

Look at how `settings-page.e2e.spec.ts` opens the organization settings page and the "Métadonnées" tab, then append:

```ts
test('catalog search switches save with the metadata section', async ({ page }) => {
  await page.goto('/data-fair/settings/organization/test_org1')
  await page.getByRole('tab', { name: /métadonnées/i }).click()
  const enumSwitch = page.getByLabel('Valeurs distinctes des colonnes à faible cardinalité')
  await expect(enumSwitch).toBeVisible()
  await expect(page.getByText(/quiconque peut lister le jeu de données/)).toBeVisible()
  await enumSwitch.check()
  await page.getByRole('button', { name: /enregistrer/i }).click()
  const u1Org = await axiosAuth('test_user1@test.com', 'test_org1')
  await expect.poll(async () => (await u1Org.get('/api/v1/settings/organization/test_org1')).data.catalogSearch?.indexEnumValues).toBe(true)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/ui/settings-page.e2e.spec.ts -g "catalog search"`
Expected: FAIL — switch not visible.

- [ ] **Step 3: The component**

Create `ui/src/components/settings/settings-catalog-search.vue`, on the model of `settings-datasets-metadata.vue`:

```vue
<template>
  <div class="mt-6">
    <h3 class="text-h6 mb-2">
      {{ t('title') }}
    </h3>
    <v-alert
      type="info"
      variant="tonal"
      density="compact"
      class="mb-4"
      :text="t('disclaimer')"
    />
    <v-defaults-provider :defaults="{ global: { hideDetails: 'auto' } }">
      <vjsf
        v-model="editCatalogSearch"
        :schema="catalogSearchSchema"
        :options="vjsfOptions"
      />
    </v-defaults-provider>
  </div>
</template>

<script setup lang="ts">
import { type Settings, settingsSchema } from '#api/types'
import Vjsf, { type Options as VjsfOptions } from '@koumoul/vjsf'

const catalogSearch = defineModel<Settings['catalogSearch']>()
const editCatalogSearch = ref<Settings['catalogSearch']>()
watchDeepDiff(catalogSearch, () => {
  editCatalogSearch.value = catalogSearch.value
}, { immediate: true })
watchDeepDiff(editCatalogSearch, () => {
  catalogSearch.value = editCatalogSearch.value
}, {})
const { t, locale } = useI18n()

// the title and description are rendered by this component, not by the form
const catalogSearchSchema = computed(() => {
  const { title, description, 'x-i18n-title': _t, 'x-i18n-description': _d, ...schema } = settingsSchema.properties.catalogSearch as any
  return schema
})

const vjsfOptions = computed<VjsfOptions>(() => ({
  validateOn: 'input',
  updateOn: 'blur',
  density: 'comfortable',
  xI18n: true,
  locale: locale.value
}))
</script>

<i18n lang="yaml">
fr:
  title: Recherche du catalogue
  disclaimer: "Ce que la recherche textuelle du catalogue voit en plus des métadonnées. Une correspondance peut révéler qu'une colonne ou une valeur existe à quiconque peut lister le jeu de données, même sans accès à son schéma ou à ses lignes ; les jeux de données exposés à de tels lecteurs sont automatiquement exclus."
en:
  title: Catalog search
  disclaimer: "What the catalog text search sees on top of the metadata. A match can reveal that a column or a value exists to anyone who can list the dataset, even without access to its schema or lines; datasets exposed to such readers are excluded automatically."
</i18n>
```

- [ ] **Step 4: Wire it in `settings.vue`**

In the `datasetsMetadata` tab window, after `<settings-datasets-metadata … />`:

```vue
            <settings-catalog-search v-model="settings.catalogSearch" />
```

In `normalizeSettings`, after the `dm` loop:

```ts
  // same false-diff guard for the catalog search switches (vjsf fills their defaults on mount)
  s.catalogSearch = { indexSchemaLabels: true, indexEnumValues: false, ...(s.catalogSearch || {}) }
```

In `qualityEdit`, the keys become `['licenses', 'datasetsMetadata', 'privateVocabulary', 'catalogSearch']`.

Components in `ui/src/components` are auto-imported (the existing `<settings-datasets-metadata>` has no explicit import); if the build complains, add `import SettingsCatalogSearch from '~/components/settings/settings-catalog-search.vue'` next to the other imports.

- [ ] **Step 5: Run to verify it passes**

Run: `npx playwright test tests/features/ui/settings-page.e2e.spec.ts -g "catalog search"` then `npm -w ui run lint && npm -w ui run check-types`.
Expected: PASS, clean.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/settings/settings-catalog-search.vue ui/src/pages/settings.vue tests/features/ui/settings-page.e2e.spec.ts
git commit -m "feat(ui): catalog search switches and disclaimer in the organization settings"
```

---

### Task 11: `searchTerms` in the metadata agent tools

**Files:**
- Modify: `ui/src/composables/dataset/agent-metadata-tools-logic.ts` (`OPTIONAL_FIELDS` line 17; `MetadataInput`; `buildMetadataPatch` after the `keywords` block; `formatMetadataContext` after the keywords line)
- Modify: `ui/src/composables/dataset/agent-metadata-tools.ts` (the `set_dataset_metadata` `inputSchema.properties`, after `keywords` ~line 78; the `read_dataset_metadata` description ~line 57)
- Test: `tests/features/agent-tools/dataset-metadata-tools.unit.spec.ts` (append)

**Interfaces:**
- Produces: `MetadataInput.searchTerms?: string`; `set_dataset_metadata` accepts `searchTerms`.

- [ ] **Step 1: Write the failing unit tests** (append in the existing describe; `ctx`, `licenses`, `topics` are defined at the top of the file)

```ts
  test('searchTerms: trimmed, capped, gated by datasets-metadata like keywords', () => {
    const { patch, outcomes } = buildMetadataPatch({ searchTerms: '  HLM, logement social\nhabitat social  ' }, { title: 'x' }, ctx)
    assert.equal(patch.searchTerms, 'HLM, logement social\nhabitat social')
    assert.deepEqual(outcomes, [{ field: 'searchTerms', status: 'applied' }])

    const tooLong = buildMetadataPatch({ searchTerms: 'x'.repeat(1001) }, {}, ctx)
    assert.equal(tooLong.patch.searchTerms, undefined)
    assert.equal(tooLong.outcomes[0].status, 'rejected')
    assert.match(tooLong.outcomes[0].reason!, /1000/)

    const disabled = buildMetadataPatch({ searchTerms: 'a' }, {}, { ...ctx, datasetsMetadata: { searchTerms: { active: false } } })
    assert.equal(disabled.outcomes[0].status, 'rejected')

    const missingSetting = buildMetadataPatch({ searchTerms: 'a' }, {}, { ...ctx, datasetsMetadata: { keywords: { active: true } } })
    assert.equal(missingSetting.outcomes[0].status, 'applied', 'a missing searchTerms setting means active')
  })

  test('the context reports searchTerms and says it is hidden', () => {
    const text = formatMetadataContext({ title: 'T', searchTerms: 'élections scrutin' }, ctx)
    assert.match(text, /searchTerms: élections scrutin/)
    assert.match(text, /never displayed/)
  })
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx playwright test tests/features/agent-tools/dataset-metadata-tools.unit.spec.ts -g "searchTerms"`
Expected: FAIL — `patch.searchTerms` is undefined.

- [ ] **Step 3: The logic**

In `agent-metadata-tools-logic.ts`:

```ts
export const OPTIONAL_FIELDS = ['keywords', 'searchTerms', 'creator', 'frequency', 'spatial'] as const
export const SEARCH_TERMS_MAX_LENGTH = 1000
```

add `searchTerms?: string` to `MetadataInput` (after `keywords`), and in `buildMetadataPatch` after the `keywords` block:

```ts
  if (input.searchTerms !== undefined && gate('searchTerms')) {
    const searchTerms = input.searchTerms.trim()
    if (searchTerms.length > SEARCH_TERMS_MAX_LENGTH) {
      reject('searchTerms', `the search terms are ${searchTerms.length} characters, max ${SEARCH_TERMS_MAX_LENGTH}. Keep the most useful terms and call the tool again.`)
    } else {
      apply('searchTerms', searchTerms)
    }
  }
```

In `formatMetadataContext`, after the `keywords` line:

```ts
  sections.push(`- searchTerms (never displayed, only used by the catalog search): ${val(dataset?.searchTerms)}`)
```

In `agent-metadata-tools.ts`, in the `set_dataset_metadata` `inputSchema.properties` after `keywords`:

```ts
        searchTerms: { type: 'string' as const, description: `Hidden search vocabulary, never displayed: synonyms, acronyms with their expansion, everyday wording, separated by commas or newlines, ${SEARCH_TERMS_MAX_LENGTH} characters max` },
```

import `SEARCH_TERMS_MAX_LENGTH` from the logic module, and in the `read_dataset_metadata` description replace `topics, keywords and optional fields` with `topics, keywords, hidden search terms and optional fields`.

- [ ] **Step 4: Run to verify it passes**

Run: `npx playwright test tests/features/agent-tools/dataset-metadata-tools.unit.spec.ts` and `npm -w ui run check-types`.
Expected: PASS, clean.

- [ ] **Step 5: Commit**

```bash
git add ui/src/composables/dataset/agent-metadata-tools-logic.ts ui/src/composables/dataset/agent-metadata-tools.ts tests/features/agent-tools/dataset-metadata-tools.unit.spec.ts
git commit -m "feat(agent): set_dataset_metadata writes the hidden searchTerms field"
```

---

### Task 12: the `search_terms_writer` subagent and the documentation of the tools

**Files:**
- Modify: `ui/src/composables/dataset/agent-summary-tools.ts` (append a second subagent in `useAgentDatasetSummaryTools`, after `dataset_summarizer`; add messages)
- Modify: `ui/src/pages/dataset/[id]/index.vue:1093` (the `informations` tab `agentDesc`)
- Modify: `docs/architecture/agent-integration.md` (§4 workflows, §5 tool reference, §6 subagent reference, §7 key files)
- Modify: `docs/architecture/agent-integration-gaps.md` (§2 "Dataset Metadata Completion")

**Interfaces:**
- Consumes: `read_dataset_info` (existing tool in the same file), `set_dataset_metadata (searchTerms)` (Task 11), the action button (Task 9).
- Produces: subagent `search_terms_writer`.

- [ ] **Step 1: Add the messages**

In `agent-summary-tools.ts` `messages`:

```ts
  fr: {
    …,
    searchTermsSubAgent: 'Proposer des termes de recherche',
    searchTermsSubAgentDesc: 'Lire les métadonnées, le schéma et des exemples, puis proposer des synonymes, sigles et formulations courantes pour la recherche du catalogue.'
  },
  en: {
    …,
    searchTermsSubAgent: 'Suggest search terms',
    searchTermsSubAgentDesc: 'Read the metadata, schema and samples, then propose synonyms, acronyms and everyday wording for the catalog search.'
  }
```

- [ ] **Step 2: Register the subagent** (after the `dataset_summarizer` registration, inside the same function)

```ts
  const searchTermsPrompts: Record<string, string> = {
    fr: `Tu proposes des termes de recherche cachés pour un jeu de données publié sur Data Fair. Ces termes ne sont jamais affichés : ils servent uniquement à ce que la recherche textuelle du catalogue retrouve le jeu de données quand quelqu'un emploie d'autres mots que ceux du titre ou du résumé.

Tâche :
1. Appelle read_dataset_info pour obtenir les métadonnées, le schéma (libellés et descriptions de colonnes, valeurs d'énumération) et des exemples.
2. Renvoie une liste de 10 à 40 termes ou expressions courtes, un par ligne, comme réponse finale.

Règles :
- Ne répète pas les mots déjà présents dans le titre, le résumé ou les mots-clés : ils sont déjà indexés.
- Donne les sigles AVEC leur développement (ex. "PLU" et "plan local d'urbanisme").
- Ajoute les formulations courantes et administratives d'un même concept (ex. "HLM", "logement social", "habitat social").
- Ajoute les notions voisines qu'une personne taperait pour trouver ce jeu (ex. "élections" pour des bureaux de vote).
- Des termes ou des expressions de 1 à 4 mots, en français, sans phrase, sans ponctuation finale, sans explication.
- Pas de valeurs recopiées des données, pas de chiffres, pas de dates.`,
    en: `You propose hidden search terms for a dataset published on Data Fair. These terms are never displayed: their only purpose is to let the catalog text search find the dataset when someone uses other words than the title or summary.

Task:
1. Call read_dataset_info to get the metadata, the schema (column titles and descriptions, enum values) and samples.
2. Return a list of 10 to 40 short terms or expressions, one per line, as your final response.

Rules:
- Do not repeat words already in the title, summary or keywords: they are already indexed.
- Give acronyms WITH their expansion (e.g. "PLU" and "plan local d'urbanisme").
- Add everyday and administrative wordings of the same concept (e.g. "HLM", "logement social", "habitat social").
- Add neighbouring notions a person would type to find this dataset (e.g. "élections" for polling stations).
- Terms of 1 to 4 words, in the language of the dataset, no sentences, no trailing punctuation, no explanation.
- No values copied from the data, no numbers, no dates.`
  }

  useAgentSubAgent({
    name: 'search_terms_writer',
    title: t('searchTermsSubAgent'),
    description: t('searchTermsSubAgentDesc'),
    model: 'summarizer',
    // producer: the lead agent shows the list to the user and applies it via set_dataset_metadata
    delegateOnly: true,
    prompt: searchTermsPrompts[locale.value] ?? searchTermsPrompts.en,
    tools: ['read_dataset_info']
  })
```

- [ ] **Step 3: Tab description and docs**

In `ui/src/pages/dataset/[id]/index.vue:1093`, extend the `informations` tab `agentDesc`: after `keywords,` add `hidden search terms (searchTerms, never displayed),` and after the description button sentence add `; next to the search terms → \`search_terms_writer\` subagent (proposes synonyms and acronyms, applied via set_dataset_metadata searchTerms)`.

In `docs/architecture/agent-integration.md`:
- §4: add `### 4.17 Suggest Search Terms` on the model of 4.5 (trigger: the `suggest-search-terms` action button on the metadata form; subagent `search_terms_writer` (model `summarizer`) reads metadata, schema and samples, returns a newline-separated list; the lead agent presents it, then `set_dataset_metadata (searchTerms)`; nothing saved before Enregistrer).
- §5: in the `set_dataset_metadata` row, add `searchTerms` to the listed fields.
- §6: add the row `| search_terms_writer | summarizer | Propose hidden catalog-search terms (synonyms, acronyms with expansion, everyday wording) | read_dataset_info |`.
- §7: the `agent-summary-tools.ts` row becomes `Summary tools (2) + dataset_summarizer and search_terms_writer subagents`.
- The totals line in §1/§6 if one exists: +1 subagent, +1 action button.

In `docs/architecture/agent-integration-gaps.md`, replace the body of `### 2. Dataset Metadata Completion (topics, keywords, license)` with one paragraph: implemented by `read_dataset_metadata` / `set_dataset_metadata` (single writer for the card, gated by the owner settings) and the `search_terms_writer` subagent for the hidden search vocabulary; remaining gap: automatic suggestion of `relatedDatasets`.

- [ ] **Step 4: Check**

Run: `npm -w ui run lint && npm -w ui run check-types`
Expected: clean. Then open the dev UI on a dataset's informations tab and click the new button once: the assistant must call `search_terms_writer`, propose a list, and on approval the textarea lights up. (`bash dev/status.sh` first; the agents mock provider seeded by `npm run dev-fixtures` answers in dev.)

- [ ] **Step 5: Commit**

```bash
git add ui/src/composables/dataset/agent-summary-tools.ts "ui/src/pages/dataset/[id]/index.vue" docs/architecture/agent-integration.md docs/architecture/agent-integration-gaps.md
git commit -m "feat(agent): search_terms_writer subagent behind the metadata form button"
```

---

### Task 13: one judged simulation

**Files:**
- Modify: `simulations/cases/index.ts` (append a case)

- [ ] **Step 1: Add the case**

```ts
  // The hidden-search-terms button: a maintainer who does not know what a synonym list is
  // for, asks for help, and must see the field light up — and nothing saved — before the
  // assistant claims it is done.
  {
    name: 'termes-de-recherche-caches',
    route: '/data-fair/dataset/sim-equipements-sportifs',
    persona: 'Tu es chargé de mission dans une petite collectivité, tu publies des données sans être informaticien. On t\'a dit que les usagers ne trouvent pas ce jeu de données quand ils cherchent "gymnase" ou "piscine". Tu ne sais pas ce qu\'est un index ni un synonyme au sens technique. Si on te dit que c\'est fait sans que tu voies un changement à l\'écran, tu le dis.',
    goal: 'Tu veux que ce jeu de données soit trouvé quand quelqu\'un tape des mots courants comme "gymnase", "piscine" ou "stade" dans la recherche du portail, et tu veux voir ce qui a été ajouté avant que ce soit enregistré.',
    maxTurns: 8
  }
```

Check the fixture dataset slug the other cases use (`sim-equipements-sportifs`) exists in the simulation fixtures; keep it.

- [ ] **Step 2: Run it once through the skill**

Invoke `/agents-sim` with `SIM_CASES=termes-de-recherche-caches` (the skill clears previous evidence, runs, judges and reports). The bridge pane must be up (`bash dev/status.sh` shows `dev-bridge (opt)`); if it is not, ask the user to start it. Read the verdict; a FAIL on "nothing visible changed" or "saved without approval" is a bug in Task 9/12, fix and re-run.

- [ ] **Step 3: Commit**

```bash
git add simulations/cases/index.ts
git commit -m "test(simulations): a case for the hidden search terms button"
```

---

### Task 14: the architecture document

**Files:**
- Rewrite: `docs/architecture/data-catalog-exploration.md`

- [ ] **Step 1: Rewrite the document** following spec §8, in French, same audience, with these sections in this order and every mechanism stated as implemented in this branch:

1. Front matter kept (`title`, `toc`), then a status line: `> Mis à jour le 2026-09-16 — décrit ce qui est implémenté dans data-fair ; les perspectives sont dans la dernière section.`
2. `## Contexte` — keep the two paragraphs and the scope note.
3. `## Une recherche textuelle adaptée au français` — the indexed fields and weights (`titre ×3, termes de recherche associés ×3, résumé ×2, description, mots-clés, thématiques, producteur, texte de recherche calculé`), analysis in French (stemming and stopwords, configurable), and the honest scoring model in one paragraph: score = fréquence des termes × poids du champ, sans pondération par rareté (IDF) — un mot fréquent dans les titres pèse autant qu'un mot rare, ce que compensent les poids et le vocabulaire ajouté ci-dessous.
4. `## Les termes de recherche associés` (replaces "Shadow Content") — free text per dataset, never displayed, not a facet (why not `keywords`), filled by hand or proposed by the assistant (`search_terms_writer`), weight equal to the title; keep the first mermaid diagram with the box renamed `Termes de recherche associés`.
5. `## Le vocabulaire du schéma dans la recherche` — `_searchText`: column titles and the head of their descriptions (default on), enum values (opt-in), size limits, the automatic permission guard, the organization switches and the disclaimer wording.
6. `## Aperçu en liste compacte` — keep.
7. `## Un aperçu des données dès les métadonnées` — keep, add the limits: automatique, ≤ 50 valeurs distinctes, absent pour les colonnes trop clairsemées ou trop variées ; l'absence d'une valeur ne prouve rien.
8. `## Un "graphe" de connaissances` — keep text and diagram; add one sentence: exposé aux agents par la spécification B (filtres et facettes de `list_datasets`, `relatedDatasets` dans `describe_dataset`).
9. `## Deux interfaces` — keep the diagram; name the server: `@data-fair/mcp` (`/mcp-server/datasets/mcp`); state plainly that today the MCP `list_datasets` takes `q`, `page`, `size` only and that facets and links are the object of spec B; keep the concision argument.
10. `## Notre position sur la recherche vectorielle` — keep, and replace "Vers une hybridation progressive" with `## Perspectives`: three items with their trigger, copied from the spec §9 (df stripping — measured; thesaurus d'organisation; index Elasticsearch — with the two triggers), and the sentence that the HTTP logs of the live portals are the evidence source. Link `benchmark/catalog-search/FINDINGS.md` and `ES-EVALUATION.md`.
11. `## Conclusion` — one paragraph, no claim beyond what the sections above say.

- [ ] **Step 2: Cross-check every claim against the code**

For each mechanism named in the doc, point at the file that implements it (`api/src/mongo.ts`, `api/src/datasets/operations.ts`, `api/types/settings/schema.js`, `ui/src/composables/dataset/agent-summary-tools.ts`, `benchmark/catalog-search/`). Anything without an implementation goes to Perspectives or is deleted.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/data-catalog-exploration.md
git commit -m "docs(architecture): describe the catalog search as implemented, perspectives kept apart"
```

---

### Task 15: closing checks

- [ ] **Step 1: Lint, types, related suites**

Run:
```bash
npm run lint
npm run check-types-ratchet
npx playwright test tests/features/datasets/catalog-search.api.spec.ts tests/features/datasets/compute-search-text.unit.spec.ts tests/features/agent-tools tests/features/settings tests/features/permissions tests/features/datasets/conforms-to.api.spec.ts
npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts tests/features/ui/settings-page.e2e.spec.ts
```
Expected: all PASS, no net-new type errors.

- [ ] **Step 2: Reproduce the evidence against the branch**

With the dev API up and the two index changes live, run `node benchmark/catalog-search/live-queries.mjs` is not applicable (it targets the public portals). Instead, spot-check three judged queries from `benchmark/catalog-search/queries.json` on the dev catalog after loading two or three of the corpus datasets as meta-only datasets with their `searchTerms` from `shadow.json`: the stopword query must not match the whole catalog, the column-label query must find its dataset. Note the outcome in the final summary for the user.

- [ ] **Step 3: Hand over**

Do not push. Report: the commit list, the test runs and their output, the simulation verdict, and the two follow-ups outside this repo (portals: do not render `searchTerms`; MCP server: spec B).
