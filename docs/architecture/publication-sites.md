# Publication Sites

Publication sites are the mechanism by which a Data Fair instance knows about the external web portals on which its datasets and applications can be exposed. In practice, a publication site is the Data-Fair-side record of a portal (served by the `portals` service), with just enough metadata for Data Fair to:

- render deep links from the back-office to the pages of that portal,
- authorise (or refuse) a user who tries to publish a resource on that portal,
- filter read queries so that the portal only sees the subset of resources that are published on it.

They are the glue between two services that otherwise do not know about each other: `data-fair` owns datasets and applications, `portals` owns the public-facing sites. Neither has a foreign key into the other — they rendezvous on a synthetic string of the form `"{type}:{id}"`, e.g. `data-fair-portals:my-portal`.

## 1. Data model

### The publication site document

Publication sites are not stored in their own collection. They live as an array on the per-owner `settings` document, with their schema defined in `api/contract/publication-sites.js`. Each entry has:

| Field | Purpose |
|---|---|
| `type` | Namespacing for the site source (default `data-fair-portals`). |
| `id` | Unique within `type`. `{type}:{id}` is the canonical reference used everywhere else. |
| `url` | Production URL of the portal. |
| `draftUrl` | URL of the portal's draft/preview site. |
| `title` | Human-readable label. |
| `datasetUrlTemplate` / `applicationUrlTemplate` | URL templates like `{url}/datasets/{id}` used to deep-link from the back-office. |
| `private` | Deprecated hint that the portal requires authentication. |
| `department` | When the owner is an organization, restricts the site to one department. |
| `settings.staging` | If true, the site behaves as a pre-production target and bypasses the admin publication check (see §4). |
| `settings.contributorDepartments` | Array of department ids whose admins may publish on this org-root site as if it were owned by their department (see §4). |
| `settings.datasetsRequiredMetadata` | Metadata fields that must be filled before a dataset may be published there. |

A `department`-scoped settings document can hold its own `publicationSites`, which merge with the organization-level list when read (see `api/src/settings/router.ts:363`).

### References on resources

Datasets and applications carry two parallel arrays of `{type}:{id}` strings (see `api/types/dataset/schema.js` and the matching application schema):

- `publicationSites` — the site is actively publishing this resource.
- `requestedPublicationSites` — the contributor has asked for publication; an admin of the owner organisation must approve by moving the reference to `publicationSites`.

Both arrays are indexed (`publicationSites_1`, see `api/src/mongo.ts:70`) so Mongo queries like `{ publicationSites: 'data-fair-portals:foo' }` stay cheap — they are what the portal uses to list its resources.

## 2. API surface

Publication sites themselves are exposed under the settings router (`api/src/settings/router.ts`):

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/v1/settings/{type}/{id}/publication-sites` | owner member | Merged list for the owner (org + department). |
| `POST /api/v1/settings/{type}/{id}/publication-sites` | owner admin | Upsert — **used by the portals service to sync itself**. Also subscribes the owner to the publication-request notifications for this site (dataset + application). |
| `DELETE /api/v1/settings/{type}/{id}/publication-sites/{siteType}/{siteId}` | owner admin | Remove the site and cascade `$pull` on every dataset and application that references it (`settings/router.ts:438-439`). |

Publication of a resource onto a site is not a dedicated endpoint: it is done by patching the resource itself.

- `PATCH /api/v1/datasets/{id}` with a new `publicationSites` / `requestedPublicationSites` array.
- `PATCH /api/v1/applications/{id}` with the same fields.

The diff is inspected by `api/src/misc/utils/publication-sites.ts → applyPatch`, which enforces permissions (see §4) and emits the appropriate notifications.

Read side: `GET /api/v1/datasets?publicationSites=data-fair-portals:foo` filters the listing and is what portals use to enumerate their resources.

## 3. Ownership and scoping

Publication sites are owned, just like every other configurable object in Data Fair:

- A user owner has a flat list of sites.
- An organisation owner has an organisation-level list **plus** an optional per-department list. Reading the sites of a department-scoped user merges the two (`settings/router.ts:367-372`); reading with `department=*` returns every site of the org regardless of department.
- Uniqueness of a site is enforced on `(type, id)` within a single settings document.

`api/src/misc/utils/settings.ts` memoises publication site lookups with a 1-minute TTL, because they are hit on every permission check.

## 4. Permissions model

Publication sites define a publish-gate that sits on top of the normal permission system. The operation is declared in `api/src/misc/utils/api-docs.ts:11,18`:

- `writePublicationSites` belongs to the **admin** class, for both datasets and applications.

The enforcement logic lives in `publication-sites.ts:applyPatch` and is applied whenever `publicationSites` or `requestedPublicationSites` change on a patch. For every **added** or **removed** entry in `publicationSites`, the rules are:

1. **Department boundary** (lines 50, 74). If the session user is not in `adminMode`, the resource owner is an organization, the session account is that same organization with a department, and the publication site has *no* `department` (i.e. it is an organisation-wide site), publishing/unpublishing is refused with `403 publication site does not belong to user department` — **unless** the user's department is listed in the site's `settings.contributorDepartments` array (see below). This prevents a department contributor from publishing on a cross-department site they are not explicitly invited to.
2. **Admin gate** (lines 53, 77). Publishing or unpublishing on a site where `settings.staging !== true` requires the `writePublicationSites` admin permission on the resource. Non-admin contributors therefore can only publish freely on sites flagged as staging.

### Contributor departments

An org-root publication site may carry `settings.contributorDepartments: string[]`. For users whose session department is in that list, the site is treated as if it were owned by their department for the two checks above. This enables co-ownership of a portal across a subset of the organisation's departments without lowering the bar to `staging` level.

- The field is editable on the portal side only (`portals` service), and is mirrored into the data-fair publication site by the existing sync — the sync is the source of truth, `settings.contributorDepartments` rides along like `settings.staging`.
- The defensive check at POST `/settings/.../publication-sites` refuses a non-empty `settings.contributorDepartments` on a dept-scoped settings document (spec Q4-era constraint: only org-root sites may share).
- Revocation is **not** cascading and does **not** relax subsequent checks. Dept admins lose the ability to unpublish their already-published resources once their dept is removed from the list — only an org-root admin can then clean up. This is deliberate: the list is a capability grant, not a history.
- GET `/settings/.../publication-sites` decorates each entry with a response-only `canContributeAsDepartment: true` flag when the requesting user's department is in the list. The UI publication panels consume this flag to enable the publish switch and render a "Portail contributeur" label.

Requests (`requestedPublicationSites`) are **not** subject to the admin gate — they are explicitly the contributor-facing alternative. Adding a requested publication emits a `publication-requested:{site}` notification (line 87), which the site owner has been subscribed to at registration time (`settings/router.ts:401-416`). A site admin then approves by moving the reference from `requestedPublicationSites` into `publicationSites` via a new patch, which now passes the admin gate.

When a publication is effectively performed, `applyPatch` emits `published:{site}` and, for each topic on the resource, `published-topic:{site}:{topicId}`. If a resource becomes public after already being on a site, `onPublic` (same file) re-emits the same events so subscribers learn about the new visibility.

## 5. UI surface

The back-office exposes publication sites at three layers:

- **Settings page** (`ui/src/components/settings/settings-publication-sites.vue`, used from `ui/src/pages/settings/index.vue`). The form is driven by `publicationSitesContract` (see `api/contract/publication-sites.js:1`); fields sourced from the portals manager (`type`, `id`, `department`, `datasetUrlTemplate`, `applicationUrlTemplate`) are rendered read-only for everyone, the deprecated `private` flag is hidden, and the `admin` flag controls whether `title`/`url`/`draftUrl`/`settings.staging`/`settings.contributorDepartments` are editable (adminMode on) or read-only. `settings.contributorDepartments` is edited on the portal side and overwritten on every sync.
- **Per-resource publication panel** (`ui/src/components/dataset/dataset-publication-sites.vue`, `ui/src/components/application/application-publication-sites.vue`). Fetches the sites the current user may target, renders one switch per site, warns on missing required metadata, and surfaces the `datasetUrlTemplate` / `applicationUrlTemplate` deep link once published. When the backend decorates a site with `canContributeAsDepartment`, the panel renders a "Portail contributeur" subtitle and sorts the row next to the user's own dept sites.
- **Faceted search** (`ui/src/components/dataset/dataset-facets.vue` et al.). Publication sites appear as facets so users can filter listings by where a resource is exposed.

## 6. Relationship to the `portals` service

`portals` is the service that actually hosts public sites. It is the sole writer of publication site documents in Data Fair — users do not create sites by hand, they create portals, and portals mirror themselves into Data Fair.

### Sync from portal → publication site

The mirroring happens in `portals/api/src/portals/service.ts`:

- `getPublicationSite(portal)` (line 122) is the pure mapping from a portal record to a publication site payload. The important choices:
  - `type` is always `data-fair-portals`, `id` is the portal's MongoDB `_id`.
  - `url` / `draftUrl` come from the ingress if one is configured, otherwise from a subdomain pattern (`config.portalUrlPattern`).
  - `datasetUrlTemplate` and `applicationUrlTemplate` default to `{url}/datasets/{id|slug}` — `slug` if the portal has its own ingress, `id` otherwise.
  - `private: true` is set when the portal's config demands authentication.
  - `settings.staging` is passed through verbatim from `portal.staging` (default `false`). The portal is the source of truth for the staging flag — see below.
  - `settings.contributorDepartments` is passed through verbatim from `portal.contributorDepartments` (default `[]`). This field is set from the portal admin UI and, like `settings.staging`, overwrites the data-fair stored value on every sync through the `settings` merge.
- `syncPortalUpdate(portal, previousPortal, reqOrigin, forceSync, cookie)` (line 223) is called from `createPortal`, `patchPortal` and `validatePortalDraft`. It diffs the computed publication site against the previous one and, if different, does a synchronous `POST` to `/data-fair/api/v1/settings/{ownerType}/{ownerId}/publication-sites` with the user's cookie as authorisation (line 233). The same function also syncs the portal to `simple-directory` (for session / site scoping) and to the ingress manager, using dedicated secret keys.
- `deletePortal` calls `syncPortalDelete` which issues the matching `DELETE`, triggering the cascade described in §2.

Because the sync reuses the end-user cookie, it is subject to the normal `isOwnerAdmin` check on the Data Fair side — a user who is not admin of the owner cannot register a portal against that owner.

### Reverse direction

There is no Data-Fair → portals webhook for publication events. The only inbound traffic on `portals` from Data Fair is on `/api/identities` (user / organisation lifecycle), protected by `config.secretKeys.identities`. Publication notifications stay inside the notification bus (topics `data-fair:dataset-publication-requested:{type}:{id}`, `published:{site}`, etc.); the portal learns that it has new content to show by querying Data Fair's read APIs with the `publicationSites` filter, not by being pushed to.

### Consequences for the permissions feature

Because portals push themselves through the regular settings API, everything described in §4 automatically applies to them: a portal registered against an organisation-wide owner produces an organisation-wide publication site; a portal registered against a department owner produces a department-scoped site.

Both `settings.staging` and `settings.contributorDepartments` are **portal-owned**: they live on the portal document, are edited on the portal side (creation wizard + portal actions menu), are authorised by `assertAccountRole(session, portal.owner, 'admin')`, and are mirrored onto the data-fair publication site on every sync. Data-fair treats the sync as authoritative for these two fields — any local edit on the data-fair settings UI is transient and will be overwritten on the next sync. The data-fair upsert at POST `/settings/.../publication-sites` merges the incoming `settings` sub-object into the existing one, so portal-owned keys (`staging`, `contributorDepartments`) override, while data-fair-only keys (`datasetsRequiredMetadata`) are preserved across syncs.

## 7. Quick map of the relevant files

- `api/contract/publication-sites.js` — JSON schema of a publication site entry.
- `api/src/settings/router.ts` — CRUD endpoints; also the sync entry point used by `portals`.
- `api/src/misc/utils/publication-sites.ts` — permission gate and notifications on patch.
- `api/src/misc/utils/api-docs.ts` — declares `writePublicationSites` as an admin operation.
- `api/src/misc/utils/settings.ts` — cached settings lookup used by permission checks.
- `api/src/datasets/service.js`, `api/src/applications/service.js` — call into `applyPatch` when resources are patched.
- `ui/src/components/settings/settings-publication-sites.vue` — admin editor.
- `ui/src/components/dataset/dataset-publication-sites.vue`, `ui/src/components/application/application-publication-sites.vue` — per-resource publication UI.
- `portals/api/src/portals/service.ts` — `getPublicationSite`, `syncPortalUpdate`, `syncPortalDelete`.
