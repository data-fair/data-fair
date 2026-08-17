# Permissions Recap Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a back-office screen where an organization admin picks a *scope* (public / a user / an organization with department and roles) and sees which datasets and applications that scope can reach, for a chosen set of actions.

**Architecture:** A new `scopeFilter` function in `api/src/misc/utils/permissions.ts` turns a scope + a list of actions into Mongo clauses, sharing its clause builders with the existing `filterCan` so the two cannot drift. It is wired into `api/src/misc/utils/find.ts` (both the result query and the facets pipeline), AND-ed on top of the real session filter and a forced owner clause, so it can only ever narrow within an already-authorised perimeter. The UI is a new page reusing `useCatalogList` (infinite scroll + cards) with a scope block extracted as a standalone, resource-type-agnostic component.

**Tech Stack:** Node 24 + TypeScript ESM (API), Vue 3 + Vuetify 3 + vue-i18n (UI), MongoDB, Playwright (unit / api / e2e sub-projects).

**Spec:** `docs/superpowers/specs/2026-08-17-permissions-recap-design.md`

## Global Constraints

- **Worktree / branch:** `/home/batledev/Documents/data-fair_feat-permissions-recap`, branch `feat-permissions-recap`. All work happens there.
- **Commit messages in English**, conventional-commit prefixes (`feat:`, `test:`, `refactor:`), no `Co-Authored-By` footer.
- **Never start/stop/restart dev processes.** The user manages them via zellij. If a service is down, run `bash dev/status.sh`, read `dev/logs/`, and report.
- **Run only the related tests** while iterating — the full suite runs on push via husky.
- **Access rule:** organization admins only, department admins explicitly excluded. `usePermissions().canAdmin` already equals `canAdminDep && !account.department`.
- **Actions combine with AND.** Several selected actions means the scope must be able to do *all* of them.
- **Default action** when a scope is selected but no action is chosen: `list`.
- **The real session filter is never replaced**, only added to. Every scope clause goes into `query.$and`.
- **i18n:** every user-facing string goes in the component's `<i18n lang="yaml">` block with `fr` and `en` keys. French is the reference wording.
- **Do not modify `.gitignore`.** New files under `docs/superpowers/` need `git add -f` (the ignore rule postdates the tracked files there).

### Clarification of the spec's parameter naming

The spec's §4 table lists the page-level URL parameters. Two of them are per-tab and are
**renamed when they reach the API**, because the API handles one resource type per
request:

| Page URL parameter | API query parameter |
|---|---|
| `datasetsActions` (Datasets tab) | `scopeActions` on `GET /api/v1/datasets` |
| `applicationsActions` (Applications tab) | `scopeActions` on `GET /api/v1/applications` |

The five common scope parameters (`scopeType`, `scopeId`, `scopeEmail`,
`scopeDepartment`, `scopeRoles`) keep the same names everywhere — page URL, API query,
and the future portals iframe.

### Department semantics — a deliberate simplification

The spec's §4 table allows `scopeDepartment=-` ("main organization only"). While planning,
reading `matchPermission` (`api/src/misc/utils/permissions.ts:137-160`) showed this:

```js
if (sessionState.account.department && permission.department && permission.department !== '*' && permission.department !== sessionState.account.department) return false
```

When the simulated account has **no** department, the condition short-circuits and no
department filtering happens at all — so "main organization only" and "any department"
produce the **same** result set. Shipping both options would give the user a control that
silently does nothing.

**Decision:** the scope department selector offers only "Tous les départements" (parameter
absent) plus the actual departments. `-` is not emitted. `scopeFilter` still tolerates
receiving `-` or `*` by treating them as "no department clause", so a hand-written URL
cannot produce a surprising result.

## File Structure

**Created:**
- `shared/permissions/scope.ts` — the `PermissionScope` type plus the URL-parameter parse/serialize pair. Config-free, imported by both API and UI, so the URL contract has exactly one definition.
- `tests/features/permissions/recap.api.spec.ts` — API behaviour, security, and the truthfulness cross-check.
- `tests/features/permissions/recap.e2e.spec.ts` — browser walkthrough.
- `ui/src/components/permissions/permission-scope-select.vue` — the common scope block. Knows nothing about resource types.
- `ui/src/components/permissions/permission-recap-list.vue` — one tab's content, parameterised by `resourceType`.
- `ui/src/pages/permissions-recap/index.vue` — the page.

**Modified:**
- `api/src/misc/utils/permissions.ts` — extract `operationFilterClauses`, add `scopeFilter`.
- `api/src/misc/utils/find.ts` — `scopeFilters` helper (checks + clauses), called from `query()` and `basePipeline()`.
- `ui/src/composables/layout/use-navigation-items.ts` — navigation entry in the `monitor` group.

---

### Task 1: Shared scope contract

**Files:**
- Create: `shared/permissions/scope.ts`
- Test: `tests/features/permissions/scope.unit.spec.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type PermissionScope = { type: 'public' | 'user' | 'organization', id?: string, email?: string, department?: string, roles?: string[] }`
  - `parseScopeParams(params: Record<string, string | undefined>): PermissionScope | null` — returns `null` when no `scopeType` is present.
  - `scopeToParams(scope: PermissionScope | null): Record<string, string>` — inverse; omits empty values.

This file is config-free (no `#config` import) so both the API and the browser bundle can
import it, exactly like the neighbouring `shared/permissions/operations.ts`.

- [ ] **Step 1: Write the failing test**

Create `tests/features/permissions/scope.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert'
import { parseScopeParams, scopeToParams } from '@data-fair/data-fair-shared/permissions/scope.ts'

test('parseScopeParams returns null without a scopeType', () => {
  assert.equal(parseScopeParams({}), null)
  assert.equal(parseScopeParams({ scopeRoles: 'contrib' }), null)
})

test('parseScopeParams reads a public scope', () => {
  assert.deepEqual(parseScopeParams({ scopeType: 'public' }), { type: 'public' })
})

test('parseScopeParams reads an organization scope with roles', () => {
  assert.deepEqual(parseScopeParams({
    scopeType: 'organization',
    scopeId: 'koumoul',
    scopeDepartment: 'dep1',
    scopeRoles: 'contrib,user'
  }), {
    type: 'organization',
    id: 'koumoul',
    department: 'dep1',
    roles: ['contrib', 'user']
  })
})

test('parseScopeParams reads a user scope by email', () => {
  assert.deepEqual(parseScopeParams({ scopeType: 'user', scopeEmail: 'a@b.com' }), {
    type: 'user',
    email: 'a@b.com'
  })
})

test('parseScopeParams rejects an unknown scopeType', () => {
  assert.equal(parseScopeParams({ scopeType: 'wathever' }), null)
})

test('scopeToParams is the inverse of parseScopeParams', () => {
  const scope = { type: 'organization' as const, id: 'koumoul', roles: ['contrib'] }
  assert.deepEqual(scopeToParams(scope), {
    scopeType: 'organization',
    scopeId: 'koumoul',
    scopeRoles: 'contrib'
  })
  assert.deepEqual(parseScopeParams(scopeToParams(scope)), scope)
})

test('scopeToParams returns nothing for a null scope', () => {
  assert.deepEqual(scopeToParams(null), {})
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/permissions/scope.unit.spec.ts`
Expected: FAIL — cannot resolve `@data-fair/data-fair-shared/permissions/scope.ts`.

- [ ] **Step 3: Write the implementation**

Create `shared/permissions/scope.ts`:

```ts
/**
 * The "scope" of a permissions recap query: a hypothetical visitor, described the same
 * way a Permission entry describes its beneficiary.
 *
 * This module is config-free and side-effect-free so it can be imported by the API, by
 * the UI bundle, and later by another service embedding the recap in an iframe. It is
 * the single definition of the URL contract — see
 * docs/superpowers/specs/2026-08-17-permissions-recap-design.md §4.
 */

export type PermissionScopeType = 'public' | 'user' | 'organization'

export interface PermissionScope {
  type: PermissionScopeType
  /** account id, or '*' for "all authenticated users" (user scope only) */
  id?: string
  /** user scope designated by email */
  email?: string
  /** a department id; absent means "any department" */
  department?: string
  /** absent or empty means "any role" */
  roles?: string[]
}

const scopeTypes: PermissionScopeType[] = ['public', 'user', 'organization']

/** Reads a scope from flat query parameters. Returns null when no scope is requested. */
export const parseScopeParams = (params: Record<string, string | undefined>): PermissionScope | null => {
  const type = params.scopeType
  if (!type || !scopeTypes.includes(type as PermissionScopeType)) return null
  const scope: PermissionScope = { type: type as PermissionScopeType }
  if (params.scopeId) scope.id = params.scopeId
  if (params.scopeEmail) scope.email = params.scopeEmail
  if (params.scopeDepartment) scope.department = params.scopeDepartment
  const roles = params.scopeRoles?.split(',').filter(Boolean)
  if (roles?.length) scope.roles = roles
  return scope
}

/** Serializes a scope back to flat query parameters, omitting empty values. */
export const scopeToParams = (scope: PermissionScope | null): Record<string, string> => {
  if (!scope) return {}
  const params: Record<string, string> = { scopeType: scope.type }
  if (scope.id) params.scopeId = scope.id
  if (scope.email) params.scopeEmail = scope.email
  if (scope.department) params.scopeDepartment = scope.department
  if (scope.roles?.length) params.scopeRoles = scope.roles.join(',')
  return params
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx playwright test tests/features/permissions/scope.unit.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Type-check and commit**

```bash
npm run check-types
git add shared/permissions/scope.ts tests/features/permissions/scope.unit.spec.ts
git commit -m "feat(permissions): shared scope type and url parameter contract"
```

---

### Task 2: `scopeFilter` and the extracted clause builder

**Files:**
- Modify: `api/src/misc/utils/permissions.ts` (extract from `filterCan` at lines 251-261, add `scopeFilter` after it)
- Test: covered behaviourally by Task 3; this task ships the function plus one regression test for the extraction.
- Test: `tests/features/permissions/recap.api.spec.ts` (created in Task 3) — **not** in this task.
- Test: `tests/features/permissions/filter-can.api.spec.ts`

**Interfaces:**
- Consumes: `PermissionScope` from Task 1.
- Produces:
  - `operationFilterClauses(resourceType: ResourceType, operation: string): any[]` — module-private helper.
  - `scopeFilter(scope: PermissionScope, resourceType: ResourceType, operations: string[]): any[]` — returns an array of clauses meant to be spread into a `$and`. Empty array when `operations` is empty.

**Why an extraction first.** `filterCan` currently builds its operation clauses inline:

```ts
for (const op of operation.split(',')) {
  const operationClass = permissionsClasses.classByOperation[resourceType][op]
  if (operationClass) {
    operationFilter.push({ operations: op })
    operationFilter.push({ classes: operationClass })
  } else if (permissionsClasses.operationsClasses[resourceType][operation]) {
    operationFilter.push({ classes: op })
  }
}
```

Note the `else if` tests `operation` (the whole comma-joined string) while the loop
variable is `op`. With a single value the two are identical, which is why this has never
been noticed. With several values, a permission **class** name in the list is silently
dropped. Extracting a per-operation helper fixes that incidentally; the test below pins
the fixed behaviour so the change is deliberate and visible rather than a silent side
effect.

- [ ] **Step 1: Write the failing regression test for the extraction**

Create `tests/features/permissions/filter-can.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert'
import { axiosAuth, clean } from '../../support/axios.ts'

test.afterAll(clean)

test('the can parameter accepts several comma-separated permission classes', async () => {
  const ax = await axiosAuth('test_user1@test.com', 'test_org1')
  await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'can filter dataset' })

  // 'read' and 'list' are permission classes, not operation ids: before the extraction
  // the multi-value form dropped them and returned nothing.
  const res = await ax.get('/api/v1/datasets', { params: { can: 'read,list' } })
  assert.ok(res.data.count >= 1, 'expected the owner to be able to read and list their own dataset')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/permissions/filter-can.api.spec.ts`
Expected: FAIL — `count` is 0 because both class names are dropped.

If the dev API is not running, `bash dev/status.sh` first and report; do not restart it.

- [ ] **Step 3: Extract the helper and make `filterCan` use it**

In `api/src/misc/utils/permissions.ts`, add above `filterCan`:

```ts
/**
 * Mongo clauses matching a permission entry that grants a single operation, whether it is
 * expressed as a permission class or as a precise operation id.
 * Shared by filterCan (session-based) and scopeFilter (scope-based) so the two cannot drift.
 */
const operationFilterClauses = (resourceType: ResourceType, operation: string): any[] => {
  const clauses: any[] = []
  const operationClass = permissionsClasses.classByOperation[resourceType][operation]
  if (operationClass) {
    clauses.push({ operations: operation })
    clauses.push({ classes: operationClass })
  } else if (permissionsClasses.operationsClasses[resourceType][operation]) {
    clauses.push({ classes: operation })
  }
  return clauses
}
```

Then replace the body of the loop at the top of `filterCan` with:

```ts
  const operationFilter = []
  for (const op of operation.split(',')) {
    operationFilter.push(...operationFilterClauses(resourceType, op))
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/permissions/filter-can.api.spec.ts`
Expected: PASS

Then check nothing else regressed on the permission filters:

Run: `npx playwright test tests/features/datasets --grep-invert "@slow"`
Expected: PASS (existing behaviour unchanged for single-value `can`)

- [ ] **Step 5: Add `scopeFilter`**

In the same file, right after `filterCan`:

```ts
/**
 * Mongo clauses matching the resources a hypothetical scope can perform ALL the given
 * operations on. Meant to be spread into a query's $and, on top of (never instead of)
 * the real session filter.
 *
 * Differs from filterCan on three points, on purpose:
 *  - the public case works with no session at all (filterCan hides its public clauses
 *    inside `if (sessionState.user)`, and visibility.publicFilter is hard-wired to `list`);
 *  - a scope may carry SEVERAL roles, or none meaning "any role" — a session carries one;
 *  - there is no adminMode branch: a scope is never a super admin.
 */
export const scopeFilter = function (scope: PermissionScope, resourceType: ResourceType, operations: string[]): any[] {
  const and: any[] = []
  for (const operation of operations) {
    const operationFilter = operationFilterClauses(resourceType, operation)
    const or: any[] = []

    // public permissions apply to every scope, anonymous included
    or.push({ permissions: { $elemMatch: { $or: operationFilter, type: null, id: null } } })

    if (scope.type === 'user') {
      // permissions granted to every authenticated user
      or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: '*' } } })
      if (scope.id && scope.id !== '*') {
        or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: scope.id } } })
        // a user is implicitly admin of their own personal account
        or.push({ 'owner.type': 'user', 'owner.id': scope.id })
      }
      if (scope.email) {
        or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', email: scope.email } } })
      }
    }

    if (scope.type === 'organization' && scope.id) {
      // an organization member is also an authenticated user
      or.push({ permissions: { $elemMatch: { $or: operationFilter, type: 'user', id: '*' } } })

      // a permission with no roles applies to everyone, and an admin matches any
      // permission of their organization whatever its roles (see matchPermission)
      const roles = scope.roles?.length ? scope.roles : null
      const matchesAnyRole = !roles || roles.includes(config.adminRole)

      // implicit rights of the owner organization's admins: they can do everything.
      // Only admins get this — contribOperationsClasses does not contain 'list', so
      // filterCan grants the owner clause to admins only, and permissions.list() gives
      // contributors nothing implicit either (cf. ticket #777).
      if (matchesAnyRole) {
        const ownerClause: any = { 'owner.type': 'organization', 'owner.id': scope.id }
        if (scope.department && scope.department !== '*' && scope.department !== '-') {
          ownerClause['owner.department'] = scope.department
        }
        or.push(ownerClause)
      }

      const elemMatch: any[] = [
        { type: 'organization', id: scope.id },
        { $or: operationFilter }
      ]
      if (!matchesAnyRole) {
        elemMatch.push({ $or: [{ roles: { $in: roles } }, { roles: { $size: 0 } }, { roles: { $exists: false } }] })
      }
      // "any department" (absent, '*' or '-') adds no clause: a member with no department
      // is not department-filtered at all by matchPermission.
      if (scope.department && scope.department !== '*' && scope.department !== '-') {
        elemMatch.push({ $or: [{ department: scope.department }, { department: '*' }, { department: { $exists: false } }, { department: null }] })
      }
      or.push({ permissions: { $elemMatch: { $and: elemMatch } } })
    }

    and.push({ $or: or })
  }
  return and
}
```

Add the import at the top of the file, next to the existing `permissionsClasses` import:

```ts
import type { PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'
```

- [ ] **Step 6: Type-check and commit**

```bash
npm run check-types
npm run lint
git add api/src/misc/utils/permissions.ts tests/features/permissions/filter-can.api.spec.ts
git commit -m "feat(permissions): scopeFilter matching resources reachable by a hypothetical scope"
```

---

### Task 3: Wire the scope into the list endpoints, with its security locks

**Files:**
- Modify: `api/src/misc/utils/find.ts` (add `scopeFilters` after `ownerFilters` at line 128; call it in `query()` near line 83 and in `basePipeline()` near line 268)
- Test: `tests/features/permissions/recap.api.spec.ts`

**Interfaces:**
- Consumes: `scopeFilter` from Task 2, `parseScopeParams` from Task 1.
- Produces: `scopeFilters(reqQuery: Record<string, string>, sessionState: SessionState, resourceType: string): any[]` — returns the clauses to append to a `$and` (scope clauses + the forced owner clause), or `[]` when no scope is requested. Throws 401/403 when the caller is not allowed to simulate.

**The three locks, restated concretely.** The first one needs no code: `find.ts:79` and
`basePipeline` already push `permissions.filter(sessionState, …)`, and our clauses are
**appended** to the same `$and`. The second lock is the forced owner clause — note that
because everything is AND-ed, a client-supplied `owner` parameter can only *narrow* the
result, never widen it, so the forced clause simply has to be present; there is no need to
delete the client's parameter. The third is the admin check.

- [ ] **Step 1: Write the failing tests**

Create `tests/features/permissions/recap.api.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert'
import { axiosAuth, clean } from '../../support/axios.ts'

test.afterAll(clean)

// Fixtures from dev/resources/organizations.json, organization test_org1:
//   test_user1  admin, no department      -> allowed to use the recap
//   test_user5  contrib, no department    -> must get a 403
//   test_user4  admin of department dep1  -> must get a 403 (department admins excluded)
// Departments of test_org1: dep1, dep2.
const adminEmail = 'test_user1@test.com'
const contribEmail = 'test_user5@test.com'
const depAdminEmail = 'test_user4@test.com'
const org = 'test_org1'

const createDataset = async (ax: any, title: string, permissions: any[]) => {
  const dataset = (await ax.post('/api/v1/datasets', { isMetaOnly: true, title })).data
  await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, permissions)
  return dataset
}

test('a public scope only sees resources with a matching public permission', async () => {
  const ax = await axiosAuth(adminEmail, org)
  const publicDataset = await createDataset(ax, 'recap public', [{ classes: ['list', 'read'] }])
  await createDataset(ax, 'recap private', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list' }
  })
  const ids = res.data.results.map((d: any) => d.id)
  assert.ok(ids.includes(publicDataset.id))
  assert.equal(ids.length, 1, 'the private dataset must not appear')
})

test('actions combine with AND', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'recap readonly', [{ classes: ['list', 'read'] }])
  const writable = await createDataset(ax, 'recap writable', [{ classes: ['list', 'read', 'write'] }])

  const readOnly = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list' }
  })
  assert.equal(readOnly.data.count, 2)

  const readAndWrite = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list,write' }
  })
  assert.equal(readAndWrite.data.count, 1)
  assert.equal(readAndWrite.data.results[0].id, writable.id)
})

test('an organization scope restricted to a role only sees permissions granting that role', async () => {
  const ax = await axiosAuth(adminEmail, org)
  const forContribs = await createDataset(ax, 'recap contribs', [
    { type: 'organization', id: org, roles: ['contrib'], classes: ['list', 'read'] }
  ])
  await createDataset(ax, 'recap nobody', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'organization', scopeId: org, scopeRoles: 'contrib', scopeActions: 'list' }
  })
  const ids = res.data.results.map((d: any) => d.id)
  assert.ok(ids.includes(forContribs.id))
  assert.ok(!ids.includes('recap nobody'))
})

test('an organization admin scope sees every resource of the organization', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'recap no permission at all', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'organization', scopeId: org, scopeRoles: 'admin', scopeActions: 'list' }
  })
  assert.ok(res.data.count >= 1, 'admins hold implicit rights on everything the org owns')
})

test('no action selected falls back to list', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'recap default action', [{ classes: ['list', 'read'] }])

  const withDefault = await ax.get('/api/v1/datasets', { params: { scopeType: 'public' } })
  const explicit = await ax.get('/api/v1/datasets', { params: { scopeType: 'public', scopeActions: 'list' } })
  assert.equal(withDefault.data.count, explicit.data.count)
})

test('a contributor cannot use the scope parameters', async () => {
  const ax = await axiosAuth(contribEmail, org)
  await assert.rejects(
    () => ax.get('/api/v1/datasets', { params: { scopeType: 'public', scopeActions: 'list' } }),
    (err: any) => err.status === 403
  )
})

test('a department admin cannot use the scope parameters', async () => {
  // test_user4 is admin of dep1 and dep2 of test_org1, and of nothing at org root level.
  const ax = await axiosAuth(depAdminEmail, org)

  // Guard: this test is only meaningful if the session really is a department account.
  // data-fair exposes no session endpoint, so we probe it the way the suite already does
  // (cf. tests/features/datasets/upload/init-from.api.spec.ts:343): a resource created by
  // a department account carries owner.department.
  // If this assertion fails, the `org` argument does not select a department account —
  // read the axiosAuth helper in @data-fair/lib-node and adapt the call above.
  // Do NOT delete this guard: without it the test would pass on a 403 raised for an
  // unrelated reason.
  const probe = (await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'recap dep probe' })).data
  assert.ok(probe.owner.department, 'expected a department-scoped session')

  await assert.rejects(
    () => ax.get('/api/v1/datasets', { params: { scopeType: 'public', scopeActions: 'list' } }),
    (err: any) => err.status === 403
  )
})

test('a client-supplied owner cannot widen the perimeter', async () => {
  const ax = await axiosAuth(adminEmail, org)
  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list', owner: 'organization:someotherorg' }
  })
  assert.equal(res.data.count, 0, 'the forced owner clause is AND-ed, it can only narrow')
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/permissions/recap.api.spec.ts`
Expected: FAIL — the scope parameters are ignored, so counts are wrong and no 403 is raised.

- [ ] **Step 3: Implement `scopeFilters` in `find.ts`**

Add after `ownerFilters` (line 128):

```ts
/**
 * Clauses restricting a list query to what a hypothetical scope can reach.
 * Returns [] when no scope is requested. Throws when the caller may not simulate.
 *
 * The returned clauses are meant to be AND-ed with the caller's own permission filter,
 * never to replace it: the result is therefore always a subset of what the caller can
 * already see. See docs/superpowers/specs/2026-08-17-permissions-recap-design.md §5.
 */
export const scopeFilters = (reqQuery: Record<string, string>, sessionState: SessionState, resourceType: string): any[] => {
  const scope = parseScopeParams(reqQuery)
  if (!scope) return []

  const account = sessionState.account
  if (!account) throw httpError(401)
  if (!sessionState.user?.adminMode) {
    // department admins are excluded: the recap is an organization-wide screen
    if (account.department) throw httpError(403, 'Simulating permissions requires being admin of the whole account')
    if (account.type === 'organization' && sessionState.accountRole !== config.adminRole) {
      throw httpError(403, 'Simulating permissions requires being admin of the whole account')
    }
  }

  const operations = reqQuery.scopeActions?.split(',').filter(Boolean)
  const clauses = permissions.scopeFilter(scope, resourceType as ResourceType, operations?.length ? operations : ['list'])

  // force the perimeter to the current account; AND-ed, so a client-supplied `owner`
  // parameter can only narrow it further
  clauses.push({ 'owner.type': account.type, 'owner.id': account.id })

  return clauses
}
```

Add the import at the top of `find.ts`:

```ts
import { parseScopeParams } from '@data-fair/data-fair-shared/permissions/scope.ts'
```

Then call it in `query()`, right after the existing `reqQuery.can` block (line 83):

```ts
    query.$and.push(...scopeFilters(reqQuery, sessionState, resourceType))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/permissions/recap.api.spec.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
npm run check-types
npm run lint
git add api/src/misc/utils/find.ts tests/features/permissions/recap.api.spec.ts
git commit -m "feat(api): scope simulation parameters on the datasets and applications lists"
```

---

### Task 4: Propagate the scope to the facets pipeline

**Files:**
- Modify: `api/src/misc/utils/find.ts` (`basePipeline`, around line 268)
- Test: `tests/features/permissions/recap.api.spec.ts` (append)

**Interfaces:**
- Consumes: `scopeFilters` from Task 3.
- Produces: nothing new.

`basePipeline` does **not** call `query()` — it re-declares its own permission `$match`
(lines 263-268). Without this task, facet counts describe a different set than the
displayed list, which is exactly the kind of incoherence that discredits a beta screen.

- [ ] **Step 1: Write the failing test**

Append to `tests/features/permissions/recap.api.spec.ts`:

```ts
test('facet counts follow the scope', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'recap facet public', [{ classes: ['list', 'read'] }])
  await createDataset(ax, 'recap facet private', [])

  const res = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list', facets: 'visibility' }
  })
  const facetTotal = res.data.facets.visibility.reduce((sum: number, f: any) => sum + f.count, 0)
  assert.equal(facetTotal, res.data.count, 'facet counts must describe the same set as the list')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/permissions/recap.api.spec.ts -g "facet counts follow the scope"`
Expected: FAIL — the facet total counts the private dataset too.

- [ ] **Step 3: Implement**

In `basePipeline`, right after the existing permissions `$match` (line 264-268):

```ts
  const scope = scopeFilters(reqQuery, sessionState, resourceType)
  if (scope.length) pipeline.push({ $match: { $and: scope } })
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/permissions/recap.api.spec.ts`
Expected: PASS (8 tests)

- [ ] **Step 5: Commit**

```bash
npm run check-types
git add api/src/misc/utils/find.ts tests/features/permissions/recap.api.spec.ts
git commit -m "fix(api): apply the permission scope to the facets pipeline"
```

---

### Task 5: The truthfulness cross-check, and applications parity

**Files:**
- Test: `tests/features/permissions/recap.api.spec.ts` (append)

**Interfaces:**
- Consumes: everything from Tasks 1-4.
- Produces: nothing new — this task is the gate that the recap does not lie.

This is the centrepiece test of the whole feature. For a given scope, the set the recap
returns must equal the set a **real session** of that scope actually obtains. If they
diverge, the screen misinforms an admin about who can reach their data, which is worse
than not having the screen at all.

- [ ] **Step 1: Write the failing tests**

Append to `tests/features/permissions/recap.api.spec.ts`:

```ts
import { anonymousAx, mockAppUrl } from '../../support/axios.ts'

test('the recap matches what an anonymous visitor really sees', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'truth public', [{ classes: ['list', 'read'] }])
  await createDataset(ax, 'truth protected', [
    { type: 'organization', id: org, roles: ['contrib'], classes: ['list', 'read'] }
  ])
  await createDataset(ax, 'truth private', [])

  const recap = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'public', scopeActions: 'list', size: 1000 }
  })
  const real = await anonymousAx.get('/api/v1/datasets', {
    params: { owner: `organization:${org}`, size: 1000 }
  })

  const recapIds = recap.data.results.map((d: any) => d.id).sort()
  const realIds = real.data.results.map((d: any) => d.id).sort()
  assert.deepEqual(recapIds, realIds, 'the recap must report exactly what an anonymous visitor can list')
})

test('the recap matches what a real contributor of the organization sees', async () => {
  const ax = await axiosAuth(adminEmail, org)
  await createDataset(ax, 'truth contrib visible', [
    { type: 'organization', id: org, roles: ['contrib'], classes: ['list', 'read'] }
  ])
  await createDataset(ax, 'truth contrib hidden', [])

  const recap = await ax.get('/api/v1/datasets', {
    params: { scopeType: 'organization', scopeId: org, scopeRoles: 'contrib', scopeActions: 'list', size: 1000 }
  })
  const contribAx = await axiosAuth(contribEmail, org)
  const real = await contribAx.get('/api/v1/datasets', {
    params: { owner: `organization:${org}`, size: 1000 }
  })

  const recapIds = recap.data.results.map((d: any) => d.id).sort()
  const realIds = real.data.results.map((d: any) => d.id).sort()
  assert.deepEqual(recapIds, realIds, 'the recap must report exactly what a real contributor can list')
})

test('the scope applies to applications the same way', async () => {
  const ax = await axiosAuth(adminEmail, org)
  // creation body copied from tests/features/applications/publication-sites.api.spec.ts:35
  const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data
  await ax.put(`/api/v1/applications/${app.id}/permissions`, [{ classes: ['list', 'read'] }])
  const hidden = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp2') })).data

  const res = await ax.get('/api/v1/applications', {
    params: { scopeType: 'public', scopeActions: 'list', size: 1000 }
  })
  const ids = res.data.results.map((a: any) => a.id)
  assert.ok(ids.includes(app.id))
  assert.ok(!ids.includes(hidden.id))
})
```

- [ ] **Step 2: Run tests**

Run: `npx playwright test tests/features/permissions/recap.api.spec.ts`
Expected: PASS. **If one of the two truthfulness tests fails, do not adjust the test to
match the implementation** — the divergence is the bug. Compare the clauses produced by
`scopeFilter` with `matchPermission` / `filterCan` for that exact case and fix
`scopeFilter`. Report the divergence in the commit message.

`mockAppUrl` points at the dev mock server; if it is down, `bash dev/status.sh` and report
rather than substituting a real URL.

- [ ] **Step 3: Commit**

```bash
git add tests/features/permissions/recap.api.spec.ts
git commit -m "test(permissions): cross-check the recap against real sessions"
```

---

### Task 6: The scope selector component

**Files:**
- Create: `ui/src/components/permissions/permission-scope-select.vue`

**Interfaces:**
- Consumes: `PermissionScope` from Task 1.
- Produces: a component with
  - `modelValue: PermissionScope | null` (via `defineModel<PermissionScope | null>()`)
  - prop `owner: { type: string, id: string, name?: string }`
  - no emits beyond the model.

It replays the scope selects of `permission-dialog.vue` (lines 18-79) in read-only-scope
mode, and fetches departments / roles / partners exactly where the editor does
(`permissions-editor.vue:536`): `GET ${$sdUrl}/api/${type}s/${id}`. It must not import
anything resource-type related — this is the component a portals screen will reuse as-is.

- [ ] **Step 1: Write the component**

```vue
<template>
  <v-row dense>
    <v-col cols="12" md="4">
      <v-select
        :model-value="scopeType"
        :items="scopeTypeItems"
        :label="t('scope')"
        clearable
        hide-details="auto"
        @update:model-value="setScopeType"
      />
    </v-col>

    <template v-if="scopeType === 'organization'">
      <v-col cols="12" md="4">
        <v-select
          v-model="orgSelectType"
          :items="orgSelectTypes"
          hide-details="auto"
        />
      </v-col>
      <template v-if="orgSelectType === 'ownerOrg'">
        <v-col v-if="ownerDetails?.departments?.length" cols="12" md="4">
          <v-select
            :model-value="modelValue?.department ?? null"
            :items="departmentItems"
            :label="t('department')"
            hide-details="auto"
            @update:model-value="patch({ department: $event ?? undefined })"
          />
        </v-col>
        <v-col v-if="ownerDetails?.roles?.length" cols="12" md="4">
          <v-select
            :model-value="modelValue?.roles ?? []"
            :items="ownerDetails.roles"
            :label="t('rolesLabel')"
            multiple
            hide-details="auto"
            @update:model-value="patch({ roles: $event })"
          />
        </v-col>
      </template>
      <v-col v-else cols="12" md="4">
        <v-select
          :model-value="modelValue?.id ?? null"
          :items="ownerDetails?.partners ?? []"
          item-title="name"
          item-value="id"
          :label="t('partner')"
          hide-details="auto"
          @update:model-value="patch({ id: $event ?? undefined, department: undefined, roles: [] })"
        />
      </v-col>
    </template>

    <template v-if="scopeType === 'user'">
      <v-col cols="12" md="4">
        <v-select
          v-model="userSelectType"
          :items="userSelectTypes"
          hide-details="auto"
        />
      </v-col>
      <v-col v-if="userSelectType === 'member'" cols="12" md="4">
        <member-select
          :model-value="member"
          :organization="ownerDetails"
          @update:model-value="patch({ id: $event?.id, email: $event?.email })"
        />
      </v-col>
      <v-col v-if="userSelectType === 'email'" cols="12" md="4">
        <v-text-field
          :model-value="modelValue?.email ?? ''"
          :label="t('email')"
          hide-details="auto"
          @update:model-value="patch({ email: $event || undefined, id: undefined })"
        />
      </v-col>
    </template>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  scope: Portée
  allResources: Aucune simulation (toutes les ressources)
  public: Public
  organization: Organisation
  user: Utilisateur
  ownerOrg: Organisation propriétaire
  amongPartners: Parmi les organisations partenaires
  partner: Partenaire
  department: Département
  allDeps: Tous les départements
  rolesLabel: Rôles (tous si aucun coché)
  allUsers: Tous les utilisateurs de la plateforme non anonymes
  memberOf: Parmi les membres de {org}
  userByEmail: Utilisateur désigné par son adresse email
  email: Email
en:
  scope: Scope
  allResources: No simulation (all resources)
  public: Public
  organization: Organization
  user: User
  ownerOrg: Owner organization
  amongPartners: Among partner organizations
  partner: Partner
  department: Department
  allDeps: All departments
  rolesLabel: Roles (all if none is selected)
  allUsers: All non-anonymous users of the platform
  memberOf: Among the members of {org}
  userByEmail: User designed by their email
  email: Email
</i18n>

<script setup lang="ts">
import MemberSelect from './member-select.vue'
import type { PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'

const props = defineProps<{
  owner: { type: string, id: string, name?: string }
}>()

const modelValue = defineModel<PermissionScope | null>({ default: null })

const { t } = useI18n()

type OwnerDetails = {
  type: string
  id: string
  name?: string
  departments?: { id: string, name: string }[]
  roles?: string[]
  partners?: { id: string, name: string }[]
}
const ownerDetails = ref<OwnerDetails | null>(null)

const scopeType = computed(() => modelValue.value?.type ?? null)

const scopeTypeItems = computed(() => {
  const items: { value: string | null, title: string }[] = [
    { value: null, title: t('allResources') },
    { value: 'public', title: t('public') },
    { value: 'user', title: t('user') }
  ]
  if (props.owner.type === 'organization') items.push({ value: 'organization', title: t('organization') })
  return items
})

const patch = (patch: Partial<PermissionScope>) => {
  if (!modelValue.value) return
  modelValue.value = { ...modelValue.value, ...patch }
}

const setScopeType = (type: PermissionScope['type'] | null) => {
  if (!type) {
    modelValue.value = null
  } else if (type === 'organization') {
    modelValue.value = { type, id: props.owner.id }
  } else {
    modelValue.value = { type }
  }
}

// --- organization sub-selector ---

const orgSelectTypes = computed(() => [
  { value: 'ownerOrg', title: t('ownerOrg') },
  { value: 'partner', title: t('amongPartners') }
])

const orgSelectType = computed({
  get: () => (modelValue.value?.id === props.owner.id ? 'ownerOrg' : 'partner'),
  set: (v) => {
    modelValue.value = v === 'ownerOrg'
      ? { type: 'organization', id: props.owner.id }
      : { type: 'organization' }
  }
})

// "main organization only" is deliberately absent: matchPermission does not filter a
// member without a department at all, so it would be indistinguishable from "all
// departments" — see the plan's "Department semantics" note.
const departmentItems = computed(() => [
  { value: null, title: t('allDeps') },
  ...(ownerDetails.value?.departments ?? []).map(d => ({ value: d.id, title: `${d.name} (${d.id})` }))
])

// --- user sub-selector ---

const userSelectTypes = computed(() => {
  const types = [{ value: '*', title: t('allUsers') }]
  if (props.owner.type === 'organization') types.push({ value: 'member', title: t('memberOf', { org: props.owner.name }) })
  types.push({ value: 'email', title: t('userByEmail') })
  return types
})

const userSelectType = computed({
  get: () => {
    if (modelValue.value?.id === '*') return '*'
    if (modelValue.value?.email && !modelValue.value?.id) return 'email'
    return 'member'
  },
  set: (v) => {
    if (v === '*') modelValue.value = { type: 'user', id: '*' }
    else modelValue.value = { type: 'user' }
  }
})

const member = computed(() => {
  if (!modelValue.value?.id || modelValue.value.id === '*') return null
  return { id: modelValue.value.id, name: '' }
})

// --- owner details from simple-directory, same source as the permissions editor ---

onMounted(async () => {
  const res = await fetch(`${$sdUrl}/api/${props.owner.type}s/${props.owner.id}`)
  const data = await res.json()
  data.type = props.owner.type
  if (data.departments) {
    data.departments.sort((d1: { name: string }, d2: { name: string }) => d1.name.localeCompare(d2.name))
  }
  ownerDetails.value = data
})
</script>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check-types && npm run lint`
Expected: PASS.

`$sdUrl` is auto-imported in components — `permissions-editor.vue:536` uses it with no
import statement, so do not add one.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/permissions/permission-scope-select.vue
git commit -m "feat(ui): standalone permission scope selector"
```

---

### Task 7: The per-tab result list

**Files:**
- Create: `ui/src/components/permissions/permission-recap-list.vue`

**Interfaces:**
- Consumes: `PermissionScope` (Task 1), `scopeToParams` (Task 1), `permission-scope-select` is *not* used here.
- Produces: a component with props `resourceType: 'datasets' | 'applications'`, `scope: PermissionScope | null`, and `actions: string[]` (v-model on `actions`).

It builds the query from the scope plus the actions, feeds `useCatalogList`, and renders
cards with infinite scroll. `permissionClassesPicker` is called **without** a dataset
context, so the Datasets tab lists the superset of operations — assumed, see the spec §6.

- [ ] **Step 1: Write the component**

```vue
<template>
  <v-row dense class="mb-2">
    <v-col cols="12" md="8">
      <v-select
        v-model="actions"
        :items="expertMode ? operationItems : classItems"
        :label="expertMode ? t('detailedActions') : t('actions')"
        multiple
        hide-details="auto"
      />
    </v-col>
    <v-col cols="12" md="4">
      <v-switch
        v-model="expertMode"
        color="primary"
        :label="t('expertMode')"
        hide-details="auto"
      />
    </v-col>
  </v-row>

  <p class="text-body-2 mb-4">
    {{ t('matchingCount', { count: catalog.totalCount.value }) }}
  </p>

  <v-row class="d-flex align-stretch">
    <v-col
      v-for="item in catalog.displayedItems.value"
      :key="item.id"
      cols="12"
      sm="6"
      md="4"
    >
      <dataset-card v-if="resourceType === 'datasets'" :dataset="item as any" />
      <application-card v-else :application="item as any" />
    </v-col>
  </v-row>

  <!-- Infinite scroll sentinel, same shape as ui/src/pages/datasets/index.vue:87-91 -->
  <div
    v-if="catalog.hasMore.value && !catalog.loading.value"
    v-intersect="(isIntersecting: boolean) => isIntersecting && catalog.loadMore()"
  />
</template>

<i18n lang="yaml">
fr:
  actions: Actions
  detailedActions: Actions détaillées
  expertMode: Mode expert
  matchingCount: "{count} ressources correspondantes"
  classNames:
    list: Lister
    read: Lecture
    manageOwnLines: Gestion de ses propres lignes
    readAdvanced: Lecture informations avancées
    write: Écriture
    admin: Administration
    use: Utiliser le service
en:
  actions: Actions
  detailedActions: Detailed actions
  expertMode: Expert mode
  matchingCount: "{count} matching resources"
  classNames:
    list: List
    read: Read
    manageOwnLines: Manage own lines
    readAdvanced: Read advanced metadata
    write: Write
    admin: Administration
    use: Use the service
</i18n>

<script setup lang="ts">
import DatasetCard from '~/components/dataset/dataset-card.vue'
import ApplicationCard from '~/components/application/application-card.vue'
import { permissionClassesPicker } from '@data-fair/data-fair-shared/permissions/operations.ts'
import { scopeToParams, type PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'
import { $apiPath } from '~/context'

const props = defineProps<{
  resourceType: 'datasets' | 'applications'
  scope: PermissionScope | null
}>()

const actions = defineModel<string[]>('actions', { default: () => [] })

const { t, te, locale } = useI18n()
const expertMode = ref(false)

// No dataset context on a global screen: this is the superset of every operation, so a few
// of them only apply to REST or virtual datasets. An action that matches nothing returns
// an empty list, which is a truthful answer.
const permissionClasses = computed(() => permissionClassesPicker(props.resourceType, locale.value as 'fr' | 'en'))

const classItems = computed(() => Object.keys(permissionClasses.value)
  .filter(c => te('classNames.' + c))
  .map(c => ({ value: c, title: t('classNames.' + c) })))

const operationItems = computed(() => {
  const items: ({ type: 'subheader', title: string } | { value: string, title: string })[] = []
  for (const c of Object.keys(permissionClasses.value)) {
    if (!te('classNames.' + c)) continue
    items.push({ type: 'subheader', title: t('classNames.' + c) })
    items.push(...permissionClasses.value[c].map(op => ({ value: op.id, title: op.title })))
  }
  return items
})

// switching modes would leave incompatible values selected
watch(expertMode, () => { actions.value = [] })

const query = computed(() => {
  const params: Record<string, string> = {
    // copied verbatim from ui/src/pages/datasets/index.vue:262 and
    // ui/src/pages/applications/index.vue:252, so the cards get exactly the fields they
    // already rely on there
    select: props.resourceType === 'datasets'
      ? 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,draft.file,draft.originalFile,count,finalizedAt,updatedAt,visibility,owner,draftReason,integrity'
      : 'title,description,status,updatedAt,publicationSites,topics,visibility,owner,url',
    ...scopeToParams(props.scope)
  }
  if (props.scope && actions.value.length) params.scopeActions = actions.value.join(',')
  return params
})

const catalog = useCatalogList<{ id: string }>({
  fetchUrl: computed(() => `${$apiPath}/${props.resourceType}`),
  query,
  facetsFields: '',
})
</script>
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run check-types && npm run lint`
Expected: PASS.

Already verified while planning, so do not re-derive them: `dataset-card.vue` takes a
`dataset` prop (`dataset-card.vue:139-144`), `application-card.vue` takes an
`application` prop (`application-card.vue:64-66`), `permissionClassesPicker`'s third
`ctx` argument is optional (`shared/permissions/operations.ts:342-346`), and the two
`select` lists above are verbatim copies of the ones the existing list pages use.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/permissions/permission-recap-list.vue
git commit -m "feat(ui): permission recap result list per resource type"
```

---

### Task 8: The page, its route and its navigation entry

**Files:**
- Create: `ui/src/pages/permissions-recap/index.vue`
- Modify: `ui/src/composables/layout/use-navigation-items.ts` (monitor group, near line 130; i18n keys in `ui/src/components/layout/layout-navigation-left.vue`)

**Interfaces:**
- Consumes: `permission-scope-select` (Task 6), `permission-recap-list` (Task 7), `parseScopeParams` / `scopeToParams` (Task 1).
- Produces: route `/permissions-recap`.

- [ ] **Step 1: Write the page**

```vue
<template>
  <v-container>
    <permission-scope-select
      v-if="account"
      v-model="scope"
      :owner="account"
      class="mb-4"
    />

    <v-tabs v-model="tab" class="mb-4">
      <v-tab value="datasets">{{ t('datasets') }}</v-tab>
      <v-tab value="applications">{{ t('applications') }}</v-tab>
    </v-tabs>

    <v-tabs-window v-model="tab">
      <v-tabs-window-item value="datasets">
        <permission-recap-list
          v-model:actions="datasetsActions"
          resource-type="datasets"
          :scope="scope"
        />
      </v-tabs-window-item>
      <v-tabs-window-item value="applications">
        <permission-recap-list
          v-model:actions="applicationsActions"
          resource-type="applications"
          :scope="scope"
        />
      </v-tabs-window-item>
    </v-tabs-window>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  title: Récapitulatif des permissions
  datasets: Jeux de données
  applications: Applications
en:
  title: Permissions recap
  datasets: Datasets
  applications: Applications
</i18n>

<script setup lang="ts">
import PermissionScopeSelect from '~/components/permissions/permission-scope-select.vue'
import PermissionRecapList from '~/components/permissions/permission-recap-list.vue'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'
import { parseScopeParams, scopeToParams, type PermissionScope } from '@data-fair/data-fair-shared/permissions/scope.ts'

const { t } = useI18n()
const { account } = useSession()
const breadcrumbs = useBreadcrumbs()
breadcrumbs.receive({ breadcrumbs: [{ text: t('title') }] })

const tab = useStringSearchParam('tab', 'datasets')
const datasetsActions = useStringsArraySearchParam('datasetsActions')
const applicationsActions = useStringsArraySearchParam('applicationsActions')

// the five common scope parameters live in the URL individually, so the whole page state
// is shareable and can later be forwarded to an embedded portals iframe as-is
const scopeType = useStringSearchParam('scopeType')
const scopeId = useStringSearchParam('scopeId')
const scopeEmail = useStringSearchParam('scopeEmail')
const scopeDepartment = useStringSearchParam('scopeDepartment')
const scopeRoles = useStringSearchParam('scopeRoles')

const scope = computed<PermissionScope | null>({
  get: () => parseScopeParams({
    scopeType: scopeType.value,
    scopeId: scopeId.value,
    scopeEmail: scopeEmail.value,
    scopeDepartment: scopeDepartment.value,
    scopeRoles: scopeRoles.value
  }),
  set: (v) => {
    const params = scopeToParams(v)
    scopeType.value = params.scopeType ?? ''
    scopeId.value = params.scopeId ?? ''
    scopeEmail.value = params.scopeEmail ?? ''
    scopeDepartment.value = params.scopeDepartment ?? ''
    scopeRoles.value = params.scopeRoles ?? ''
  }
})
</script>
```

- [ ] **Step 2: Add the navigation entry**

In `ui/src/composables/layout/use-navigation-items.ts`, in the monitor group (after the
`storage` entry near line 126), add:

```ts
    if (canAdmin.value) {
      monitor.push({ to: '/permissions-recap', icon: mdiShieldAccountOutline, title: t('permissionsRecap') })
    }
```

Add `mdiShieldAccountOutline` to the `@mdi/js` import list at the top of the file.

In `ui/src/components/layout/layout-navigation-left.vue`, add to the `<i18n>` block:

```yaml
fr:
  permissionsRecap: Permissions (bêta)
en:
  permissionsRecap: Permissions (beta)
```

- [ ] **Step 3: Verify it compiles and the route exists**

Run: `npm run check-types && npm run lint`
Expected: PASS.

Then check the page renders: `bash dev/status.sh` to confirm the UI dev server is up (do
**not** start it), and open `/data-fair/permissions-recap` in a browser. If a UI page path
prefixes an nginx API location it would be served as stale `ui/dist`; `permissions-recap`
does not collide with any API location, but if the page renders stale, report it rather
than changing nginx config.

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/permissions-recap/index.vue ui/src/composables/layout/use-navigation-items.ts ui/src/components/layout/layout-navigation-left.vue
git commit -m "feat(ui): permissions recap page under the monitoring section"
```

---

### Task 9: End-to-end walkthrough

**Files:**
- Create: `tests/features/permissions/recap.e2e.spec.ts`

**Interfaces:**
- Consumes: the page from Task 8.
- Produces: nothing.

- [ ] **Step 1: Write the test**

```ts
import { test, expect } from '@playwright/test'

test('the permissions recap filters as the scope narrows', async ({ page }) => {
  await page.goto('/data-fair/permissions-recap')

  // both tabs are present
  await expect(page.getByRole('tab', { name: 'Jeux de données' })).toBeVisible()
  await expect(page.getByRole('tab', { name: 'Applications' })).toBeVisible()

  // with no scope the page lists everything the account owns
  const unfiltered = await page.locator('.v-card').count()
  expect(unfiltered).toBeGreaterThan(0)

  // narrowing to the public scope can only reduce the set
  await page.getByLabel('Portée').click()
  await page.getByRole('option', { name: 'Public' }).click()
  await expect.poll(async () => page.locator('.v-card').count()).toBeLessThanOrEqual(unfiltered)

  // the scope is reflected in the url, so the view is shareable
  await expect(page).toHaveURL(/scopeType=public/)

  // switching tabs keeps the scope
  await page.getByRole('tab', { name: 'Applications' }).click()
  await expect(page).toHaveURL(/scopeType=public/)
  await expect(page).toHaveURL(/tab=applications/)
})
```

- [ ] **Step 2: Run the test**

Run: `npx playwright test tests/features/permissions/recap.e2e.spec.ts`
Expected: PASS.

If the authenticated browser state is set up differently in this suite, read an existing
`*.e2e.spec.ts` under `tests/features/` and mirror its fixture usage — do not add a new
authentication mechanism.

- [ ] **Step 3: Full check and commit**

```bash
npm run lint
npm run check-types
npx playwright test tests/features/permissions
git add tests/features/permissions/recap.e2e.spec.ts
git commit -m "test(permissions): end to end walkthrough of the recap screen"
```

---

## Documentation

- [ ] **Add an architecture note**

The permissions subsystem now has a second consumer of its filter logic.

Note while planning: `shared/permissions/operations.ts`'s header comment points at
`docs/architecture/permissions-operations-source-of-truth.md`, and **that file does not
exist** — `docs/architecture/` contains no permissions document at all. Do not try to
edit it.

Create `docs/architecture/permissions-recap.md` covering:
- the effective-access model (admins of the owner hold everything, everyone else needs
  explicit or public permissions), with the `contribOperationsClasses === ['post']`
  evidence that makes it exact;
- `scopeFilter` and its three deliberate differences from `filterCan`;
- the three security locks, especially why AND-ing makes a client-supplied `owner`
  harmless;
- the fact that the scope URL contract is defined once in `shared/permissions/scope.ts`
  because a future portals iframe (via `d-frame`, as `pages/agents-activity.vue` already
  does for the agents service) will consume the same five parameters;
- the department simplification and why `-` is not emitted.

Register it in the architecture list at the bottom of `AGENTS.md`, following the format of
the existing entries.

```bash
git add docs/architecture/permissions-recap.md AGENTS.md
git commit -m "docs: document the permission scope filter and the recap screen"
```
