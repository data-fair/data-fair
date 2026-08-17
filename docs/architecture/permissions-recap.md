# Permissions recap

The permission editor answers "who may do what on *this* resource?". The permissions recap
screen answers the reverse question, account-wide: **given a kind of visitor, what can they
reach?** — which datasets can an anonymous visitor list, what can a member of partner
organization X see, what did we open to contributors of department Y.

It is a read-only screen at `/permissions-recap`, under the *Suivi* navigation group,
labelled "Permissions (bêta)".

## 1. The effective-access model

The recap reports **effective access**, not just the entries stored in `permissions[]`. The
model is simpler than it looks, and it is exact rather than approximate:

- **an admin of the owner organization (or the owner of a personal account) reaches every
  resource of that owner**;
- **everyone else reaches only what an explicit permission entry, or a public permission,
  grants them.**

The evidence that no third case exists: `contribOperationsClasses` is `['post']` for both
`datasets` and `applications` (`shared/permissions/operations.ts`), so it does not contain
`'list'`. Consequently `filterCan` adds its "whole owner organization" clause for the
`admin` role only, and `permissions.list()` grants a contributor nothing implicit either —
its `contrib` operation ids do not resolve to operation classes. This matches ticket #777,
which removed implicit rights for plain organization members in favour of explicit
permissions.

Two consequences that are correct behaviour, not bugs:

- simulating "owner organization / admin role" returns 100% of the account's resources;
- with no scope selected the page lists everything the admin owns, and filtering narrows
  from there.

## 2. `scopeFilter`, sibling of `filterCan`

`api/src/misc/utils/permissions.ts` exposes:

```ts
scopeFilter(scope: PermissionScope, resourceType: ResourceType, operations: string[]): any[]
```

It returns clauses meant to be spread into a query's `$and`, matching the resources the
scope can perform **all** the given operations on (actions combine with AND, by
composition: one `$or` block per action).

It is a sibling function rather than a synthetic `SessionState` fed to `filterCan`, for a
precise reason: **a session carries exactly one role** (`sessionState.organization.role`),
whereas a scope must be able to express "contrib *or* user" and "any role". That cannot be
encoded in a session object without lying.

Both functions share `operationFilterClauses(resourceType, operation)` — the class-or-
operation-id clause builder — so they cannot drift apart. Three deliberate differences:

1. **The public case works with no session at all.** In `filterCan` the public clauses sit
   inside `if (sessionState.user)`, and `visibility.ts`'s `publicFilter` is hard-wired to
   the `list` operation. `scopeFilter` emits the `{type: null, id: null}` and
   `{type: 'user', id: '*'}` clauses for the *requested* operation, with no session.
2. **Several roles**, OR-combined. A scope with no role matches any role. A scope
   containing the admin role matches every permission of the organization whatever its
   `roles`, mirroring `matchPermission`.
3. **No `adminMode` branch.** A scope is never a super admin.

An unknown action raises a 400 rather than producing an empty `$or`, which Mongo rejects
with `$or argument must be a non-empty array`.

### Bug fixed along the way

Extracting `operationFilterClauses` fixed a latent bug in `filterCan`: its `else if` branch
tested the whole comma-joined `operation` string against `operationsClasses` instead of the
current token. A permission **class** name was therefore dropped as soon as `can=` carried
several values. The bug was invisible with a single value (`op === operation`) and
invisible again when one value happened to be both a class and an operation id — `list` is
both, which is why `can=list,read` worked. `can=read,readAdvanced` was the discriminating
case: every token a class name, empty filter, Mongo 500. Covered by
`tests/features/permissions/filter-can.api.spec.ts`.

## 3. Security

`find.ts`'s `scopeFilters(reqQuery, sessionState, resourceType)` performs the checks and
returns the clauses. Three independent locks:

1. **The real session filter stays in place.** `find.ts` keeps applying
   `permissions.filter(sessionState, …)` and the scope clause is *appended* to the same
   `$and`, never substituted. Structurally the result is a subset of what the caller can
   already see: a bug in `scopeFilter` cannot leak across accounts.
2. **Owner forced** to the current account as soon as any scope parameter is present.
   Because everything is AND-ed, a client-supplied `owner` parameter can only *narrow* the
   result — it can never widen it, which is why the forced clause merely has to be present.
3. **Non-departmental admin required**, re-checked API-side (403 otherwise), not only in
   the navigation. `usePermissions().canAdmin` already equals `canAdminDep &&
   !account.department`, so the UI gate needs no extra condition.

`basePipeline` does **not** go through `query()`, so `scopeFilters` is applied there too —
otherwise facet counts would describe a different set than the displayed list.

## 4. The scope URL contract

`shared/permissions/scope.ts` is the single definition of the contract: the
`PermissionScope` type plus `parseScopeParams` / `scopeToParams`. It is config-free so the
API, the UI bundle, and later another service can all import it.

Five **common** parameters, keeping the vocabulary of the `Permission` model so there is no
mental translation between the editor and the recap:

| Parameter | Values | Meaning |
|---|---|---|
| `scopeType` | absent · `public` · `user` · `organization` | absent = no simulation, list everything |
| `scopeId` | account id, or `*` | `*` = all authenticated users; otherwise owner org, partner org, or a user |
| `scopeEmail` | email | the "user designated by email" case |
| `scopeDepartment` | department id · absent | absent = any department |
| `scopeRoles` | comma-separated | absent = any role |

Per-tab, *not* part of the common scope: the page URL carries `datasetsActions` and
`applicationsActions`, which reach the API as `scopeActions` (the API handles one resource
type per request). With a scope selected and no action chosen, the action defaults to
`list`.

### Department semantics

`matchPermission` does not filter by department at all when the simulated account has no
department:

```js
if (sessionState.account.department && permission.department && permission.department !== '*' && permission.department !== sessionState.account.department) return false
```

So "main organization only" and "any department" would produce the same result set. The
scope selector therefore offers only "Tous les départements" plus the real departments, and
never emits the editor's `-` value — shipping it would give the user a control that
silently does nothing. `scopeFilter` still tolerates `-` and `*` by treating them as "no
department clause", so a hand-written URL cannot surprise anyone.

## 5. Extending to other resource types

Datasets and applications share the same evaluator, parameterised by `resourceType`.

Portal pages do **not**: `portals` has no permissions model in the Data Fair sense — no
`permissions` array on pages, reuses or groups, confidentiality being handled at portal
level through the portal config's `authentication` field. Ticket #1632 sketches a different
shape for page permissions (a single visibility level plus contributor rights), so the
clause generator does not transpose.

What does transpose is the **scope**, because it describes an *account*, not a resource.
That is why the five parameters above are flat and readable rather than an opaque blob: a
future "Portal pages" tab would be an iframe (`d-frame`, as `ui/src/pages/agents-activity.vue`
already does for the agents service) receiving those parameters in its URL and applying its
own evaluator. Additive: new tab, new actions, no change to the existing ones.

## 6. Tests

`tests/features/permissions/`:

- `scope.unit.spec.ts` — the URL contract round-trip.
- `filter-can.api.spec.ts` — the multi-value `can=` regression.
- `recap.api.spec.ts` — matching semantics, AND across actions, the three security locks,
  facet coherence, and **the two truthfulness tests**: for a given scope, the set the recap
  returns must equal the set a *real session* of that scope obtains. That is the property
  that matters — a recap that misinforms an admin about who can reach their data is worse
  than no recap at all.
- `recap.e2e.spec.ts` — the browser walkthrough.

The exact shape of the produced Mongo clauses is deliberately **not** tested: such a test
breaks on every refactor without ever catching a real permission bug.
