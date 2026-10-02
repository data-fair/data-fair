# Agent Profiles — Step 2 (data-fair vocabulary and annotations, metrics) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move data-fair's agent surface from the single `explore` profile to the profile vocabulary of the design — the index declares the whole grid plus `catalog`, `platform` and a deprecated `explore` alias; data-fair's document fills `catalog` and the datasets/applications cells, including write and manage tools — and move metrics' tool to `read_metrics`.

**Architecture:** A new `api/contract/agent-profiles.ts` owns the vocabulary (silos, tiers, titles) and builds both the index's profiles and the subset a document declares. `api/contract/x-agent.ts` keeps one annotation per operation; the dataset and application PATCH operations become two views each (openapi-mcp 0.3.0), with body allow-lists that a test forces to cover every PATCH field exactly once. Goldens become one file per declared profile.

**Tech Stack:** TypeScript (Node 24 type stripping), Playwright test runner (`unit` project, no server needed), `@data-fair/openapi-mcp` 0.3.0 (`load`, `toolSetSnapshot`, `createComposer`, `validateIndex`).

**Spec:** `docs/architecture/agent-profiles.md` (this worktree) — sections 3 to 8. This plan is rollout step 2.

## Global Constraints

- Profile names are `<tier>_<silo>`; tiers `read`, `write`, `manage`; silos `datasets`, `applications`, `portals`, `processings`, `catalogs`, `notifications`, `metrics`, `account`.
- "`manage_<silo>` includes `write_<silo>`, which includes `read_<silo>`." "The umbrellas `read`, `write` and `manage` include every cell of their tier."
- "The index declares the whole vocabulary, empty cells included … with French and English titles and descriptions." Names are never renamed or removed — append only.
- "`catalog` … combines freely with the grid"; "A tool name is unique across the whole stack, whatever the profiles."
- "The index keeps `explore` for one release as a deprecated alias that includes `catalog`."
- `catalog` is the first declared profile (the default of a composition without profiles: the public use).
- data-fair tool names keep the `datafair_` prefix; the catalog listing keeps the historical name `list_datasets`, the account listing is `list_account_datasets` (spec section 5).
- Work in the worktree `~/data-fair/data-fair_chore-structure-openapi-cp` (branch `chore-structure-openapi-cp`) for Tasks 1-6, and in `~/data-fair/metrics` (branch `feat-agent-api-docs`) for Task 7.
- Unit tests run with `npx playwright test --project unit <file>`; regenerate goldens with `UPDATE_GOLDEN=1` and read the generated diff before committing it.

## Out of scope (deferred, each needs API work first)

- `catalog` `list_applications`: data-fair has no portal-scoped applications route (`/catalog` only serves datasets).
- `PUT /datasets/{id}/owner`, application permissions, settings (`account` silo): not documented in the root OpenAPI document yet.
- Dataset and application creation tools (`write_*`): creation bodies (file upload, base application choice) deserve their own design.

## Review Focus

1. Requesting every declared profile at once (`catalog` with the whole grid) → one tool set, no name collision, no tool twice. (Task 2 test "every profile combines")
2. A field added to the dataset or application PATCH body later → a failing test that forces placing it in the `write` or `manage` view, never a silent omission or leak. (Tasks 3, 4)
3. A consumer still configured with `explore` (the `mcp` server today) → the catalog tools, through the alias, with no "unknown profile" error. (Task 5)
4. The anonymous and the admin-session documents → the same annotated surface for every profile, write and manage tools included (the composer fetches the document anonymously). (Task 2 test, extended in Tasks 3-4)
5. A `catalog` tool called from the back-office host → data-fair answers 400 "catalog API can only be used from a publication site"; the tool description says the listing is a portal's. (Task 2 description text)

---

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `api/contract/agent-profiles.ts` | the profile vocabulary | create |
| `api/contract/agents-index.ts` | the deployment index | profiles from the vocabulary |
| `api/contract/x-agent.ts` | data-fair's annotations | grid profiles, new operations, PATCH views, field lists |
| `api/contract/api-docs.ts` | root document | `/catalog/datasets` path; annotations on application operations |
| `api/contract/dataset-private-api-docs.ts` | private dataset operations | annotations on PATCH, DELETE, permissions |
| `tests/features/agent-tools/agents-index.unit.spec.ts` | index tests | vocabulary assertions |
| `tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts` | surface tests | per-profile goldens, combination, field placement |
| `tests/features/agent-tools/agents-composition.unit.spec.ts` | index + document composed | create |
| `tests/fixtures/agent-surface.<profile>.json` | goldens | create per profile; delete `agent-surface.explore.json` |
| `docs/architecture/agent-profiles.md`, `docs/architecture/agent-integration.md` | docs | status of step 2 |
| metrics: `api/contract/api-docs.ts`, `test-it/03-agent-api-docs.ts`, `test-it/fixtures/` | metrics surface | `read_metrics` |

---

### Task 1: The vocabulary and the index

**Files:**
- Create: `api/contract/agent-profiles.ts`
- Modify: `api/contract/agents-index.ts`, `package.json`, `package-lock.json`
- Test: `tests/features/agent-tools/agents-index.unit.spec.ts`

**Interfaces:**
- Produces: `vocabulary(): Record<string, IndexProfile>` (the index's profiles, `catalog` first), `documentProfiles(silos: Silo[], withCatalog: boolean): Record<string, IndexProfile>` (what a service document declares), `cell(tier: Tier, silo: Silo): string`, types `Silo`, `Tier`. `agentsIndex()` keeps its signature.

- [ ] **Step 1: Upgrade openapi-mcp**

Run: `npm install @data-fair/openapi-mcp@^0.3.0`
Expected: `package.json` shows `"@data-fair/openapi-mcp": "^0.3.0"`; `npx playwright test --project unit tests/features/agent-tools/` still passes (0.3.0 is backward compatible).

- [ ] **Step 2: Write the failing tests**

In `tests/features/agent-tools/agents-index.unit.spec.ts`, remove these two lines from the first test:

```ts
    assert.deepEqual(Object.keys(index.profiles!), ['explore'])
    assert.deepEqual(index.profiles!.explore.title, { fr: 'Explorer', en: 'Explore' })
```

and add inside `test.describe('agentsIndex', …)`:

```ts
  const silos = ['datasets', 'applications', 'portals', 'processings', 'catalogs', 'notifications', 'metrics', 'account']

  test('declares the whole profile vocabulary: catalog first, umbrellas, every cell, platform, the explore alias', () => {
    const profiles = agentsIndex('https://host.test/data-fair', cfg).profiles!
    assert.equal(Object.keys(profiles)[0], 'catalog')
    for (const tier of ['read', 'write', 'manage']) {
      assert.deepEqual(profiles[tier].includes, silos.map(s => `${tier}_${s}`))
    }
    assert.equal(profiles.read_portals.includes, undefined)
    assert.deepEqual(profiles.write_portals.includes, ['read_portals'])
    assert.deepEqual(profiles.manage_portals.includes, ['write_portals'])
    assert.deepEqual(profiles.explore.includes, ['catalog'])
    assert.deepEqual(profiles.manage_metrics.title, { fr: "Administrer — métriques d'audience", en: 'Manage — audience metrics' })
    assert.ok(profiles.platform)
  })

  test('pins the vocabulary: names are only ever appended', () => {
    const cells = silos.flatMap(s => ['read', 'write', 'manage'].map(t => `${t}_${s}`))
    assert.deepEqual(Object.keys(agentsIndex('https://host.test/data-fair', cfg).profiles!), ['catalog', 'read', 'write', 'manage', ...cells, 'platform', 'explore'])
  })
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx playwright test --project unit tests/features/agent-tools/agents-index.unit.spec.ts`
Expected: FAIL — `Object.keys(profiles)[0]` is `'explore'`.

- [ ] **Step 4: Create the vocabulary module**

`api/contract/agent-profiles.ts`:

```ts
/**
 * The deployment's agent profile vocabulary (docs/architecture/agent-profiles.md). The agents
 * index declares it whole; each service document declares the cells it fills, under the same
 * names. Agent configurations are written with these names: append only, never rename.
 */
import type { IndexProfile } from '@data-fair/openapi-mcp'

type Localized = { fr: string, en: string }

export const silos = {
  datasets: { fr: 'jeux de données', en: 'datasets' },
  applications: { fr: 'applications', en: 'applications' },
  portals: { fr: 'portails', en: 'portals' },
  processings: { fr: 'traitements', en: 'processings' },
  catalogs: { fr: 'catalogues', en: 'catalogs' },
  notifications: { fr: 'notifications', en: 'notifications' },
  metrics: { fr: "métriques d'audience", en: 'audience metrics' },
  account: { fr: 'compte', en: 'account' }
} as const satisfies Record<string, Localized>
export type Silo = keyof typeof silos

export const tiers = {
  read: {
    title: { fr: 'Lire', en: 'Read' },
    description: { fr: 'Consulter sans rien modifier.', en: 'Look without changing anything.' }
  },
  write: {
    title: { fr: 'Modifier', en: 'Write' },
    description: { fr: 'Créer et modifier le contenu des ressources.', en: 'Create and edit the content of resources.' }
  },
  manage: {
    title: { fr: 'Administrer', en: 'Manage' },
    description: { fr: "Changer qui accède aux ressources, leur exposition et leur existence.", en: 'Change who can access resources, whether they are exposed, and whether they exist.' }
  }
} as const satisfies Record<string, { title: Localized, description: Localized }>
export type Tier = keyof typeof tiers

const tierOrder: Tier[] = ['read', 'write', 'manage']
const siloNames = Object.keys(silos) as Silo[]

export const cell = (tier: Tier, silo: Silo): string => `${tier}_${silo}`

const cellProfile = (tier: Tier, silo: Silo): IndexProfile => {
  const below = tierOrder[tierOrder.indexOf(tier) - 1]
  const profile: IndexProfile = {
    title: { fr: `${tiers[tier].title.fr} — ${silos[silo].fr}`, en: `${tiers[tier].title.en} — ${silos[silo].en}` }
  }
  if (below) profile.includes = [cell(below, silo)]
  return profile
}

const catalogProfile: IndexProfile = {
  title: { fr: 'Catalogue', en: 'Catalog' },
  description: {
    fr: 'Les ressources publiées sur un portail, sous leur forme destinée aux utilisateurs finaux.',
    en: 'The resources published on a portal, in their end-user form.'
  }
}

/** The whole vocabulary, as the agents index declares it. `catalog` comes first: it is the default. */
export function vocabulary (): Record<string, IndexProfile> {
  const out: Record<string, IndexProfile> = { catalog: catalogProfile }
  for (const tier of tierOrder) {
    out[tier] = { title: tiers[tier].title, description: tiers[tier].description, includes: siloNames.map(s => cell(tier, s)) }
  }
  for (const silo of siloNames) for (const tier of tierOrder) out[cell(tier, silo)] = cellProfile(tier, silo)
  out.platform = {
    title: { fr: 'Plateforme', en: 'Platform' },
    description: { fr: 'Opérations réservées aux super-administrateurs.', en: 'Operations reserved to superadmins.' }
  }
  out.explore = {
    title: { fr: 'Explorer (obsolète)', en: 'Explore (deprecated)' },
    description: { fr: 'Alias obsolète de catalog, retiré à la prochaine version.', en: 'Deprecated alias of catalog, removed in the next release.' },
    includes: ['catalog']
  }
  return out
}

/** What a service document declares: `catalog` if it fills it, and the three cells of each of its silos. */
export function documentProfiles (filled: Silo[], withCatalog: boolean): Record<string, IndexProfile> {
  const out: Record<string, IndexProfile> = withCatalog ? { catalog: catalogProfile } : {}
  for (const silo of filled) for (const tier of tierOrder) out[cell(tier, silo)] = cellProfile(tier, silo)
  return out
}
```

- [ ] **Step 5: Use it in the index**

In `api/contract/agents-index.ts`, add the import:

```ts
import { vocabulary } from './agent-profiles.ts'
```

and replace the whole `profiles: { explore: { … } }` member of the returned object with:

```ts
    profiles: vocabulary()
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx playwright test --project unit tests/features/agent-tools/agents-index.unit.spec.ts`
Expected: PASS (5 tests). `validateIndex` in the first test accepts the new profiles.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json api/contract/agent-profiles.ts api/contract/agents-index.ts tests/features/agent-tools/agents-index.unit.spec.ts
git commit -m "feat(agents): declare the whole agent profile vocabulary in the index"
```

---

### Task 2: Catalog and read tools on the grid

**Files:**
- Modify: `api/contract/x-agent.ts`, `api/contract/api-docs.ts`
- Rewrite: `tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
- Create: `tests/fixtures/agent-surface.{catalog,read_datasets,write_datasets,manage_datasets,read_applications,write_applications,manage_applications}.json` (generated)
- Delete: `tests/fixtures/agent-surface.explore.json`

**Interfaces:**
- Consumes: `documentProfiles`, `vocabulary` (Task 1).
- Produces: `operations.listCatalogDatasets` (name `list_datasets`, profile `catalog`), `operations.listDatasets` renamed `list_account_datasets` in `read_datasets`; the five per-dataset reads in `[catalog, read_datasets]`; `datasetRoot.profiles = documentProfiles(['datasets', 'applications'], true)`; `root.skills[0].profiles = ['catalog']`. The test file's `expectedTools` map and `goldenPath(profile)` helper are extended by Tasks 3 and 4.

- [ ] **Step 1: Rewrite the surface test**

Replace the whole content of `tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts` with:

```ts
/**
 * The agent-facing surface of this API: what `@data-fair/openapi-mcp` generates from the
 * x-agent annotations in the served document, one golden per declared profile. `lint: 'error'`
 * refuses a description that contradicts its schema; the goldens turn any change to a tool's
 * name, description or schema into a diff a reviewer sees. Regenerate with UPDATE_GOLDEN=1 when
 * the change is intended. Profiles: docs/architecture/agent-profiles.md.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { load, toolSetSnapshot } from '@data-fair/openapi-mcp'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const goldenPath = (profile: string) => path.resolve(import.meta.dirname, `../../fixtures/agent-surface.${profile}.json`)
const PUBLIC_URL = 'https://example.test/data-fair'

const generators = async () => ({
  apiDocs: (await import('../../../api/contract/api-docs.ts')).default,
  datasetAPIDocs: (await import('../../../api/contract/dataset-api-docs.ts')).default,
  agentsIndex: (await import('../../../api/contract/agents-index.ts')).agentsIndex,
  xAgent: await import('../../../api/contract/x-agent.ts')
})

const adminSession: any = {
  user: { id: 'admin', name: 'Admin', email: 'admin@test.com', adminMode: 1, isAdmin: 1, organizations: [] },
  account: { type: 'user', id: 'admin', name: 'Admin' },
  accountRole: 'admin'
}

const datasetReads = ['datafair_aggregate_data', 'datafair_calculate_metric', 'datafair_describe_dataset', 'datafair_get_field_values', 'datafair_search_data']

/** The tools each declared profile yields, `includes` applied. */
const expectedTools: Record<string, string[]> = {
  catalog: [...datasetReads, 'datafair_list_datasets'],
  read_datasets: [...datasetReads, 'datafair_list_account_datasets'],
  write_datasets: [...datasetReads, 'datafair_list_account_datasets'],
  manage_datasets: [...datasetReads, 'datafair_list_account_datasets'],
  read_applications: [],
  write_applications: [],
  manage_applications: []
}

const annotatedOperationIds = (doc: any): string[] => Object.values<any>(doc.paths)
  .flatMap(item => Object.values<any>(item))
  .filter(op => op?.operationId && op['x-agent'])
  .map(op => op.operationId)
  .sort()

test.describe('agent surface of the root document', () => {
  test('declares the cells data-fair fills, all of them in the index vocabulary', async () => {
    const { apiDocs, agentsIndex } = await generators()
    const declared = Object.keys(apiDocs(PUBLIC_URL)['x-agent'].profiles)
    assert.deepEqual([...declared].sort(), Object.keys(expectedTools).sort())
    const vocabulary = Object.keys(agentsIndex(PUBLIC_URL, { publicUrl: PUBLIC_URL }).profiles!)
    for (const p of declared) assert.ok(vocabulary.includes(p), `${p} is in the index vocabulary`)
  })

  for (const [profile, tools] of Object.entries(expectedTools)) {
    test(`${profile}: loads without a lint error and matches its golden`, async () => {
      const { apiDocs } = await generators()
      const toolSet = await load(apiDocs(PUBLIC_URL), { profiles: [profile], lint: 'error' })
      assert.deepEqual(toolSet.tools.map(t => t.name).sort(), [...tools].sort())
      // Through JSON: the golden is a file, and an `enum: undefined` left by the generator is not.
      const snapshot = JSON.parse(JSON.stringify(toolSetSnapshot(toolSet)))
      if (process.env.UPDATE_GOLDEN) writeFileSync(goldenPath(profile), JSON.stringify(snapshot, null, 2) + '\n')
      assert.deepEqual(snapshot, JSON.parse(readFileSync(goldenPath(profile), 'utf8')))
    })
  }

  test('every profile combines with every other: one tool set, no name twice', async () => {
    const { apiDocs } = await generators()
    const doc = apiDocs(PUBLIC_URL)
    const toolSet = await load(doc, { profiles: Object.keys(doc['x-agent'].profiles), lint: 'error' })
    const names = toolSet.tools.map(t => t.name)
    assert.equal(new Set(names).size, names.length)
    assert.deepEqual([...names].sort(), [...new Set(Object.values(expectedTools).flat())].sort())
  })

  test('the catalog workflow skill comes with the catalog profile only', async () => {
    const { apiDocs } = await generators()
    assert.deepEqual((await load(apiDocs(PUBLIC_URL), { profiles: ['catalog'] })).skills.map(s => s.id), ['workflow'])
    assert.deepEqual((await load(apiDocs(PUBLIC_URL), { profiles: ['read_datasets'] })).skills.map(s => s.id), [])
  })

  test('the annotated surface does not depend on the session', async () => {
    const { apiDocs } = await generators()
    const anonymous = apiDocs(PUBLIC_URL)
    const admin = apiDocs(PUBLIC_URL, adminSession)
    assert.ok(annotatedOperationIds(admin).length > 0)
    assert.deepEqual(annotatedOperationIds(admin), annotatedOperationIds(anonymous))
    const profiles = Object.keys(anonymous['x-agent'].profiles)
    const [a, b] = await Promise.all([anonymous, admin].map(doc => load(doc, { profiles, lint: 'error' })))
    assert.deepEqual(toolSetSnapshot(a), toolSetSnapshot(b))
  })

  test('the per-dataset document carries the same annotations, with real column keys', async () => {
    const { datasetAPIDocs } = await generators()
    const dataset: any = {
      id: 'communes',
      slug: 'communes',
      title: 'Communes',
      isRest: true,
      finalizedAt: '2026-01-01T00:00:00.000Z',
      schema: [
        { key: 'code', type: 'string' },
        { key: 'nom', type: 'string' },
        { key: 'population', type: 'integer' }
      ]
    }
    const doc = datasetAPIDocs(dataset, PUBLIC_URL).api
    const toolSet = await load(doc, { profiles: ['read_datasets'], lint: 'error' })
    const search = toolSet.tools.find(t => t.name === 'datafair_search_data')
    assert.ok(search, 'search_data is generated from the per-dataset document')
    assert.deepEqual(search.inputSchema.properties.select.items.enum, ['code', 'nom', 'population'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test --project unit tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
Expected: FAIL — the document declares only `explore` (first test), and `load` refuses `unknown profile "catalog"`.

- [ ] **Step 3: Move the annotations to the grid**

In `api/contract/x-agent.ts`:

1. Add the import after the existing type import:

```ts
import { documentProfiles } from './agent-profiles.ts'
```

2. Replace `datasetRoot`:

```ts
/** The root block of a single dataset's document: names and profiles, no cross-dataset workflow. */
export const datasetRoot: AgentRoot = {
  namePrefix: 'datafair_',
  profiles: documentProfiles(['datasets', 'applications'], true)
}
```

3. In `root.skills[0]`, add `profiles: ['catalog'],` after `name: 'workflow',`.

4. In `operations.listDatasets`, replace the first three members (`profiles`, `name`, `description`) with:

```ts
    profiles: ['read_datasets'],
    name: 'list_account_datasets',
    description: 'List the datasets of the active account and those shared with the current user, with optional text search. Returns id, title, status, row count, and last update.',
```

5. Add a new operation, right after `listDatasets`:

```ts
  listCatalogDatasets: {
    profiles: ['catalog'],
    name: 'list_datasets',
    description: 'List the datasets published on the portal you are called from, with optional text search. Returns id, title, row count, and last update. Only available from a portal, not from the back-office.',
    params: {
      q: { description: 'French keywords for full-text search (simple terms, not sentences). Examples: "élus", "DPE", "entreprises"' },
      size: { default: 10, maximum: 50 },
      page: { default: 1 },
      files: { exclude: true },
      bbox: { exclude: true },
      queryable: { exclude: true }
    },
    fixed: { select: 'id,slug,title,summary,topics,count,updatedAt,page' },
    response: { rows: '/results', concise: ['id', 'slug', 'title', 'summary', 'count', 'updatedAt', 'page'], detailed: true }
  },
```

6. In `readDescription`, `readLines`, `getValues`, `getValuesAgg` and `getMetricAgg`, replace `profiles: ['explore'],` with `profiles: ['catalog', 'read_datasets'],`.

7. In the file header comment, replace `pinned by tests/fixtures/agent-surface.explore.json` with `pinned by tests/fixtures/agent-surface.<profile>.json`.

- [ ] **Step 4: Document `/catalog/datasets` in the root document**

In `api/contract/api-docs.ts`, insert this path entry right before the `'/datasets/{id}': {` key of `paths`:

```ts
      '/catalog/datasets': {
        get: {
          summary: 'Lister les jeux de données du portail',
          description: "Récupérer la liste des jeux de données publiés sur le portail depuis lequel l'API est appelée. Indisponible depuis le back-office.",
          operationId: 'listCatalogDatasets',
          'x-agent': xAgent.listCatalogDatasets,
          tags: ['Jeux de données (JDD)'],
          parameters: [
            utils.qParam,
            utils.selectParam(Object.keys(dataset.properties)),
            utils.booleanParam('files', 'Restreindre aux jeux avec fichiers attachés'),
            utils.booleanParam('bbox', 'Restreindre aux jeux géographiques'),
            utils.booleanParam('queryable', 'Restreindre aux jeux requêtables et utilisables dans des applications'),
            ...utils.paginationParams
          ],
          responses: {
            200: {
              description: 'Les jeux de données publiés sur le portail.',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      count: { type: 'number', description: 'Nombre total de jeux de données' },
                      results: { type: 'array', items: { $ref: '#/components/schemas/dataset' } }
                    }
                  }
                }
              }
            },
            ...errorResponses
          }
        }
      },
```

(`dataset`, `utils`, `xAgent` and `errorResponses` are already in scope in that file.)

- [ ] **Step 5: Generate the goldens, read them, run the tests**

Run: `git rm tests/fixtures/agent-surface.explore.json && UPDATE_GOLDEN=1 npx playwright test --project unit tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
Then read `git diff --stat` and open `tests/fixtures/agent-surface.catalog.json`: it must list `datafair_list_datasets` with the catalog description and the five per-dataset reads; `agent-surface.read_applications.json` must list no tool.
Run: `npx playwright test --project unit tests/features/agent-tools/`
Expected: PASS, every file of the directory.

- [ ] **Step 6: Commit**

```bash
git add api/contract/x-agent.ts api/contract/api-docs.ts tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts tests/fixtures/agent-surface.*.json
git commit -m "feat(agents): catalog and read tools on the profile grid"
```

---

### Task 3: Dataset write and manage tools

**Files:**
- Modify: `api/contract/x-agent.ts`, `api/contract/dataset-private-api-docs.ts`
- Test: `tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`, goldens `write_datasets`, `manage_datasets`

**Interfaces:**
- Consumes: `expectedTools`, `generators` (Task 2).
- Produces: `datasetPatchFields: { write: string[], manage: string[] }` exported from `x-agent.ts`; operations `writeDescription` (two views `update_dataset`, `publish_dataset`), `deleteDataset`, `getDatasetPermissions`, `setDatasetPermissions`. `operations` now `satisfies Record<string, AgentOperationAnnotation>`.

- [ ] **Step 1: Write the failing tests**

In the surface test file, change the two `expectedTools` entries:

```ts
  write_datasets: [...datasetReads, 'datafair_list_account_datasets', 'datafair_update_dataset'],
  manage_datasets: [...datasetReads, 'datafair_list_account_datasets', 'datafair_update_dataset', 'datafair_publish_dataset', 'datafair_delete_dataset', 'datafair_get_dataset_permissions', 'datafair_set_dataset_permissions'],
```

and add inside the `describe`:

```ts
  test('places every dataset PATCH body field in exactly one view', async () => {
    const { apiDocs, xAgent } = await generators()
    const body = apiDocs(PUBLIC_URL).paths['/datasets/{id}'].patch.requestBody.content['application/json'].schema
    const placed = [...xAgent.datasetPatchFields.write, ...xAgent.datasetPatchFields.manage]
    assert.equal(new Set(placed).size, placed.length, 'no field is in two views')
    assert.deepEqual([...placed].sort(), Object.keys(body.properties).sort(), 'a new PATCH field must be placed in write or manage')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test --project unit tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
Expected: FAIL — `datasetPatchFields` is undefined, and the write/manage tool lists do not match.

- [ ] **Step 3: Add the annotations**

In `api/contract/x-agent.ts`, change the type import to:

```ts
import type { AgentRoot, AgentOperationAnnotation, AgentProperty, AgentParamOverride } from '@data-fair/openapi-mcp'
```

add before `export const operations`:

```ts
/**
 * PATCH /datasets/{id} body fields per tier: content (write) and exposure (manage — portals,
 * remote catalog publications, read API key, master-data exposure). A test checks that every
 * field of the body is in exactly one list, so a field added to the API is placed deliberately.
 */
export const datasetPatchFields = {
  write: ['slug', 'title', 'summary', 'description', 'image', 'spatial', 'temporal', 'keywords', 'searchTerms', 'frequency', 'creator', 'modified', 'attachments', 'primaryKey', 'schema', 'projection', 'conformsTo', 'license', 'origin', 'constraints', 'extensions', 'requestedPublicationSites', 'attachmentsAsImage', 'virtual', 'partOf', 'rest', 'topics', 'relatedDatasets', 'thumbnails', 'extras', 'customMetadata', 'analysis', 'nonBlockingValidation'],
  manage: ['publications', 'publicationSites', 'readApiKey', 'masterData']
}
```

add these members to `operations` (after `getMetricAgg`):

```ts
  writeDescription: [
    {
      profiles: ['write_datasets'],
      name: 'update_dataset',
      description: 'Update the metadata or configuration of a dataset: title, description, keywords, license, topics, schema… Send only the fields to change. Publishing on portals, publications to remote catalogs, the read API key and master-data exposure are done with publish_dataset.',
      params: { id: datasetId },
      body: 'compact',
      bodyFields: datasetPatchFields.write
    },
    {
      profiles: ['manage_datasets'],
      name: 'publish_dataset',
      description: 'Change how a dataset is exposed: the portals it is published on (publicationSites), its publications to remote catalogs, its read API key and its master-data exposure. Send only the fields to change.',
      params: { id: datasetId },
      body: 'compact',
      bodyFields: datasetPatchFields.manage
    }
  ],
  deleteDataset: {
    profiles: ['manage_datasets'],
    name: 'delete_dataset',
    description: 'Delete a dataset permanently, with its data. Irreversible.',
    params: { id: datasetId }
  },
  getDatasetPermissions: {
    profiles: ['manage_datasets'],
    name: 'get_dataset_permissions',
    description: 'Read who can access a dataset: its permission entries for users, organizations, roles and departments, or for everyone.',
    params: { id: datasetId }
  },
  setDatasetPermissions: {
    profiles: ['manage_datasets'],
    name: 'set_dataset_permissions',
    description: 'Replace the whole list of permission entries of a dataset. Read it with get_dataset_permissions first, then send the complete new list.',
    params: { id: datasetId }
  }
```

and change the last line of the file from `} satisfies Record<string, AgentOperation>` to `} satisfies Record<string, AgentOperationAnnotation>`.

In `api/contract/dataset-private-api-docs.ts`:

1. Add the import next to the other contract imports:

```ts
import { operations as xAgent } from './x-agent.ts'
```

2. In the `patch` operation of `Object.assign(api.paths['/'], {`, add after `'x-permissionClass': 'write',`:

```ts
      'x-agent': xAgent.writeDescription,
```

3. In the `delete` operation right after it, add after `'x-permissionClass': 'admin',`:

```ts
      'x-agent': xAgent.deleteDataset,
```

4. Right after the line `api.paths['/permissions'] = structuredClone(permissionsDoc)`, add:

```ts
  // Annotated here rather than in permissionsDoc: the application documents share that object.
  api.paths['/permissions'].get['x-agent'] = xAgent.getDatasetPermissions
  api.paths['/permissions'].put['x-agent'] = xAgent.setDatasetPermissions
```

- [ ] **Step 4: Regenerate the goldens, read them, run the tests**

Run: `UPDATE_GOLDEN=1 npx playwright test --project unit tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
Read the diff of `tests/fixtures/agent-surface.manage_datasets.json`: `datafair_publish_dataset`'s `body` listing names only the four manage fields; `datafair_delete_dataset` has `destructiveHint: true`.
Run: `npx playwright test --project unit tests/features/agent-tools/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/contract/x-agent.ts api/contract/dataset-private-api-docs.ts tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts tests/fixtures/agent-surface.*.json
git commit -m "feat(agents): dataset write and manage tools, PATCH split into views"
```

---

### Task 4: Application read, write and manage tools

**Files:**
- Modify: `api/contract/x-agent.ts`, `api/contract/api-docs.ts`
- Test: `tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`, goldens `*_applications`

**Interfaces:**
- Consumes: `expectedTools`, `generators` (Task 2); `AgentOperationAnnotation` typing (Task 3).
- Produces: `applicationPatchFields: { write: string[], manage: string[] }`; operations `listApplications` (`list_account_applications`), `getApplication` (`describe_application`), `patchApplication` (views `update_application`, `publish_application`), `deleteApplication` (`delete_application`).

- [ ] **Step 1: Write the failing tests**

In the surface test file, change the three application entries of `expectedTools`:

```ts
  read_applications: ['datafair_list_account_applications', 'datafair_describe_application'],
  write_applications: ['datafair_list_account_applications', 'datafair_describe_application', 'datafair_update_application'],
  manage_applications: ['datafair_list_account_applications', 'datafair_describe_application', 'datafair_update_application', 'datafair_publish_application', 'datafair_delete_application']
```

and add inside the `describe`:

```ts
  test('places every application PATCH body field in exactly one view', async () => {
    const { apiDocs, xAgent } = await generators()
    const body = apiDocs(PUBLIC_URL).components.schemas.applicationPatch
    const placed = [...xAgent.applicationPatchFields.write, ...xAgent.applicationPatchFields.manage]
    assert.equal(new Set(placed).size, placed.length, 'no field is in two views')
    assert.deepEqual([...placed].sort(), Object.keys(body.properties).sort(), 'a new PATCH field must be placed in write or manage')
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx playwright test --project unit tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
Expected: FAIL — no application tool is annotated, `applicationPatchFields` is undefined.

- [ ] **Step 3: Add the annotations**

In `api/contract/x-agent.ts`, add after `datasetPatchFields`:

```ts
/** PATCH /applications/{id} body fields per tier, checked like datasetPatchFields. */
export const applicationPatchFields = {
  write: ['slug', 'title', 'summary', 'description', 'image', 'configuration', 'url', 'urlDraft', 'requestedPublicationSites', 'topics', 'partOf', 'extras', 'preferLargeDisplay', 'attachments'],
  manage: ['publications', 'publicationSites']
}

const applicationId: AgentParamOverride = { name: 'applicationId', description: 'The exact application ID from the "id" field in list_account_applications results.' }
```

and add these members to `operations`:

```ts
  listApplications: {
    profiles: ['read_applications'],
    name: 'list_account_applications',
    description: 'List the applications (data visualizations) of the active account and those shared with the current user, with optional text search. Returns id, title, status and last update.',
    params: {
      q: { description: 'Keywords for full-text search.' },
      dataset: { description: 'Restrict to the applications using these datasets (ids from list_account_datasets).' },
      size: { default: 10, maximum: 50 },
      page: { default: 1 },
      mine: { exclude: true },
      owner: { exclude: true },
      raw: { exclude: true },
      ids: { exclude: true },
      service: { exclude: true },
      visibility: { exclude: true }
    },
    fixed: { select: 'id,slug,title,summary,status,updatedAt,page' },
    response: { rows: '/results', concise: ['id', 'slug', 'title', 'summary', 'status', 'updatedAt', 'page'], detailed: true }
  },
  getApplication: {
    profiles: ['read_applications'],
    name: 'describe_application',
    description: 'Get the metadata and configuration of an application: title, description, base application, the datasets its configuration uses, publication status.',
    params: { id: applicationId }
  },
  patchApplication: [
    {
      profiles: ['write_applications'],
      name: 'update_application',
      description: 'Update the metadata or configuration of an application: title, description, topics, configuration… Send only the fields to change. Publishing on portals and publications to remote catalogs are done with publish_application.',
      params: { id: applicationId },
      bodyFields: applicationPatchFields.write
    },
    {
      profiles: ['manage_applications'],
      name: 'publish_application',
      description: 'Change where an application is exposed: the portals it is published on (publicationSites) and its publications to remote catalogs. Send only the fields to change.',
      params: { id: applicationId },
      bodyFields: applicationPatchFields.manage
    }
  ],
  deleteApplication: {
    profiles: ['manage_applications'],
    name: 'delete_application',
    description: 'Delete an application permanently. Irreversible.',
    params: { id: applicationId }
  },
```

In `api/contract/api-docs.ts`, add an `'x-agent'` line right after the `operationId` line of each of these operations:

```ts
          operationId: 'listApplications',
          'x-agent': xAgent.listApplications,
```

```ts
          operationId: 'getApplication',
          'x-agent': xAgent.getApplication,
```

```ts
          operationId: 'patchApplication',
          'x-agent': xAgent.patchApplication,
```

```ts
          operationId: 'deleteApplication',
          'x-agent': xAgent.deleteApplication,
```

- [ ] **Step 4: Regenerate the goldens, read them, run the tests**

Run: `UPDATE_GOLDEN=1 npx playwright test --project unit tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
Read the diff of `tests/fixtures/agent-surface.manage_applications.json`: `datafair_publish_application` exposes `applicationId`, `publications` and `publicationSites` only.
Run: `npx playwright test --project unit tests/features/agent-tools/`
Expected: PASS. If the lint refuses a description, fix the description, never the lint level.

- [ ] **Step 5: Commit**

```bash
git add api/contract/x-agent.ts api/contract/api-docs.ts tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts tests/fixtures/agent-surface.*.json
git commit -m "feat(agents): application read, write and manage tools"
```

---

### Task 5: The index and the document, composed

**Files:**
- Create: `tests/features/agent-tools/agents-composition.unit.spec.ts`

**Interfaces:**
- Consumes: `agentsIndex` (Task 1), `apiDocs` with all annotations (Tasks 2-4).

- [ ] **Step 1: Write the tests**

`tests/features/agent-tools/agents-composition.unit.spec.ts`:

```ts
/**
 * The deployment index and data-fair's document composed by `@data-fair/openapi-mcp`, the way
 * the `mcp` server and the agents service consume them: the umbrellas reach data-fair's cells,
 * the deprecated `explore` alias still yields the catalog tools, and data-fair declares nothing
 * outside the index vocabulary.
 */
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { createComposer } from '@data-fair/openapi-mcp'

process.env.NODE_CONFIG_DIR ??= path.resolve(import.meta.dirname, '../../../api/config')

const PUBLIC_URL = 'https://example.test/data-fair'
const INDEX_URL = `${PUBLIC_URL}/api/v1/agents/index.json`

const composer = async () => {
  const { agentsIndex } = await import('../../../api/contract/agents-index.ts')
  const apiDocs = (await import('../../../api/contract/api-docs.ts')).default
  const index = agentsIndex(PUBLIC_URL, { publicUrl: PUBLIC_URL })
  const bodies: Record<string, unknown> = { [INDEX_URL]: index, [index.services[0].openapi]: apiDocs(PUBLIC_URL) }
  const fetchFn = (async (input: RequestInfo | URL) => {
    const url = input instanceof Request ? input.url : String(input)
    const body = bodies[url]
    return body ? new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } }) : new Response('not found', { status: 404 })
  }) as typeof fetch
  return createComposer(INDEX_URL, { fetch: fetchFn, lint: 'error' })
}

const names = (c: { toolSet: { tools: { name: string }[] } }) => c.toolSet.tools.map(t => t.name).sort()

test.describe('agents index composed with the data-fair document', () => {
  test('data-fair declares no profile outside the index vocabulary', async () => {
    const c = await composer()
    assert.deepEqual(c.services.map(s => [s.id, s.status, s.warnings]), [['data-fair', 'ok', undefined]])
  })

  test('the deprecated explore alias yields the catalog tools', async () => {
    const c = await composer()
    assert.deepEqual(names(await c.compose(['explore'])), names(await c.compose(['catalog'])))
    assert.ok(names(await c.compose(['explore'])).includes('datafair_list_datasets'))
  })

  test('the default profile is catalog', async () => {
    const c = await composer()
    assert.deepEqual(names(await c.compose()), names(await c.compose(['catalog'])))
  })

  test('the write umbrella reaches the write cells and nothing of manage', async () => {
    const c = await composer()
    const write = names(await c.compose(['write']))
    assert.ok(write.includes('datafair_update_dataset'))
    assert.ok(write.includes('datafair_update_application'))
    assert.ok(write.includes('datafair_list_account_datasets'), 'write includes read')
    assert.ok(!write.some(n => /publish|delete|permissions/.test(n)), 'no manage tool in write')
    assert.ok(!write.includes('datafair_list_datasets'), 'catalog is not in the grid')
  })

  test('catalog and the manage umbrella compose together', async () => {
    const c = await composer()
    const both = await c.compose(['catalog', 'manage'])
    assert.deepEqual(both.services.map(s => s.status), ['ok'])
    assert.ok(names(both).includes('datafair_list_datasets'))
    assert.ok(names(both).includes('datafair_list_account_datasets'))
  })
})
```

- [ ] **Step 2: Run the tests**

Run: `npx playwright test --project unit tests/features/agent-tools/agents-composition.unit.spec.ts`
Expected: PASS (5 tests). These test the integration of Tasks 1-4 rather than new code: verify each would fail on a regression by temporarily changing `includes: ['catalog']` to `includes: ['read']` in `vocabulary()`'s `explore` entry — the alias test must fail — then restore it.

- [ ] **Step 3: Commit**

```bash
git add tests/features/agent-tools/agents-composition.unit.spec.ts
git commit -m "test(agents): compose the index with the data-fair document"
```

---

### Task 6: Documentation

**Files:**
- Modify: `docs/architecture/agent-profiles.md` (status line, section 7 "data-fair", section 10)
- Modify: `docs/architecture/agent-integration.md` (section 11)

- [ ] **Step 1: Update `agent-profiles.md`**

Replace the status line `Status: design, agreed 2026-10-02. Nothing below the "Current state" section is implemented yet.` with:

```markdown
Status: design agreed 2026-10-02. Rollout step 1 (openapi-mcp 0.3.0) and step 2 (data-fair's
vocabulary and annotations, metrics) are implemented; see section 10.
```

At the end of the "### data-fair" subsection of section 7, add:

```markdown
Done in step 2, except what needs API work first: the portal-scoped `list_applications` (data-fair
has no `/catalog/applications` route), `PUT /owner`, application permissions and settings (not in
the root document yet), and creation tools, whose bodies deserve their own design.
```

In section 10, append ` — done` to items 1 and 2.

- [ ] **Step 2: Update §11 of `agent-integration.md`**

Replace the first paragraph of section 11 (starting "Independently of the browser tools above") with:

```markdown
Independently of the browser tools above, the served OpenAPI document carries `x-agent`
annotations (`api/contract/x-agent.ts`) that `@data-fair/openapi-mcp` turns into tools, grouped by
the profiles of [agent-profiles.md](./agent-profiles.md): `catalog` (what a portal publishes),
and `read`/`write`/`manage` for datasets and applications. They are consumed by the stack's MCP
server (`data-fair/mcp`), by coding agents and by the agents service's autonomous runs; the
browser assistant does not use them yet.
```

and replace the paragraph starting "The agent-facing surface is pinned in CI" with:

```markdown
The agent-facing surface is pinned in CI: `tests/features/agent-tools/api-docs-agent-surface.unit.spec.ts`
loads the generator with `lint: 'error'` and diffs one golden per profile
(`tests/fixtures/agent-surface.<profile>.json`); `agents-composition.unit.spec.ts` composes the
index with the document. Change an annotation, regenerate with `UPDATE_GOLDEN=1`, and the diff is
what the reviewer reads. Admin-only routes carry no annotation, so the surface does not vary with
the session.
```

Remove the sentence "`explore` is being retired there." from the paragraph that points to agent-profiles.md.

- [ ] **Step 3: Run the unit suite and lint**

Run: `npx playwright test --project unit tests/features/agent-tools/ && npx eslint api/contract tests/features/agent-tools`
Expected: PASS, no lint error.

- [ ] **Step 4: Commit**

```bash
git add docs/architecture/agent-profiles.md docs/architecture/agent-integration.md
git commit -m "docs: agent profiles step 2 is implemented"
```

---

### Task 7: metrics on `read_metrics`

**Repository:** `~/data-fair/metrics`, branch `feat-agent-api-docs`. The dev dependencies (`docker compose up -d --wait`) must be running for `npm test`; if the developer's API runs on port 6219, ask them to stop it.

**Files:**
- Modify: `api/contract/api-docs.ts`, `test-it/03-agent-api-docs.ts`, `package.json`, `package-lock.json`
- Rename: `test-it/fixtures/agent-surface.explore.json` → `test-it/fixtures/agent-surface.read_metrics.json` (regenerated)

- [ ] **Step 1: Upgrade openapi-mcp**

Run: `npm install -D @data-fair/openapi-mcp@^0.3.0`

- [ ] **Step 2: Write the failing test change**

In `test-it/03-agent-api-docs.ts`:
- change `const goldenPath = path.resolve(import.meta.dirname, 'fixtures/agent-surface.explore.json')` to `const goldenPath = path.resolve(import.meta.dirname, 'fixtures/agent-surface.read_metrics.json')`;
- replace every `profiles: ['explore']` with `profiles: ['read_metrics']` (two occurrences);
- in the test "serves the document anonymously…", add `assert.deepEqual(Object.keys(res.data['x-agent'].profiles), ['read_metrics'])`.

Run: `NODE_ENV=test node --test-force-exit --test --test-name-pattern="surface" test-it/03-agent-api-docs.ts`
Expected: FAIL — `unknown profile "read_metrics" (declared: explore)`.

- [ ] **Step 3: Move the annotations**

In `api/contract/api-docs.ts`:
- replace the root `profiles: { explore: { … } }` member with:

```ts
  profiles: {
    read_metrics: {
      title: { en: 'Read — audience metrics', fr: "Lire — métriques d'audience" },
      description: { en: 'Review the audience of the account\'s datasets and applications.', fr: 'Analyser l\'audience des jeux de données et applications du compte.' }
    }
  },
```

- in the `metrics-review` skill, replace `profiles: ['explore']` with `profiles: ['read_metrics']`;
- in `aggregateRequests`, replace `profiles: ['explore']` with `profiles: ['read_metrics']`;
- in the header comment, replace `agent-surface.explore.json` with `agent-surface.read_metrics.json`.

- [ ] **Step 4: Regenerate the golden and run the suite**

Run: `git rm test-it/fixtures/agent-surface.explore.json && UPDATE_GOLDEN=1 NODE_ENV=test node --test-force-exit --test --test-name-pattern="surface" test-it/03-agent-api-docs.ts`
Read `test-it/fixtures/agent-surface.read_metrics.json`: `"profiles": ["read_metrics"]`, the one tool `metrics_aggregate_requests`.
Run: `npx tsc && npm run lint && npm test`
Expected: PASS, every test.

- [ ] **Step 5: Commit**

```bash
git add api/contract/api-docs.ts test-it/03-agent-api-docs.ts test-it/fixtures package.json package-lock.json
git commit -m "feat(api): serve the agent tool under the read_metrics profile"
```
