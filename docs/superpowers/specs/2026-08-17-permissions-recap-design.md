# Permissions recap screen — design

- **Date:** 2026-08-17
- **Status:** approved (design); implementation plan to follow
- **Branch / worktree:** `feat-permissions-recap`
- **Related tickets:** koumoul/plateforme#1071 (last unchecked item), #1083, #1632, #777

## 1. Context & motivation

Data Fair lets an organization admin grant fine-grained permissions on every dataset and
application, one resource at a time, through `permissions-editor.vue` /
`permission-dialog.vue`. There is no way to ask the reverse question: **given a kind of
visitor, what can they actually reach?**

Concretely an admin cannot answer, today, without opening resources one by one:

- which datasets can an anonymous visitor list? which ones can they write to?
- which resources can a member of partner organization X see?
- which resources did we open to contributors of department Y?

Ticket #1071 ("Gestion des partenaires") closed with exactly this item still unchecked:

> Il pourrait être intéressant sur l'onglet "partenaires" dans la gestion de
> l'organisation de voir les jeux de données auxquels sur lesquels ils ont des droits.

Ticket #1083 ("revoir édition des permissions", still open) states the same need from the
other end — *"On veut aussi probablement pouvoir requêter efficacement et faire des
facettes sur ces infos"* — and proposes denormalizing a "permission profile" on each
permission entry to make it queryable. This design does **not** depend on that
denormalization: it queries the existing `permissions[]` structure directly. If #1083
later lands, the recap keeps working unchanged.

An earlier idea of letting an org admin impersonate an account was abandoned as too
dangerous. This screen delivers the useful half of that idea — *seeing* what a scope can
reach — without ever granting anything.

### Non-goals

- **Explaining *why* a resource is reachable** (owner right vs public permission vs
  explicit grant). Valuable, deliberately out of scope for this first version.
- **Editing permissions from this screen.** Read-only recap.
- **Covering portal pages.** See §7.

## 2. Semantics

The screen reports **effective access**: what a session with the given scope would
actually be able to do, combining implicit owner rights, public permissions and explicit
permission entries.

A verification worth recording, because it removes an approximation we feared:
`contribOperationsClasses` is `['post']` for both `datasets` and `applications`
(`shared/permissions/operations.ts`), so it does not contain `'list'`. Therefore in
`filterCan` the "whole owner organization" clause is only added for the **admin** role,
and in `permissions.list()` a contributor gains nothing implicit either (its `contrib`
operation ids do not resolve to operation classes). This matches ticket #777, which
removed implicit rights for plain org members in favour of explicit permissions.

The effective model is therefore exactly:

- **admin of the owner organization (or owner of a personal account) → every resource of
  that owner**;
- **anyone else → explicit permission entries + public permissions only**.

Consequences that are correct, not bugs, and should not surprise a reader:

- Simulating "owner organization / admin role" returns 100% of the account's resources.
- With no scope selected the page lists everything the admin owns. Filtering is
  progressive: the admin narrows down from the full set.

## 3. Access control

The page is visible to **organization admins only**, explicitly **not** to department
admins.

`usePermissions().canAdmin` is already defined as `canAdminDep && !account.department`,
so it excludes department admins with no extra condition. Personal accounts satisfy it
(a user is admin of their own account).

Visibility in the navigation is never the security boundary — the API re-checks the same
rule and answers 403 otherwise.

## 4. Page structure and URL contract

Route `/permissions-recap`, page `ui/src/pages/permissions-recap/index.vue`, entry added
to the `monitor` group of `ui/src/composables/layout/use-navigation-items.ts`, labelled
"Permissions (bêta)" / "Permissions (beta)", gated on `canAdmin`.

Layout:

1. **Top row — the scope block**, `v-row` with `v-col cols="4"` per field. The number of
   fields varies with the scope: 1 for public, 3 for user, 4 for organization. The row
   fills left to right.
2. **Tabs** — `Datasets` and `Applications` (`v-tabs`, the pattern already used in
   `settings.vue` and `dataset/[id]/index.vue`).
3. **Inside each tab** — the actions multi-select, the expert-mode switch, then the
   result list.

### URL parameters

All state lives in the URL, via `useStringSearchParam` / `useStringsArraySearchParam`
(the project standard, cf. `ui/src/pages/datasets/index.vue:204`). This makes the page
shareable ("here is what a contributor of department X sees") and, crucially, makes the
scope forwardable to an embedded iframe (§7).

**Common scope parameters** — resource-type agnostic, reusing the vocabulary of the
existing `Permission` model (`type` / `id` / `department` / `roles`) so there is no
mental translation between the editor and the recap:

| Parameter | Values | Meaning |
|---|---|---|
| `scopeType` | absent · `public` · `user` · `organization` | absent = no simulation, list everything |
| `scopeId` | account id, or `*` | `*` = all authenticated users; otherwise owner org, partner org, or a user |
| `scopeEmail` | email | the "user designated by email" case |
| `scopeDepartment` | id · `-` · absent | `-` = main organization only; absent = all departments |
| `scopeRoles` | comma-separated list | absent = any role |

Note `scopeType=public` (permission `{type: null, id: null}`) is distinct from
`scopeType=user&scopeId=*` (all non-anonymous users), exactly as in the editor.

**Per-tab parameters**, which are *not* part of the common scope and are not forwarded to
a portals iframe:

| Parameter | Values | Meaning |
|---|---|---|
| `datasetsActions` | comma-separated | permission classes and/or expert operation ids, combined with **AND** |
| `applicationsActions` | comma-separated | idem for applications |
| `tab` | `datasets` · `applications` | active tab |

Keeping the two action parameters separate means switching tabs never destroys the other
tab's selection.

## 5. API contract

### Precedent

`api/src/misc/utils/find.ts:81` already accepts a `can` query parameter that filters on
what **the current session** may do. The recap is the same gesture for a hypothetical
scope, so it plugs in at the same place with the same vocabulary. The list endpoints
`GET /api/v1/datasets` and `GET /api/v1/applications` gain the scope parameters of §4.

### A sibling function, not a synthetic session

Faking a `SessionState` to feed `filterCan` is rejected for a precise reason: a session
carries **exactly one role** (`sessionState.organization.role`), whereas a scope must be
able to express "contrib **or** user" and "any role". That cannot be encoded in a session
object without lying.

Instead, `api/src/misc/utils/permissions.ts` gains:

```
scopeFilter(scope, resourceType, operations[]) → Mongo clause
```

sharing `filterCan`'s internal clause builders (the class/operation `operationFilter`) so
the two cannot drift apart. Three deliberate differences from `filterCan`:

1. **The public case works without a user.** In `filterCan` the public clauses sit inside
   `if (sessionState.user)`, and `visibility.ts`'s `publicFilter` is hard-wired to the
   `list` operation. `scopeFilter` emits `{type: null, id: null}` and
   `{type: 'user', id: '*'}` clauses **for the requested operation**, with no session.
2. **Multiple roles**, OR-combined; a scope with no role matches any role.
3. **Never `adminMode`.** `filterCan`'s "super admin sees everything" branch has no
   equivalent — a scope is never a super admin.

An action is indifferently a permission class (`read`) or a precise expert operation
(`writeData`); `filterCan` already handles both and the shared builder keeps that.

**AND across actions** is obtained by composition: `$and` of the per-action `$or` blocks.

### Security

Three independent locks:

1. **The real session filter stays in place.** `find.ts:79` keeps applying
   `permissions.filter(sessionState, …)`; the scope clause is **added** in `$and`, never
   substituted. Structurally, the result is a subset of what the admin can already see —
   a bug in `scopeFilter` can only narrow or widen *within* an already-authorised
   perimeter, never leak across accounts.
2. **Owner forced.** As soon as any scope parameter is present, `owner` is forced to the
   current account and any client-supplied `owner` is ignored — otherwise that existing
   parameter would widen the perimeter. With no scope parameter at all, the request is an
   ordinary list request: this lock and lock 3 do not apply (lock 1 always does, it is
   the standard behaviour of `find.ts`), and the page simply passes `owner` = current
   account, exactly as `/datasets` does.
3. **Non-departmental admin required**, re-checked API-side, 403 otherwise.

### Known detail not to forget

`findDatasets` computes facets through a separate `facetsQuery`. The scope clause must be
propagated there too, otherwise facet counts describe a different set than the displayed
list. One line, but exactly the kind of omission that produces an incoherent beta screen.

## 6. UI components

Three components, no more.

**`ui/src/pages/permissions-recap/index.vue`** — scope row, tabs, tab windows.

**`ui/src/components/permissions/permission-scope-select.vue`** — the common block. It
replays the selects of `permission-dialog.vue` in scope-only mode, and fetches
departments / roles / partners where the editor already fetches them:
`GET ${$sdUrl}/api/organizations/{id}` (cf. `permissions-editor.vue:536`), here for the
current account. Reuses `member-select.vue` for the "among members" case. It knows
nothing about resource types — this is the component that will be reused as-is by
portals.

**`ui/src/components/permissions/permission-recap-list.vue`** — one tab's content, taking
`resourceType` as a prop: actions multi-select, expert-mode switch, `useCatalogList`, and
cards (`dataset-list-item.vue` / `application-list-item.vue`). `useCatalogList` provides
infinite scroll and `totalCount` for free. A single component serves both tabs, and it is
the only component portals would have to reimplement on its own model.

**Actions offered:** `permissionClassesPicker(resourceType, locale)` is called **without a
dataset context**, so the Datasets tab offers the superset of operations, including ones
that only apply to REST or virtual datasets. This is unavoidable on a global screen and is
assumed rather than hidden: an action that applies to no dataset in the account simply
returns an empty list, which is a truthful answer.

**No count badge on tabs** — that would require permanently querying the inactive tab. The
count is displayed above the active list from `useCatalogList`'s `totalCount`.

## 7. Extensibility: portal pages

Verified in `../portals`: there is **no permissions model** in the Data Fair sense. No
`*permission*` file under `api/`, and the only `permissions` occurrence in `api/src` is a
comment about ownership transfer. Pages, reuses and groups carry no `permissions` array;
confidentiality is handled at portal level (the portal config's `authentication` field).

Ticket #1632 sketches a different shape for page permissions — a single visibility level
("everyone / logged-in members / members, contribs and admins of the owner / …") plus
contributor rights — not an arbitrary array of classes and operations. (The ticket is
acknowledged as partly out of date, but the *shape* of the model is the point here.)

Therefore:

- **The Mongo clause generator does not transpose.** It is coupled to the `permissions[]`
  schema. It covers datasets *and* applications at no extra cost (same clauses, only
  `resourceType` changes when resolving classes → operations), but says nothing about
  portal pages.
- **The scope does transpose entirely.** It describes an *account*, not a resource. This
  is the one genuinely generic piece, and the reason the scope parameters are flat,
  readable URL parameters rather than an opaque JSON blob.

A future "Portal pages" tab would be an **iframe** onto a portals screen, receiving the
five common scope parameters in its URL and applying its own evaluator on its own model.
That is additive: new tab, new actions, no change to the existing tabs. What is *not*
promised is that it will be free — portals will have to expose an equivalent filter. What
is guaranteed is that neither this page nor the scope block will have to be redone.

## 8. Testing

Suite conventions: `docs/architecture/testing.md`.

**The core test** is an `*.api.spec.ts` verifying the one property that matters: **the
recap does not lie.** `tests/support/axios.ts` exposes `axiosAuth(email, org)` and
`anonymousAx`, so this is directly feasible: create datasets with known permissions, then
for each scope compare two sets — the one returned by the recap, and the one a **real
session** of that scope obtains. If they diverge, the page lies, which is the failure mode
that makes a permissions screen dangerous rather than merely useless.

**Security tests**, same file: contributor → 403, department admin → 403, and a
client-supplied `owner` parameter that must not widen the perimeter.

**One short `*.e2e.spec.ts`:** the page loads, selecting a scope filters the list,
switching tabs preserves both selections.

**Deliberately not tested:** the exact shape of the produced Mongo clauses. A test that
freezes query structure breaks on every refactor without ever catching a real permission
bug; the comparative test above covers the substance.
