# Publication sites — shared with departments — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `sharedWithDepartments: string[]` on publication sites so org-root admins can grant publication rights to named departments of their organisation. The portal admin UI is the source of truth; data-fair enforces the permission gate and displays a read-only label.

**Architecture:** Schema change in `api/contract/publication-sites.js` (data-fair) plus new top-level field in `api/types/portal/schema.js` (portals). Single added clause in the dept-boundary check of `api/src/misc/utils/publication-sites.ts` (data-fair). Portal sync overwrites `sharedWithDepartments` on each upsert, same as other structural fields. UI changes limited to the dataset and application publication panels (data-fair) and a new pane on the portal admin page (portals).

**Tech Stack:** Node.js, TypeScript, Playwright for tests, Vue 3 + VJSF for UI, Mongo. Two git worktrees, both manipulated in the same working session:
- Data-fair worktree: `/home/alban/data-fair/data-fair_feat-publication-sites-permissions-mode`
- Portals worktree: `/home/alban/data-fair/portals_feat-portals-shared-with-deps`

Spec: [`docs/superpowers/specs/2026-04-17-publication-sites-shared-departments-design.md`](../specs/2026-04-17-publication-sites-shared-departments-design.md)

---

## File structure

**Data-fair** (paths relative to `data-fair_feat-publication-sites-permissions-mode`):

- Modify `api/contract/publication-sites.js` — add `sharedWithDepartments` schema entry (§1 in spec).
- Modify `api/src/misc/utils/publication-sites.ts` — extend the two dept-boundary branches in `applyPatch` with the `isShared` clause (§2).
- Modify `api/src/settings/router.ts` — POST handler: defensive 400 when `req.owner.department` set and body has non-empty `sharedWithDepartments`. GET handler: decorate response with `sharedWithThisDepartment` for the requesting dept user (§3).
- Modify `ui/src/components/dataset/dataset-publication-sites.vue` — extend `canPublish` predicate, sort, and visual label (§4).
- Modify `ui/src/components/application/application-publication-sites.vue` — mirror the three edits.
- Create `tests/features/applications/publication-sites-shared.api.spec.ts` — new tests for the feature.
- Re-run `npm run build-types` after contract edits to regenerate `#api/types`.

**Portals** (paths relative to `portals_feat-portals-shared-with-deps`):

- Modify `api/types/portal/schema.js` — add top-level `sharedWithDepartments`.
- Modify `api/src/portals/service.ts` — `getPublicationSite` emits the new field.
- Modify `api/src/portals/router.ts` (or `service.patchPortal`) — accept `sharedWithDepartments` in the patch, require org-root admin on the portal owner, refuse when `portal.owner.department` is set.
- Modify a portal admin pane — minimum viable editor using an array-of-strings VJSF widget. Exact file chosen during Task 13.

---

## Phase 1 — Data-fair schema + permission gate

### Task 1: Add `sharedWithDepartments` to the publication-sites contract

**Files:**
- Modify: `api/contract/publication-sites.js:93` (insert before the closing of `properties`)

- [ ] **Step 1: Edit the contract**

Open `api/contract/publication-sites.js`. Inside the `properties` object (after the existing `settings` property), add:

```js
      sharedWithDepartments: {
        type: 'array',
        title: 'Départements partagés',
        description: 'Départements dont les administrateurs peuvent publier sur ce portail, comme s\'ils en étaient propriétaires.',
        items: { type: 'string' },
        default: [],
        readOnly: !admin
      }
```

Keep the existing trailing comma / bracket style consistent with neighbouring properties.

- [ ] **Step 2: Regenerate types**

Run: `npm run build-types`
Expected: exits 0 and updates `api/types/settings/.type/**` with the new optional property on `publicationSites` items.

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run check-types`
Expected: exits 0 (no TS errors introduced).

- [ ] **Step 4: Commit**

```bash
git add api/contract/publication-sites.js api/types/settings
git commit -m "feat(api): add sharedWithDepartments to publication site contract"
```

---

### Task 2: Write failing test for dept admin publishing on a shared org-root site

**Files:**
- Create: `tests/features/applications/publication-sites-shared.api.spec.ts`

- [ ] **Step 1: Write the new spec file**

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'

const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser4Org = await axiosAuth('test_user4@test.com', 'test_org1')
const testUser6Org = await axiosAuth('test_user6@test.com', 'test_org1')

test.describe('publication sites shared with departments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('department admin can publish on an org-root site shared with their department', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      sharedWithDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:shared-portal'] })

    const fetched = (await testUser4Org.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.deepEqual(fetched.publicationSites, ['data-fair-portals:shared-portal'])
  })

  test('department admin still fails to publish on org-root site NOT shared with their department', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'other-portal',
      url: 'http://portal.com',
      sharedWithDepartments: ['dep2']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await assert.rejects(
      testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:other-portal'] }),
      (err: any) => err.status === 403
    )
  })

  test('department contrib cannot publish on a shared org-root non-staging site', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      sharedWithDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await assert.rejects(
      testUser6Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:shared-portal'] }),
      (err: any) => err.status === 403
    )
  })
})
```

`testUser4Org` is dept admin of dep1 (also dep2), `testUser6Org` is dept contrib of dep1, `testUser1Org` is org-root admin — verified in `dev/resources/organizations.json`.

- [ ] **Step 2: Run only the new spec, expect the first test to FAIL**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts`
Expected: the first test fails with `err.status === 403` from the current dept-boundary check; the second test passes (still 403, no change needed); the third test passes (still 403).

**Do not commit yet** — the failing test drives the next task.

---

### Task 3: Implement the `isShared` clause in `applyPatch`

**Files:**
- Modify: `api/src/misc/utils/publication-sites.ts:50` and `:74`

- [ ] **Step 1: Edit the publish branch (line ~50)**

Replace the existing condition at line 50:

```ts
      if (!sessionState.user.adminMode && !publicationSiteInfo.settings?.staging && resource.owner.type === 'organization' && sessionState.account?.type === 'organization' && sessionState.account.id === resource.owner.id && !publicationSiteInfo.department && sessionState.account.department) {
        throw httpError(403, 'fail to publish: publication site does not belong to user department')
      }
```

with:

```ts
      const isSharedWithUserDept = !!sessionState.account.department
        && publicationSiteInfo.sharedWithDepartments?.includes(sessionState.account.department)
      if (!sessionState.user.adminMode && !publicationSiteInfo.settings?.staging && resource.owner.type === 'organization' && sessionState.account?.type === 'organization' && sessionState.account.id === resource.owner.id && !publicationSiteInfo.department && sessionState.account.department && !isSharedWithUserDept) {
        throw httpError(403, 'fail to publish: publication site does not belong to user department')
      }
```

- [ ] **Step 2: Edit the unpublish branch (line ~74)**

Mirror the same change — compute `isSharedWithUserDept` once at the top of the loop body, or duplicate inline. Use the same scheme as the publish branch to keep them symmetric.

```ts
      const isSharedWithUserDept = !!sessionState.account.department
        && publicationSiteInfo.sharedWithDepartments?.includes(sessionState.account.department)
      if (!sessionState.user.adminMode && !publicationSiteInfo.settings?.staging && resource.owner.type === 'organization' && sessionState.account?.type === 'organization' && sessionState.account.id === resource.owner.id && !publicationSiteInfo.department && sessionState.account.department && !isSharedWithUserDept) {
        throw httpError(403, 'fail to unpublish: publication site does not belong to user department')
      }
```

- [ ] **Step 3: Run the new spec again**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts`
Expected: all three tests now pass.

- [ ] **Step 4: Run the existing publication-sites suite to ensure no regression**

Run: `npx playwright test --project api tests/features/applications/publication-sites.api.spec.ts`
Expected: all existing tests still pass. The `department admin should fail to publish dataset on org site` test is the one most sensitive to this change — it has no `sharedWithDepartments`, so `isSharedWithUserDept` is false and the branch still throws.

- [ ] **Step 5: Commit**

```bash
git add api/src/misc/utils/publication-sites.ts tests/features/applications/publication-sites-shared.api.spec.ts
git commit -m "feat(api): allow publication on org-root sites shared with user department"
```

---

### Task 4: Write failing test for the unpublish "no relaxation" rule

**Files:**
- Modify: `tests/features/applications/publication-sites-shared.api.spec.ts` (add one test)

- [ ] **Step 1: Append the test**

Add inside the same `describe`:

```ts
  test('revoking the share traps already-published resources: dept admin can no longer unpublish', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      sharedWithDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dataset = (await testUser4Org.post('/api/v1/datasets', { isRest: true, title: 'ds', schema: [] })).data
    await testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: ['data-fair-portals:shared-portal'] })

    // org-root admin revokes the share
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', {
      ...portal,
      sharedWithDepartments: []
    })

    // dept admin can no longer remove the publication
    await assert.rejects(
      testUser4Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: [] }),
      (err: any) => err.status === 403
    )

    // org-root admin can still clean up
    await testUser1Org.patch(`/api/v1/datasets/${dataset.id}`, { publicationSites: [] })
  })
```

- [ ] **Step 2: Run only that test**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts -g "revoking the share traps"`
Expected: passes out of the box. This is an affirmative test that the *non-cascading, non-relaxing* revocation behaviour (spec Q4=A) holds naturally given the `isShared` logic already in place.

If it does NOT pass: investigate — it likely means the share was not actually overwritten by the second POST (check Task 7 on overwrite semantics) or the unpublish branch does not apply the same `isSharedWithUserDept` clause.

- [ ] **Step 3: Commit**

```bash
git add tests/features/applications/publication-sites-shared.api.spec.ts
git commit -m "test(api): lock in non-cascading revoke behaviour for shared publication sites"
```

---

### Task 5: Write failing test for the defensive POST validation

**Files:**
- Modify: `tests/features/applications/publication-sites-shared.api.spec.ts` (one more test)

- [ ] **Step 1: Append the test**

```ts
  test('posting sharedWithDepartments on a dept-scoped settings doc is refused', async () => {
    await assert.rejects(
      testUser4Org.post('/api/v1/settings/organization/test_org1:dep1/publication-sites', {
        type: 'data-fair-portals',
        id: 'some-portal',
        url: 'http://portal.com',
        sharedWithDepartments: ['dep2']
      }),
      (err: any) => err.status === 400
    )
  })
```

- [ ] **Step 2: Run only that test, expect it to FAIL (currently 200)**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts -g "dept-scoped settings doc is refused"`
Expected: currently fails (the server accepts the payload with 200).

---

### Task 6: Implement the defensive POST validation

**Files:**
- Modify: `api/src/settings/router.ts:384` (inside the POST `/publication-sites` handler, before the existing `mongo.settings.findOne`)

- [ ] **Step 1: Add the check at the top of the handler body**

Locate the line:

```ts
router.post('/:type/:id/publication-sites', isOwnerAdmin, async (req, res) => {
  assertSettingsRequest(req)
  debugPublicationSites('post site', req.body)
  let settings = (await mongo.settings.findOne(req.ownerFilter, { projection: { _id: 0 } })) as Settings | DepartmentSettings
```

Insert after `debugPublicationSites('post site', req.body)`:

```ts
  if (req.owner.department && req.body.sharedWithDepartments && req.body.sharedWithDepartments.length) {
    throw httpError(400, 'sharedWithDepartments is only allowed on org-root publication sites')
  }
```

`httpError` is already imported at the top of the file (line 7).

- [ ] **Step 2: Run the new test, expect PASS**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts -g "dept-scoped settings doc is refused"`
Expected: passes.

- [ ] **Step 3: Run the full new spec file + existing settings suite**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts tests/features/settings/settings.api.spec.ts`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add api/src/settings/router.ts tests/features/applications/publication-sites-shared.api.spec.ts
git commit -m "feat(api): refuse sharedWithDepartments on dept-scoped settings"
```

---

### Task 7: Decorate GET `/publication-sites` response with `sharedWithThisDepartment`

**Files:**
- Modify: `api/src/settings/router.ts:376-379` (inside the GET handler loop)

- [ ] **Step 1: Write the failing test**

Append to `tests/features/applications/publication-sites-shared.api.spec.ts`:

```ts
  test('GET publication-sites decorates shared sites with sharedWithThisDepartment for matching dept users', async () => {
    const portal = {
      type: 'data-fair-portals',
      id: 'shared-portal',
      url: 'http://portal.com',
      sharedWithDepartments: ['dep1']
    }
    await testUser1Org.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    const dep1List = (await testUser4Org.get('/api/v1/settings/organization/test_org1:dep1/publication-sites')).data
    const shared = dep1List.find((s: any) => s.id === 'shared-portal')
    assert.ok(shared)
    assert.equal(shared.sharedWithThisDepartment, true)

    // org-root view has the raw array but no computed flag
    const orgList = (await testUser1Org.get('/api/v1/settings/organization/test_org1/publication-sites')).data
    const orgShared = orgList.find((s: any) => s.id === 'shared-portal')
    assert.deepEqual(orgShared.sharedWithDepartments, ['dep1'])
    assert.equal(orgShared.sharedWithThisDepartment, undefined)
  })
```

- [ ] **Step 2: Run test, expect FAIL**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts -g "decorates shared sites"`
Expected: fails (no decoration yet).

- [ ] **Step 3: Implement the decoration**

In `api/src/settings/router.ts`, modify the GET handler loop (around line 376) from:

```ts
  for (const settings of settingsArray) {
    for (const publicationSite of settings.publicationSites || []) {
      if (isDepartmentSettings(settings)) publicationSite.department = settings.department
      publicationSites.push(publicationSite)
    }
  }
```

to:

```ts
  for (const settings of settingsArray) {
    for (const publicationSite of settings.publicationSites || []) {
      if (isDepartmentSettings(settings)) publicationSite.department = settings.department
      if (req.owner.department && publicationSite.sharedWithDepartments?.includes(req.owner.department)) {
        (publicationSite as any).sharedWithThisDepartment = true
      }
      publicationSites.push(publicationSite)
    }
  }
```

The `as any` cast is acceptable here because `sharedWithThisDepartment` is an ephemeral response-only decoration, not part of the persistable type.

- [ ] **Step 4: Run test again, expect PASS**

Run: `npx playwright test --project api tests/features/applications/publication-sites-shared.api.spec.ts -g "decorates shared sites"`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add api/src/settings/router.ts tests/features/applications/publication-sites-shared.api.spec.ts
git commit -m "feat(api): expose sharedWithThisDepartment flag on publication-sites GET"
```

---

## Phase 2 — Data-fair UI

### Task 8: Update the dataset publication panel

**Files:**
- Modify: `ui/src/components/dataset/dataset-publication-sites.vue`

- [ ] **Step 1: Extend `canPublish` (line 221-224)**

Change:

```ts
const canPublish = (site: PublicationSite) => {
  const warnings = sitesWarnings.value[`${site.type}:${site.id}`]
  return warnings && warnings.length === 0 && can('writePublicationSites').value && (!account.value.department || account.value.department === site.department)
}
```

to:

```ts
const canPublish = (site: PublicationSite) => {
  const warnings = sitesWarnings.value[`${site.type}:${site.id}`]
  return warnings && warnings.length === 0 && can('writePublicationSites').value && (
    !account.value.department
    || account.value.department === site.department
    || (site as any).sharedWithThisDepartment
  )
}
```

- [ ] **Step 2: Extend the sort predicate (line 158-172)**

In `publicationSites = computed(() => {...})`, extend the first two conditions so shared sites sort alongside dept-owned ones. Change:

```ts
    if (dataset.value?.owner.department && dataset.value?.owner.department === ps1.department && ps1.department !== ps2.department) {
      return -1
    }
    if (dataset.value?.owner.department && dataset.value?.owner.department === ps2.department && ps1.department !== ps2.department) {
      return 1
    }
```

to (adds shared check in the priority group):

```ts
    const ps1Priority = !!dataset.value?.owner.department && (dataset.value.owner.department === ps1.department || (ps1 as any).sharedWithThisDepartment)
    const ps2Priority = !!dataset.value?.owner.department && (dataset.value.owner.department === ps2.department || (ps2 as any).sharedWithThisDepartment)
    if (ps1Priority && !ps2Priority) return -1
    if (!ps1Priority && ps2Priority) return 1
```

(The remaining two `if` statements in the sort function stay as-is.)

- [ ] **Step 3: Add the "shared" subtitle row**

In the template, after the existing `v-list-item-subtitle` at lines 39-45 (the owner - department line), insert:

```vue
            <v-list-item-subtitle
              v-if="(site as any).sharedWithThisDepartment"
              class="mb-2"
            >
              {{ t('sharedPortal') }}
            </v-list-item-subtitle>
```

Add the translations to the `<i18n>` block:

```yaml
fr:
  sharedPortal: Portail partagé avec votre département
en:
  sharedPortal: Portal shared with your department
```

- [ ] **Step 4: Typecheck the UI**

Run: `npm -w ui run check-types`
Expected: exits 0.

- [ ] **Step 5: Run the UI e2e publication-sites suite**

Run: `npx playwright test --project e2e tests/features/ui/publication-sites.e2e.spec.ts`
Expected: existing tests still pass. If any fail due to the subtitle rearrangement or sort change, update the selectors in those tests to match.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/dataset/dataset-publication-sites.vue
git commit -m "feat(ui): allow shared-department publication from dataset panel"
```

---

### Task 9: Update the application publication panel

**Files:**
- Modify: `ui/src/components/application/application-publication-sites.vue`

- [ ] **Step 1: Apply the same three edits as Task 8**

Mirror: (1) `canPublish` extension, (2) sort priority with shared, (3) "Portail partagé" subtitle row and i18n keys.

If any of the three site hooks differs in name/location from `dataset-publication-sites.vue`, adjust to local naming but keep semantics identical.

- [ ] **Step 2: Typecheck**

Run: `npm -w ui run check-types`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/application/application-publication-sites.vue
git commit -m "feat(ui): allow shared-department publication from application panel"
```

---

### Task 10: Add one UI e2e test for the shared-dept label and switch

**Files:**
- Modify: `tests/features/ui/publication-sites.e2e.spec.ts` (append one test)

- [ ] **Step 1: Write the e2e test**

Open the existing UI spec file and add a test using the same fixtures/logins as the surrounding tests. Pattern:

1. Log in as `test_user1@test.com` (org-root admin), seed a publication site `{ type: 'data-fair-portals', id: 'shared-portal', url: '…', sharedWithDepartments: ['dep1'] }` via `request.post('/api/v1/settings/organization/test_org1/publication-sites', …)`.
2. Log in as `test_user4@test.com` (dep1 admin).
3. Create a dataset.
4. Navigate to the dataset publication panel.
5. Assert that the row for `shared-portal` displays the localized "Portail partagé" text.
6. Assert that the publish `v-switch` for that row is enabled (use `await expect(locator).toBeEnabled()`).
7. Assert that toggling it triggers a successful PATCH (no 403).

Read the existing tests in that file to mirror the login and navigation helpers; do not invent a new pattern.

- [ ] **Step 2: Run the test**

Run: `npx playwright test --project e2e tests/features/ui/publication-sites.e2e.spec.ts -g "shared"`
Expected: passes.

- [ ] **Step 3: Commit**

```bash
git add tests/features/ui/publication-sites.e2e.spec.ts
git commit -m "test(e2e): shared publication site is labelled and publishable for dept admin"
```

---

## Phase 3 — Portals schema + service + router

From here the working directory is the **portals worktree**: `/home/alban/data-fair/portals_feat-portals-shared-with-deps`.

### Task 11: Add `sharedWithDepartments` to the portal schema

**Files:**
- Modify: `api/types/portal/schema.js`

- [ ] **Step 1: Locate the top-level portal properties**

Open `api/types/portal/schema.js` and find the top-level `properties` block containing entries like `owner`, `ingress`, `staging`, `isReference`.

- [ ] **Step 2: Add the field alongside `staging`**

Insert after the `staging` property (preserve schema style, including `default`):

```js
    sharedWithDepartments: {
      type: 'array',
      title: 'Departments with publication access',
      description: 'Departments of the portal owner organisation whose admins may publish on this portal as if they were co-owners.',
      items: { type: 'string' },
      default: []
    },
```

- [ ] **Step 3: Regenerate types**

Run: `npm run build-types`
Expected: exits 0.

- [ ] **Step 4: Typecheck**

Run: `npm run check-types`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add api/types/portal
git commit -m "feat(api): add sharedWithDepartments to portal schema"
```

---

### Task 12: Propagate the field through the sync payload

**Files:**
- Modify: `api/src/portals/service.ts:122-139` (the `getPublicationSite` function)

- [ ] **Step 1: Write a unit-ish test or integration test**

If there's an existing tests folder for portals (`tests/` or similar), add a test that calls `getPublicationSite(portalFixture)` where `portalFixture.sharedWithDepartments = ['depA']` and asserts the returned object has `sharedWithDepartments: ['depA']`. If no such harness exists, skip the unit test (it's a one-line pure function) and rely on the integration covered in Task 14.

- [ ] **Step 2: Edit `getPublicationSite`**

At the end of the publicationSite object construction (just before `return publicationSite`), add:

```ts
  publicationSite.sharedWithDepartments = portal.sharedWithDepartments || []
```

Use the default `[]` explicitly so a portal whose share list has been cleared actively propagates the empty list to data-fair on the next sync.

- [ ] **Step 3: Typecheck**

Run: `npm run check-types`
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add api/src/portals/service.ts
git commit -m "feat(api): propagate sharedWithDepartments through portal publication-site sync"
```

---

### Task 13: Accept the field in the portal patch with the right authorization

**Files:**
- Modify: `api/src/portals/service.ts` (`patchPortal` — around line 39-56 per the exploration report).
- Modify: `api/src/portals/router.ts` if necessary to route the payload through.

- [ ] **Step 1: Locate `patchPortal`**

Open `api/src/portals/service.ts` and find the `patchPortal` function. Read lines 39-75 to understand how `patch` fields are validated and merged today.

- [ ] **Step 2: Ensure `sharedWithDepartments` is an accepted patch key**

If `patchPortal` has an explicit allow-list of patchable fields, add `sharedWithDepartments`. If it merges the patch body without filtering, no change needed here — the schema validation added in Task 11 will enforce the shape.

- [ ] **Step 3: Enforce the authorization rule**

When the incoming patch includes `sharedWithDepartments`, require `assertAccountRole(session, portal.owner, 'admin')` — org-root admin on the portal owner. This is likely already what `patchPortal` does, but verify by reading the existing logic.

- [ ] **Step 4: Enforce the "owner has no department" validation**

Immediately before persisting the patch, if the patch carries a non-empty `sharedWithDepartments` array AND `portal.owner.department` is set, throw an `httpError(400, 'sharedWithDepartments is only allowed when the portal owner is the organisation root')`.

- [ ] **Step 5: Add tests**

In the portals tests folder (follow whatever convention `patchPortal` tests already use; if none, create the first one), assert:

- Org-root admin of the portal owner can PATCH `{ sharedWithDepartments: ['dep1'] }` → 200.
- Dept admin (not an org-root admin of the owner) gets 403.
- Patch with `sharedWithDepartments: ['dep1']` on a portal whose `owner.department` is `depX` returns 400.

- [ ] **Step 6: Run tests**

Run the appropriate portals test command (check `portals/package.json` for the script — likely `npm test` or `npx playwright test`).
Expected: the three new tests pass and no existing portal test regresses.

- [ ] **Step 7: Commit**

```bash
git add api/src/portals/service.ts api/src/portals/router.ts tests/…
git commit -m "feat(api): accept sharedWithDepartments patch on portal with org-root admin gate"
```

(The `tests/…` placeholder will resolve to the actual test file path chosen in Step 5.)

---

## Phase 4 — Portals admin UI

### Task 14: Add the editor pane

**Files:**
- Modify: pick the portal admin page that hosts structural settings (e.g. `ui/src/pages/portals/[id]/ingress.vue` or a sibling pane per the exploration report). Investigate first by reading `ui/src/pages/portals/[id]/` and `ui/src/components/portal/portal-actions.vue:199-213`.

- [ ] **Step 1: Decide the host page**

Read `ui/src/pages/portals/[id]/ingress.vue` and `ui/src/components/portal/portal-actions.vue`. If the ingress page is super-admin only (via `assertAdminMode`), do **not** put the share-list editor there — it needs to be reachable for org-root admins of the portal owner. A dedicated pane or a new section of the portal edition page is the right host; follow the nearest existing admin-level (not super-admin) pattern.

- [ ] **Step 2: Implement the editor**

Bind to the portal's top-level `sharedWithDepartments` with a VJSF form using the schema fragment already registered in `api/types/portal`. Minimal widget: array of strings; each string is a department id. Match the density and styling of the neighbouring form.

- [ ] **Step 3: Hide the editor when the portal owner has a department**

Gate the `v-if` on `!portal.owner.department`.

- [ ] **Step 4: Wire the PATCH**

On save, PATCH the portal with `{ sharedWithDepartments }` via the existing portal patch endpoint (the one Task 13 extended).

- [ ] **Step 5: Typecheck and lint**

Run: `npm -w ui run check-types && npm -w ui run lint`
Expected: both exit 0.

- [ ] **Step 6: Commit**

```bash
git add ui/src/…
git commit -m "feat(ui): admin editor for portal sharedWithDepartments"
```

---

## Phase 5 — End-to-end validation

### Task 15: End-to-end smoke across both services

- [ ] **Step 1: Sync a portal with a share list through the running dev env**

With the portals and data-fair dev servers running (managed by the user via zellij), create a portal owned by `test_org1` with `sharedWithDepartments: ['dep1']`. This triggers the existing sync to data-fair, which must land the field in the settings document.

Verify via: `curl -s -b "$COOKIE" '$PUBLIC_URL/data-fair/api/v1/settings/organization/test_org1/publication-sites' | jq '.[] | select(.id == "<portal-id>")'`
Expected: the response includes `sharedWithDepartments: ["dep1"]`.

- [ ] **Step 2: Publish as a dep1 admin via the UI**

As `test_user4`, log into the data-fair back-office in `test_org1:dep1` context, create a dataset, and publish it on the shared portal. Expect success (no 403 toast).

- [ ] **Step 3: Unshare and verify the trap**

As `test_user1` (org-root admin), open the portal admin in the portals UI and clear `sharedWithDepartments`. Reload the publication panel for the previously-published dataset and try to unpublish — expect a 403 / disabled switch. As `test_user1`, unpublish successfully.

- [ ] **Step 4: Run the full relevant test suites**

From the data-fair worktree:

```bash
npx playwright test --project api tests/features/applications/publication-sites.api.spec.ts tests/features/applications/publication-sites-shared.api.spec.ts tests/features/settings/settings.api.spec.ts
npx playwright test --project e2e tests/features/ui/publication-sites.e2e.spec.ts
```

Expected: all green.

From the portals worktree, run the relevant portal tests.

- [ ] **Step 5: Final lint**

From the data-fair worktree: `npm run lint`. From the portals worktree: equivalent lint script.
Expected: exit 0 in both.

- [ ] **Step 6: Update the architecture doc**

Append a short "Shared with departments" subsection to `docs/architecture/publication-sites.md` in the data-fair worktree, pointing at the spec. This is a doc touch-up, not a new document.

- [ ] **Step 7: Final commit on each worktree**

If there is any tail-end doc or lint fix, commit it:

```bash
git add docs/architecture/publication-sites.md
git commit -m "docs: note sharedWithDepartments in publication-sites architecture"
```

---

## Self-review notes

- Spec §1 → Task 1 (contract), Task 11 (portal schema). ✓
- Spec §2 permission logic → Tasks 2-3 (test + implementation in both branches). ✓
- Spec §3 read/list + overwrite semantics → Tasks 4 (revoke test), 7 (decoration). Overwrite is relied upon implicitly — the existing POST handler at `settings/router.ts:418` already assigns from the request body; no code change needed. Task 4 verifies this behaviourally. ✓
- Spec §4 defensive validation → Tasks 5-6. ✓
- Spec §5 UI → Tasks 8-10. ✓
- Spec portals section → Tasks 11-14. ✓
- Spec testing → Tasks 2, 4, 5, 7, 10, 13. ✓
