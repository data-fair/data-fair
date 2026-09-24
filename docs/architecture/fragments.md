# Fragments (`partOf`)

This document describes **fragments**: datasets and applications that exist only as a part of
another resource, declared by a `partOf` attribute on the fragment itself. See also
[Application keys](./application-keys.md) for the application-context mechanism that fragments
extend, and the design spec at `docs/superpowers/specs/2026-09-18-fragments-design.md` (some
decisions there — notably owner-change cascading — were amended during implementation; this
document describes the code as built).

## 1. What a fragment is

A fragment is a dataset or an application that carries `partOf: { type: 'dataset' | 'application',
id: string }`. It has no ACL of its own — its permissions are a **derived ACL**, recomputed from
the parent's ACL by a pure function and re-synced whenever the parent's ACL changes (§4). It cannot
be published, is hidden from listings by default (§6), is deleted with its parent (§7), and can be
detached back into an ordinary standalone resource.

Three use cases drove the design:

1. the children of a virtual dataset,
2. the sub-applications of a dashboard application,
3. a utility dataset that only makes sense inside one application (a form's write target, a lookup
   table, …).

**One level only.** A parent cannot itself be a fragment, and a resource that already has fragments
cannot become one (`validatePartOf`, `api/src/fragments/operations.ts:89,93`). Nesting is out of
scope for this iteration (§10).

**Same owner.** A fragment must have the exact same owner as its parent — `type`, `id` and
`department` all equal (`sameOwner`, `api/src/fragments/operations.ts:84,90`). There is no cross-owner
fragment.

## 2. Data model

```jsonc
// api/types/dataset/schema.js (dataset properties) and api/types/application/schema.js
"partOf": {
  "type": "object",
  "additionalProperties": false,
  "required": ["type", "id"],
  "properties": {
    "type": { "type": "string", "enum": ["dataset", "application"] },
    "id":   { "type": "string" }
  }
}
```

- `type` is singular (`dataset` / `application`), like `sendResourceEvent` topics and journal entry
  types, not the plural `ResourceType` (`datasets` / `applications`) used internally. Two small
  helpers convert between the two: `partOfCollectionName` and `resourceTypeToPartOfType`
  (`api/src/fragments/operations.ts:9-10`).
- Not part of the dataset `draft` sub-object.
- Added to the `Resource` pick in `api/types/index.ts:21` so the permission layer can see it on
  every resource it operates on.
- Writable through `api/doc/datasets/post-req`, `api/doc/datasets/patch-req` (`patchKeys` in
  `api/doc/datasets/patch-req/schema.js:10`) and the application POST/PATCH bodies (`patchKeys` in
  `api/doc/applications/patch-req/schema.js:4`). The patch schema generator turns the property
  nullable for PATCH bodies; sending `partOf: null` in a patch is how a resource is detached, and it
  is translated to `$unset` by `applyPartOfChange` (`api/src/fragments/service.ts:70-73`), not left
  as a stored `null`.
- Sparse index `{ 'partOf.id': 1 }` on both `datasets` and `applications`
  (`api/src/mongo.ts:77,100`).
- No upgrade script: the absence of the field means "not a fragment"; nothing to backfill.

The `permissions` array of a fragment is **stored but derived**: it is always the output of
`deriveFragmentPermissions(parent.permissions, parentType, fragmentType)` (§4) and is never edited
directly — `PUT /permissions` refuses it (§3).

## 3. Invariants and where they are enforced

All the pure validation lives in `validatePartOf` (`api/src/fragments/operations.ts:87-97`); the
data it needs (parent lookup, sibling-fragment count) is fetched by `preparePartOf`
(`api/src/fragments/service.ts:44-54`), which both creation and attach call.

| Rule | Error | Enforced in |
|---|---|---|
| Parent exists and is readable by the caller (`readDescription`) | 404 | `preparePartOf`, `api/src/fragments/service.ts:47-49` |
| Fragment is not the parent (same id and type) | 400 | `validatePartOf`, `operations.ts:88` |
| Parent is not itself a fragment | 400 | `validatePartOf`, `operations.ts:89` |
| `parent.owner` equals `fragment.owner` (type, id, department) | 400 | `validatePartOf`, `operations.ts:90` |
| An application's parent must be an application | 400 | `validatePartOf`, `operations.ts:91` |
| A dataset's parent must be an application or a **virtual** dataset | 400 | `validatePartOf`, `operations.ts:92` |
| Fragment has no fragments of its own | 400 | `validatePartOf`, `operations.ts:93` |
| Fragment has no `publicationSites` / `requestedPublicationSites` | 400 | `validatePartOf`, `operations.ts:94` |
| Fragment has no `publications` (external catalogs) | 400 | `validatePartOf`, `operations.ts:95` |
| Fragment is not reference data (`isMasterData(masterData)`) | 400 | `validatePartOf`, `operations.ts` |
| A fragment cannot be published (`publicationSites`, `requestedPublicationSites`, `publications`) nor declared as reference data, on **any** write route | 400 | `fragmentWriteBodyError` / `fragmentForbiddenPatchKey` (`operations.ts`), applied by `fragments/middlewares.ts` on all four write routes (§3.1) |
| `PUT /:id/permissions` on a fragment | 403 | `misc/utils/permissions.ts:367` |
| `PUT /:id/owner` on a fragment | 403 | `datasets/routes/metadata.ts:228`, `applications/router.ts:146` |
| `PUT /:id/owner` on a resource that still has fragments | 400 | `datasets/routes/metadata.ts:229`, `applications/router.ts:147` |
| `partOf` cannot be changed by the body-replacing write routes (dataset `POST`/`PUT /:datasetId`, application `PUT /:applicationId`), only by `PATCH` | 400 | `fragmentWriteBodyError`, applied by `fragments/middlewares.ts` (§3.1) |

### 3.1 One guard, four write routes

`api/doc/datasets/patch-req/schema.js` has **two** consumers — the dataset `PATCH /:datasetId` route
and `updateDatasetRoute` (`POST`/`PUT /:datasetId`) — and the application `patchKeys` likewise serve
`PATCH` and the body-replacing `PUT /:applicationId`. The PATCH routes route `partOf` through
`applyPartOfChange`; the two body-replacing routes persist their body as-is (`preparePatch` →
`applyPatch`'s `$set`, and a raw `replaceOne`). Duplicating the fragment checks per route is what let
`POST /:datasetId` attach and detach with no `changeOwner` gate, no parent validation, no derived-ACL
replacement and no publication refusal, and let `PUT /:applicationId` publish a fragment.

There is now **one** implementation: the express-free `fragmentWriteBodyError`
(`api/src/fragments/operations.ts`), adapted by `api/src/fragments/middlewares.ts` as
`fragmentWriteGuard(allowPartOfChange)` (a route-chain middleware) and `assertFragmentWriteBody`
(the same check called directly from a handler). It says three things about any write body:

- `partOf` may not be changed on a route that does not go through `applyPartOfChange` — the dataset
  `POST`/`PUT /:datasetId` route and the application `PUT /:applicationId` route. An *identical*
  value is tolerated so a read-then-write round trip of a fragment still works (this is what the
  application PUT already did, and what the dataset route's equal-value stripping produces).
- a fragment may never carry `publicationSites` / `requestedPublicationSites` / `publications`, on
  any of the four routes.
- a fragment may never be reference data. Unlike the publication keys, **presence of the key is not
  the signal**: `masterData` is an often-present but empty sub-object, and clearing it on a fragment
  (or echoing an empty one back in a read-then-write round trip) has to keep working. The guard
  therefore calls `isMasterData(body.masterData)` (`api/contract/master-data.js`), the same predicate
  `validatePartOf` uses, which reads true only when one of the master-data features is actually
  configured.

| Route | How the guard is applied |
|---|---|
| `PATCH /datasets/:datasetId` | `fragmentWriteGuard(true)`, last in the route chain |
| `POST` / `PUT /datasets/:datasetId` (update path) | `assertFragmentWriteBody(patch, dataset, false)` inside `updateDatasetRoute` — this route also accepts **multipart** bodies, so `req.body` is only the write body after `getFormBody` has run inside the handler; a chain middleware would see `{}` there and be trivially bypassable |
| `PATCH /applications/:applicationId` | `fragmentWriteGuard(true)`, last in the route chain |
| `PUT /applications/:applicationId` | `fragmentWriteGuard(false)`, after `attemptInsert` (which answers 201 and stops the chain on a genuine create, where `partOf` is legitimate) and after the permission middleware, so an unauthorized caller still gets 403 rather than 400 |

The guards are mounted **after** the permission middlewares on purpose: a caller who may not write
the resource at all must keep getting a 403, not a 400 that leaks the body's shape.

The publication and reference-data refusals are refusals, not silent clean-ups: the user unpublishes
(or drops the master-data configuration) first, then attaches. All new messages are French, per house
convention, and name the blocking element.

The reference-data rule is **two-sided on purpose**. Reference data exists to be reused across many
contexts, and other datasets' extensions point at it, so it cannot also be a resource that hides from
listings and dies with a single parent. Refusing only at attach would be trivially bypassed by
attaching first and declaring the master-data configuration afterwards, hence the same predicate on
every write route.

The API never checks that the parent actually references the fragment (`virtual.children`,
`configuration.datasets`, `configuration.applications`). That link is intentionally weak: a
fragment may be prepared and attached before the parent's configuration includes it.

**Nothing is stripped from a fragment's operation list.** An early draft of this feature stripped
ACL-management, owner-change, publication and key operations from a fragment's derived permissions.
That was dropped as unneeded complexity: the three things a fragment must never do are refused at
the route (the `PUT /permissions` 403, the two owner-change refusals above, and the forbidden
publication keys on PATCH). Everything else — an `admin` entry derived onto a fragment really does
carry `admin`, including `getKeys`/`setKeys`, `writeExports`, `setReadApiKey` — is simply hidden in
the UI behind a `!resource.partOf` check (§8). There is no server-side attempt to make a fragment's
`userPermissions` narrower than what the derivation and the route guards already produce.

## 4. The derived ACL

Copying the parent's ACL onto the fragment verbatim would be wrong on two counts: it would let
anyone who can merely read a virtual dataset read its fragment datasets directly, and it would grant
nothing to a contributor who can write the parent but holds no read entry of their own on it.
Instead, `deriveFragmentPermissions` (`api/src/fragments/operations.ts:45-78`) transforms each entry
of the parent's ACL, keeping the *who* (`type`, `id`, `email`, `department`, `roles`, …) and
recomputing the *what* from the entry's expanded operation set (`classes` expanded through
`operationsClasses[parentType]`, plus the entry's explicit `operations`):

- **A. Management, any parent kind.** A `write` or `admin` class fully covered by the entry's
  operations becomes the same class on the fragment. Any operation id still present in the entry's
  set that also belongs to the *fragment* type's `write` or `admin` class is carried over
  individually — this is what keeps the org-contrib default entry meaningful (see the worked
  example below) — **except** the read-only members of the `admin` class (`READ_ONLY_ADMIN_OPERATIONS`
  = `getPermissions`, `readIntegrity`, `readIntegrityRevisions`; `getPermissions` likewise for
  applications). Those are pure reads that happen to live in `admin`, so carrying them would make a
  read-only parent entry derive full read on the fragment, contradicting §9. An entry that covers the
  *whole* `admin` class genuinely holds management operations and is unaffected. If either management
  class or any carried-over operation ends up present, `list`, `read` and `readAdvanced` are added
  too: **write implies read**, so someone who can edit the parent can also open, inspect and edit the
  fragment.
- **B. Read, only application → application.** The `list` / `read` operations of the entry are
  carried over only when both the parent and the fragment are applications. Viewing a dashboard is
  viewing its sub-applications; a public dashboard (an entry granting read with no `type`/`id`) has
  public sub-applications.
- An entry whose derived *what* ends up empty is dropped entirely.
- **A virtual dataset grants no read on its fragments.** No read is ever derived from a `datasets`
  parent (case B only fires application → application). Reading the virtual dataset reads its
  fragment children through the existing owner pseudo-session used by `datasets/utils/virtual.ts`,
  unchanged by this feature; a direct call on the fragment dataset needs rule A.

Summary by case:

| Fragment | Parent | A (management → stored) | B (read → stored) | C (application context, §5) |
|---|---|---|---|---|
| dataset | virtual dataset | yes | – | – |
| dataset | application | yes | – | yes |
| application | application | yes | yes | – |

The output is deterministic, so re-deriving is idempotent and any drift is self-healing on the next
sync (§4.1).

**Worked example — the org-contrib default entries.** `initResourcePermissions`
(`api/src/misc/utils/permissions.ts:323-343`) gives every freshly created organization-owned
resource two entries: `{ classes: ['write'], operations: ['delete'] }` and `{ classes: ['list',
'read', 'readAdvanced'], operations: [] }` (both scoped to `roles: ['contrib']`). `delete` sits in
the `admin` operations class (`shared/permissions/operations.ts:167,205`). Deriving a dataset
fragment of a virtual dataset carrying these two entries:

- the first entry's `write` class is fully covered → `classes.add('write')`; the `admin` class is
  not fully covered, but `delete` (present in the entry's expanded ops) belongs to the fragment
  type's `admin` class, so it is carried over as an individual operation → `operations.add('delete')`.
  Since something was added, `list`/`read`/`readAdvanced` are added too. Result: one entry with
  `classes: ['list', 'read', 'readAdvanced', 'write']`, `operations: ['delete']`.
- the second entry (pure read, no write coverage) produces nothing on a dataset-fragment-of-a-
  virtual-dataset (rule B does not fire, parent is not an application) and is dropped.

So the two org-contrib entries collapse into **one** derived entry — a contributor of the virtual
dataset can write, read and delete its dataset fragments, exactly the "write implies read" and
"contributors can delete fragments" guarantees the design set out to keep.

### 4.1 Sync points

The derived ACL is recomputed whenever the parent's ACL changes. `syncFragmentPermissions`
(`api/src/fragments/service.ts`) does the recompute against the `{ 'partOf.type', 'partOf.id' }`
filter: `{ $set: { permissions: deriveFragmentPermissions(...), updatedAt } }`.

The dataset half is **split in two** `updateMany` calls, on `'integrity.active': { $ne: true }` and
on `'integrity.active': true`, the second merging the outbox stamp through `stampHistorize`.
`permissions` is integrity-covered metadata, and the invariant in `api/src/integrity/operations.ts`
is that every writer of a covered field stamps, or an organic write reads as a metadata tamper at
the next check — enabling integrity on a dataset fragment and then editing the parent's ACL used to
report a false breach. Splitting (rather than the two-phase `stampHistorizeMany` used by the
`$pull`/`$unset` propagations, whose filters self-invalidate) keeps the stamp single-document atomic
with the write it accounts for. The origin is `propagation`, not `user`: the actor edited the
*parent*'s ACL, this write is its fan-out. Applications have no integrity trail, so their
`updateMany` is unchanged.

| Writer | Action |
|---|---|
| `PUT /:id/permissions` | The `onUpdated` callback passed to `permissions.router(...)` calls `syncFragmentPermissions` right after the parent's own update, in the same request — `datasets/routes/metadata.ts:100` and `applications/router.ts:77-82` (which also clears the application-key caches, §5). |
| Creation with `partOf` | For an application, `initResourcePermissions` is skipped entirely — `initApplicationPermissions` (`applications/service.ts:163-169`) branches on `partOf` before ever calling it. For a dataset, `initResourcePermissions` runs unconditionally (`datasets/service.ts:308`) and its result is then **overwritten** by `preparePartOf(...).permissions` when `dataset.partOf` is set (`datasets/service.ts:309-312`) — same end state, different path. |
| Attach (existing resource) | Same derivation, computed in `applyPartOfChange` at attach time (§7). |
| Identity rewrites (`identities/service.ts`) | Unchanged: they rewrite ACL entries across both collections by owner filter, fragments included — no fragment-specific code needed. |
| Owner change of the parent | Refused while the parent has fragments (§7), so there is nothing to re-sync. |

A failure between the parent's update and the `updateMany` calls leaves fragments with a stale but
previously-valid ACL; re-running the sync is idempotent. There is no repair endpoint in this
iteration (§9).

### 4.2 What stays unchanged because the ACL is stored

`permissions.can` / `list` / `filter` / `filterCan` / `isPublic`, `visibility`, cache headers, the
list and facet pipelines, and every call site that reads a document straight from Mongo all work on
fragments with no fragment-specific code, because the derived ACL sits in the same `permissions`
field every other resource uses. In particular:

- a sub-application of a public dashboard is public and its responses are publicly cacheable
  (derived via rule B);
- a dataset fragment is **never** public — no read entry is ever derived for a dataset fragment
  (rule B only fires application → application) — so its data responses are never publicly
  cacheable, even under a public application (§9).

`permissions.ts` itself is not modified for fragments at all: `userPermissions` on a fragment is
whatever the derived ACL and the owner role yield (admin operations included, per §3); the UI does
not rely on `userPermissions` to hide fragment-specific tabs, it checks `partOf` directly (§8). The
bypass early-return in `list()` (`misc/utils/permissions.ts:176-182`) is unchanged — see §9 for its
consequence in application context.

## 5. Application context

`api/src/misc/utils/application-key.ts` is the application-context middleware that fronts every
data request issued by an embedded application or dataset-embed page. It is unchanged in shape
(parse the `Referer`, identify the calling application, verify it may reach the dataset, compute a
bypass) but gained a second proof and a widened reachability check to cover dataset fragments.

**Two proofs unlock a dataset from an application page**, both resolved by the shared core
`resolveApplicationContextBypass` (`api/src/misc/utils/application-key.ts:87-157`, used by both the
HTTP middleware and the websocket `canSubscribe` handler in `api/src/app.js:291-312`, since a
browser sends no `Referer` on a websocket handshake and the key/appId are passed in the subscribe
message instead):

1. **Key proof** (unchanged for non-fragment datasets): an `applications-keys` document matching the
   referer's key id and the dataset's owner. If the calling application differs from the key's own
   application, the calling app must be reachable from the key's application either through the
   existing "dashboard lists this app in `configuration.applications`" check, **or** — new — through
   the `partOf` edge: the calling app is a fragment of the key's application (lines 106-116).
2. **Session proof, only when the dataset is itself a fragment of an application**
   (`resolveApplicationContextBypass`, the `else` branch at lines 118-128): an authenticated session
   holding `readConfig` on the calling application unlocks the fragment dataset, generalizing the
   key mechanism to logged-in users who never had a key. Reachability here is: the calling app *is*
   the dataset's parent app, or is a fragment of it, or is a dashboard listing it in
   `configuration.applications`. **Non-fragment datasets keep today's behavior exactly**: no key, no
   bypass, full stop — the session proof only exists for the fragment case.

**The `partOf` reachability edge is narrowed to the same parent family, deliberately.** In the key
branch, a calling application `B` that is a fragment of the key's application `A` only extends the
key's reach to a dataset that is *itself* a fragment of that **same** `A`
(`isFragmentOfKeyApp`, lines 106-116 — both `callingApp.partOf.id === applicationKey._id` and
`parentAppId === applicationKey._id` are required). Attaching a fragment only needs
`readDescription` on the parent (deliberately, not a write operation) — if the edge instead unlocked
*any* same-owner dataset that `B` merely lists in its own `configuration.datasets`, an org member who
can read a dashboard `A` and create applications could attach a fresh app `B` as a fragment of `A`,
point `B`'s configuration at an unrelated same-owner dataset, and read that dataset through `A`'s
already-distributed key — without ever having write access to that dataset. Requiring the dataset to
be a fragment of the *same* parent closes this: reassigning someone else's dataset to your own parent
still needs `changeOwner` on that dataset, which the `partOf` edge never grants (see also the
residual-privilege note in §9).

**Granted operations**: the calling application's declared `applicationKeyPermissions` for that
dataset entry in `configuration.datasets`, default `{ classes: ['read'] }`
(`application-key.ts:155`). A dataset fragment not yet referenced by any application's configuration
is therefore unreadable outside of rule A of §4 — the intended "prepared but not included yet"
state.

**Proxy gate** (HTML, not data): `matchApplicationKey` in `api/src/applications/proxy-service.ts:11-28`
gained the same `partOf` check (line 18) — a key on a dashboard also opens its sub-applications'
HTML for an anonymous visitor. It is invoked from `setProxyResource`
(`api/src/applications/middlewares.ts:75`), which is used by the proxy router
(`api/src/applications/proxy.ts`, the `readConfig || matchingApplicationKey` gates at lines 45 and
97). Logged-in visitors reach the same sub-applications through rule B of §4 (ordinary application
permissions), not through this key path.

**Anti-spam.** The stack described in [application-keys.md §10](./application-keys.md) applies only
to the key proof; a session proof is an authenticated user and goes through the normal rate limiter,
not the anonymous-write checks.

**The owner filter on every key lookup is unchanged**: the same-owner invariant of §1 guarantees it
still holds for fragments, so cross-owner leakage through this path is not newly possible.

## 6. Listing

Both `findDatasets` (`api/src/datasets/service.ts`) and `findApplications`
(`api/src/applications/service.ts`) push the single filter returned by `partOfListFilter`
(`api/src/fragments/operations.ts`) — one pure function so the two listings cannot drift:

1. `partOf=<type>:<id>` (same syntax as `owner`) → `{ 'partOf.type', 'partOf.id' }`, the fragments of
   that parent. A malformed value is a 400, not a silently ignored param.
2. `partOf=true` → `{ 'partOf.id': { $exists: true } }`, every fragment whatever its parent. Mostly
   an administration and debugging affordance ("what is hidden in this account?").
3. Absent, or `partOf=false` → `{ partOf: { $exists: false } }`, fragments hidden — **unless** the
   query pins resources by one of `id`, `ids`, `slug`, `slugs`, `children`, `dataset`,
   `application`, in which case no filter is pushed at all. Those callers already know exactly what
   they are asking for (the virtual-children editor resolves child ids by `ids=`, a dataset page
   lists the applications built on it by `dataset=`), so hiding fragments there would only break a
   legitimate lookup.
4. A comma-separated list of the above → their `$or` union, applied even when the query pins
   resources. `partOf=false,<type>:<id>` is what a picker opened from a parent uses: the standalone
   resources plus that parent's own fragments (see the pickers in §8).

In cases 1, 2 and 4 the standard ACL filter still applies on top — the stored derived ACL makes that
correct without any fragment-specific listing logic: listing dataset fragments of a virtual dataset
or of an application returns them to owner members and to holders of derived management entries;
listing sub-applications returns them to whoever can read the dashboard.

Facets and sums reuse the same `extraFilters`, so they follow the same rule; there is no `partOf`
facet in this iteration. (`findApplications` now passes `extraFilters` to `facetsQuery` the way
`findDatasets` always did — it did not, so fragment sub-applications still counted in the
applications facets while hidden from the list.) Single reads by id are untouched — `describe_dataset`, `describe_application`,
data tools, embeds and the proxy all work on a fragment id like on any other resource. The two
`describe_*` agent tools are the one exception to "the resource as-is": they build a curated field
whitelist (`agent-tools/describe-dataset.ts`, `ui/src/composables/application/agent-tools.ts`) that
does not include `partOf`, in either the text summary or `structuredContent`, so the assistant
cannot currently tell a fragment from a standalone resource through them (§9 of
[agent-integration.md](./agent-integration.md)).

Consumers that inherit the default hiding with no code change of their own: back-office lists, the
`dataset-select` picker (except the virtual-children picker, §8), the
storage page, the agent tools `list_datasets` / `list_applications`
(`docs/architecture/agent-integration.md`), and the portal catalog API (additionally scoped by
`publicationSites`, always empty on a fragment).

## 7. Lifecycle

**Creation.** `dataset.partOf` (or `application.partOf`) short-circuits the normal creation-time
defaulting: `preparePartOf` validates and the created resource's `permissions` is set to the derived
ACL directly, never to the org-contrib creation defaults (`datasets/service.ts:309-312`,
`applications/service.ts:163-169`).

**Attach / detach**, both through `PATCH .../partOf`, handled by `applyPartOfChange`
(`api/src/fragments/service.ts:60-84`):

- Gated by the operation that gates the resource's own owner-change route — `changeOwner` for
  datasets, `delete` for applications (`PART_OF_CHANGE_OPERATION`, `operations.ts:13`). Attaching
  hands control of the resource to the parent's ACL; detaching takes it back — the same authority as
  an owner transfer.
- **Attach** (`null → value`): replaces `permissions` with the freshly derived ACL, in the same
  update that sets `partOf`. A resource that is already a fragment cannot be re-parented directly
  (400 — "détachez-la avant de la rattacher à un autre parent"); detach, then attach.
- **Detach** (`value → null`): unsets `partOf` and **keeps the stored ACL exactly as it is**.
  Nothing about who-can-do-what changes at the moment of detach — the resource simply becomes
  editable again on its own permissions tab.
- Both writes stamp integrity history on datasets with `integrity.active` (`stampHistorize`,
  `service.ts:74-77`), the same forensic posture as `PUT /permissions`.

**Delete cascade.** `deleteDataset` / `deleteApplication` routes call `deleteFragments`
(`api/src/fragments/service.ts:101-130`) **before** deleting the parent
(`datasets/routes/metadata.ts:334`, `applications/router.ts:162`): it lists every fragment of the
resource in both collections and deletes each one through its full service delete (journal, index,
files, keys). Fragments first, so a failed fragment deletion leaves a still-consistent parent.
Dynamic imports (`await import('../datasets/service.ts')` etc.) avoid an import cycle, since both
`datasets/service.ts` and `applications/service.ts` import `fragments/service.ts`.

**Every** dataset deletion — cascaded or not — now also runs `detachFromVirtualParents`
(`datasets/utils/virtual.ts`, called from `deleteDataset` right after the document is removed): it
`$pull`s the id from every `virtual.children` referencing it and bumps those parents to `indexed` so
they re-finalize over their remaining members. This is a general fix, not a fragments one — before
it, deleting a member left a dangling id that broke the parent's next query — but the cascade makes
it load-bearing here: deleting a virtual dataset's fragments could otherwise leave dangling ids in
*other* virtual datasets that also aggregate them. It is skipped for a draft view
(`dataset.draftReason`), whose id belongs to a published dataset that is not being deleted. The
`$pull` writes `virtual`, which is integrity-covered metadata, without stamping — safe for one
structural reason only: a virtual dataset is neither a file nor a rest dataset, so
`enableIntegrityUnlocked` can never enroll it.

The post-cascade `updateTotalStorage` call at the end of the dataset branch
(`fragments/service.ts:120-124`) is **redundant on the dataset-parent path** — `DELETE
/:datasetId` already ends with its own unconditional `updateTotalStorage` on the same owner — but it
is the **only** storage recompute on the application-parent path: `deleteApplication` in
`applications/service.ts` has no trailing recompute of its own. It is called once per batch (not per
fragment) after all fragment datasets are gone. This is deliberately noted in a comment at the call
site: **do not remove it as apparent dead weight on the dataset path** — doing so would silently
leave the owner's cached storage total stale whenever fragments are deleted through an application.

**Owner change is refused, not cascaded** — the one deviation from the original design (its §6
proposed cascading the owner change through every fragment). As built:

- `PUT /:id/owner` on a fragment itself → 403 ("détachez-le d'abord").
- `PUT /:id/owner` on a resource that still has fragments → 400 ("détachez d'abord les
  fragments"), checked via `fragmentsService.countFragments(...)`.

The dataset owner-change route moves file directories and re-checks quotas inline per dataset, so a
cascade would have to re-run that whole route once per fragment; the two refusals keep the
same-owner invariant with a single guard instead. Cascading remains a possible later addition
(§10).

**Identity rewrites** (`identities/service.ts`): nothing fragment-specific to do — there is no owner
data on `partOf` itself, and the ACL rewrite already covers fragments through the normal
owner-filtered `permissions` rewrite (§4.1).

## 8. UI

All fragment-specific hiding in the UI is a `!resource.partOf` check next to the existing `can()`
gates in the page's `sections` computed and danger-zone template — there is no fragment-specific
permission model on the client, it is purely presentational.

- **`fragment-banner.vue`** (`ui/src/components/common/fragment-banner.vue`): shown at the top of a
  fragment's own page ("Cette ressource est un fragment de: *{parent title}*"), linking to the
  parent. The parent title is fetched with `notifError: false` and falls back to the parent id:
  holding a derived management entry on the fragment does **not** imply `readDescription` on the
  parent, so a 403/404 there is an ordinary case, not something to toast on every page load.
- **Hidden on a fragment's own page, to keep it minimal** (both `dataset/[id]/index.vue` and
  `application/[id]/index.vue`). A "Détacher" row replaces "Changer de propriétaire" in the danger
  zone. Also hidden: everything that only serves publication
  or sharing, which a fragment gets through its parent: the whole Share section (permissions, API
  key / protected links, portals, catalogs, embed snippets), the Attachments tab, the reference-data
  tab (refused by the API anyway), the dataset's Applications tab, the Fragments section (one level
  only), and the catalog fields of the metadata form: only title, summary and description remain
  (plus the functional `attachmentsAsImage` checkbox on datasets).
- **`fragments-list.vue`**, rendered as a dedicated **Fragments section** right after the
  informations, with its own entry in the page's table of contents — fragments appear in no listing,
  so this is the one place they are found from. Shown on any non-fragment application and on a
  virtual dataset (or any dataset already holding fragments). It lists fragment datasets and
  applications (two `partOf=` queries in the dataset/application stores, 100 at a time with a "load
  more" button so none is out of reach) and "Nouveau fragment" buttons that open
  `/new-dataset?partOf=type:id` or `/new-application?partOf=type:id`. On those creation pages the owner
  picker is replaced by the fragment banner and the owner is taken from the parent (a fragment has
  exactly its parent's owner), and a metadata-only dataset is not offered. The section carries an
  `agentDesc` for the back-office assistant (§9 of `agent-integration.md`).
- **Pickers opened from a parent offer its fragments.** `pickerPartOf` (`ui/src/utils/fragments.ts`)
  builds `partOf=false,<parent>` — the resource's own family, or its siblings when it is itself a
  fragment. The virtual-children picker (`dataset-virtual.vue`) passes it to `dataset-select`, and
  `application-config.vue` appends it to every datasets / applications listing `x-fromUrl` of the
  configuration schema (`addPartOfToFromUrls`), so an application can select its own fragment
  datasets and a dashboard its sub-applications.
- **`fragment-attach-dialog.vue`**: on a standalone resource's danger zone, "Rattacher à un parent" —
  a `dataset-select` restricted to `virtual: true` and the same owner for a dataset parent, or an
  autocomplete over `/applications?owner=...` for an application parent. Two alerts: a warning that
  the resource's own permissions are **permanently lost** and replaced by the derived ACL (detaching
  later does not restore them, §7), and an informational note of the prerequisites the API refuses on
  — a published resource, or one configured as reference data, cannot be attached.
- **Parent delete dialog loop**: deleting a resource that has fragments shows a warning ("Ce jeu de
  données a N fragment(s) qui seront supprimés avec lui") with two actions: the default delete
  button (relies on the unconditional API cascade), or "Détacher d'abord"
  (`confirmDetachAllAndRemove`, `dataset/[id]/index.vue:1017-1022` / `application/[id]/index.vue:728-736`),
  which `PATCH`es `partOf: null` on every fragment first, then deletes the now-childless parent.
- **Agent tools**: no fragment-specific tool. `list_datasets` / `list_applications` inherit the
  default listing hiding (§6); `describe_dataset` / `describe_application` work on a fragment id
  like any other, but their curated field whitelist does not include `partOf`, so they cannot be
  used to tell a fragment from a standalone resource. See [agent-integration.md](./agent-integration.md).

## 9. Known limitations

- **Outside `partOf=`, a fragment surfaces only to owner members and to holders of derived
  management entries — never through a parent's explicit read-only ACL entry.** A read entry on a
  virtual dataset's ACL grants nothing on its dataset fragments (rule B never fires for a
  `datasets` parent); a read entry on an application's ACL only reaches an application fragment
  (rule B), never a dataset fragment (which needs application context instead, §5). This holds for
  read-only entries built from `admin`-class operations too: `getPermissions`, `readIntegrity` and
  `readIntegrityRevisions` are excluded from the carried-over set (§4, rule A), so a parent entry
  granting only those derives nothing at all.
- **A dataset fragment is never publicly cacheable**, even under a public application, because no
  read entry is ever derived for a dataset fragment (§4.2). Sub-applications of a public dashboard
  stay public and publicly cacheable (rule B).
- **In application context, `permissions.list` early-returns the bypass**
  (`misc/utils/permissions.ts:176-182`): even an owner admin loading a fragment dataset from its
  parent application's page gets *exactly* the declared `applicationKeyPermissions` for that
  request — default read-only — never the union with their normal admin rights. A crowd-sourcing
  application that needs to write to a utility fragment dataset must declare the write operations
  explicitly in `configuration.datasets[i].applicationKeyPermissions`, or writes break for
  *everyone* going through that application context, owner included.
- **Residual privilege consideration.** Whoever attaches a fragment application to a parent also
  chooses that entry's `applicationKeyPermissions`, so an org member holding `readDescription` on
  the parent plus application-create rights can expose the parent's *own* fragment datasets to that
  parent's key holders, with whatever operations they declare. Deviation 3 (§5) narrows this from
  "any same-owner dataset" down to "the parent's own fragments", but does not eliminate it — it is
  the same trust boundary the rest of the application-key model already accepts (the owner decides
  what an application exposes through its key). The anonymous-write anti-spam stack (§10 of
  `application-keys.md`) still applies to any resulting anonymous write.
- **Fragments count toward the owner's `nb_datasets` and storage quotas** (`store_bytes`,
  `indexed_bytes`) exactly like standalone resources. This is a deliberate, revisable product
  decision — not a technical constraint (§10).
- **No resync endpoint for the derived ACL.** If the sync in §4.1 is ever skipped or fails
  mid-request, there is no admin action to force a full recompute; a future upgrade script could
  resync every fragment's ACL in one pass if this is ever needed in practice.
- **Attach / detach of an application invalidates the memoized calling-application entry
  immediately** (`applyPartOfChange` calls `clearApplicationKeysCaches()` on the application branch).
  `findCallingApplication` (`application-key.ts`) caches `{ id, partOf, permissions }` for 30 s and
  both application-context proofs read `partOf` from it, so without that call a just-detached
  sub-application kept resolving as a fragment of its ex-parent for up to 30 s — fail-open. The
  invalidation lives in `applyPartOfChange` rather than at the route because the application PATCH
  returns early for a `partOf`-only body (exactly what the UI sends on attach and detach) and so
  never reaches `patchApplication`'s own clear. The residual cross-node staleness of the 30 s TTL is
  unchanged (`clearApplicationKeysCaches` is same-node only), as for every other key/ACL edit.
- **One nesting level only** — see §1 and §10.

## 10. Future gains (drafted, not built)

Recorded here because they are why the invariant is worth its cost, not because they are planned
work:

1. **Virtual dataset composition wizard.** "Add a file" on a virtual dataset creates a fragment
   dataset, uploads into it, and appends it to `virtual.children` once finalized. The children
   editor lists fragments first. Deleting the virtual dataset cleans everything up — no orphaned
   child datasets in the list.
2. **Dashboard authoring.** Sub-applications are created from inside the dashboard configuration,
   never clutter the applications list, and share the dashboard's protected links and permissions
   without per-app setup.
3. **Application-bound datasets.** Form and crowdsourcing apps create their target dataset as a
   fragment; permissions are managed once, on the application.
4. **Permission UI simplification.** With fragments carrying a derived ACL, the permission tab of a
   parent can present "this resource and its N fragments" as one unit.
5. **Quota policy.** Fragments could stop counting toward `nb_datasets` once the product decides so;
   the accounting is one filter away.
6. **Nesting.** The one-level rule can be relaxed later: the derivation composes (derive from the
   parent's already-derived ACL) without changing the data model.

## 11. Where to look in the code

| Concern | File |
|---|---|
| Pure logic: validation, derivation, write-guard decision, listing filter | `api/src/fragments/operations.ts` |
| `isMasterData` predicate, shared by the attach validation and the write guard | `api/contract/master-data.js` |
| Write guard mounted on all four write routes (§3.1) | `api/src/fragments/middlewares.ts` |
| Mongo-backed operations: attach/detach, sync, delete cascade | `api/src/fragments/service.ts` |
| Schema (`partOf` property) | `api/types/dataset/schema.js`, `api/types/application/schema.js` |
| `Resource` type pick | `api/types/index.ts` |
| Mongo index | `api/src/mongo.ts` |
| Dataset PATCH / owner-change / delete routes | `api/src/datasets/routes/metadata.ts` |
| Dataset creation, delete cascade entry point | `api/src/datasets/service.ts` |
| `detachFromVirtualParents` (every dataset delete, §7) | `api/src/datasets/utils/virtual.ts` |
| Application PATCH / owner-change / delete / creation | `api/src/applications/router.ts`, `api/src/applications/service.ts` |
| `PUT /permissions` refusal + sync hook wiring | `api/src/misc/utils/permissions.ts` (router), `datasets/routes/metadata.ts:96-104`, `applications/router.ts:74-83` |
| Application-context middleware (§5) | `api/src/misc/utils/application-key.ts` |
| Proxy `partOf` reachability edge (§5) | `api/src/applications/proxy-service.ts`, `api/src/applications/middlewares.ts` |
| Websocket application-context (§5) | `api/src/app.js` (`canSubscribe` callback) |
| UI: banner, fragments tab, attach dialog | `ui/src/components/common/fragment-banner.vue`, `fragments-list.vue`, `fragment-attach-dialog.vue` |
| UI: fragment page gates, delete dialog loop | `ui/src/pages/dataset/[id]/index.vue`, `ui/src/pages/application/[id]/index.vue` |
| UI: new-resource `partOf` prefill | `ui/src/pages/new-dataset.vue`, `ui/src/pages/new-application.vue` |
| Tests | `tests/features/fragments/*.spec.ts`, `tests/features/ui/fragments.e2e.spec.ts`, `tests/features/datasets/virtual/virtual-member-deletion.api.spec.ts` |
