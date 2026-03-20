# Deferred Features — Full Parity Design Spec

**Date:** 2026-03-20
**Branch:** feat-upgrade-ui
**Goal:** Complete feature parity between legacy Nuxt 2/Vue 2 UI and new Vue 3/Vuetify 4 UI by implementing all deferred features from Phases 3 and 4, refining simplified pages, and cleaning up legacy code.

## Approach

Features are grouped by shared patterns (Approach B) to maximize component reuse and minimize duplication. Within each group, features are ordered by user impact.

## Prerequisites

**P1. Normalize `can()` API across stores:** `dataset-store.ts` returns `ComputedRef<boolean>` while `application-store.ts` returns raw `boolean`. Shared components (owner-change, notifications, webhooks) must not call `can()` directly — instead, receive a pre-resolved boolean prop (e.g., `:can-admin="can('admin').value"` for datasets, `:can-admin="can('admin')"` for applications).

**P2. Events URL convention:** The legacy UI derives `eventsUrl` as `window.location.origin + '/events'` (set in `ui-legacy/public/plugins/session.js`). The new UI should use the same convention. The `$uiConfig.eventsIntegration` boolean (from `api/src/ui-config.ts`) gates whether to show events-related actions. No new ui-config field needed.

**P3. New dependency: `js-file-download`** — add to `ui/package.json` for capture dialog PNG download. Alternative: use native `URL.createObjectURL` + anchor click to avoid the dependency.

**P4. Use `d-frame` instead of `v-iframe`** — the legacy capture dialog uses `@koumoul/v-iframe` which is not in the new UI. `d-frame` from `@data-fair/frame` (already installed) is the replacement. Verify `d-frame` supports `sync-state` prop for the capture preview; if not, add `@koumoul/v-iframe` as dependency.

**P5. i18n convention:** All components use `<i18n lang="yaml">` blocks with both `fr` and `en` translations. New components must follow this pattern.

---

## Group 1 — Shared Dialogs

### 1.1 Owner Change Dialog — `owner-change-dialog.vue`

Shared component used by both datasets and applications.

**Props:** `resource` (dataset/application object), `resourceType` ('datasets' | 'applications'), `canAdmin` (boolean)

**Behavior:**
- Uses `owner-pick` from `@data-fair/lib-vuetify` for owner selection. `owner-pick` requires the current `activeAccount` from session state.
- Warning checklist before confirmation (permissions, apps, portals, catalogs, API keys, processings)
- API: `PUT /api/v1/{resourceType}/{id}/owner` with new owner object
- On success: redirect to resource detail page under new owner context

**Wiring:** Added to both `dataset-actions.vue` and `application-actions.vue`. Guarded by `canAdmin` prop.

### 1.2 Integration Dialog — `integration-dialog.vue`

Shared component for generating embed code snippets.

**Props:** `resourceType`, `resource`, `previews` (array, datasets only)

**Behavior:**
- Two modes: `iframe` (simple HTML snippet) and `d-frame` (advanced, with optional "sync params" toggle)
- d-frame mode generates a `<d-frame>` HTML snippet (code generation only, no live preview embedding)
- For datasets: uses `dataset.previews` array, defaults to 'table' preview
- For applications: uses application URL directly
- Copy-to-clipboard button for generated code

**Wiring:** Added to both `dataset-actions.vue` and `application-actions.vue`.

### 1.3 Application Slug Editing

Add slug edit dialog to `application-actions.vue`, same pattern as `dataset-info.vue` slug edit dialog:
- Text field with validation
- `PATCH /api/v1/applications/{id}` with new slug

---

## Group 2 — Dataset File Operations

### 2.1 Dataset Upload/Update Dialog — `dataset-upload-dialog.vue`

For updating data files on existing file-based datasets.

**Behavior:**
- File selection with type validation (reuses logic from `new-dataset.vue`)
- Advanced options: encoding selection (CSV/TSV/TXT), normalization options (Excel/ODS), escapeKeyAlgorithm
- Optional attachments zip upload
- Upload progress bar with cancel capability
- API: `PUT /api/v1/datasets/{id}` with multipart FormData (dataset file + optional attachments + body JSON + encoding + normalize options)

**Wiring:** Added to `dataset-actions.vue`, visible only for file-based datasets.

### 2.2 REST Bulk Upload — refactor existing `dataset-rest-upload-actions.vue`

The component already exists in the new UI at `ui/src/components/dataset/dataset-rest-upload-actions.vue`. Review and complete it to match legacy behavior:
- File picker accepting CSV, GeoJSON, XLSX, ODS
- Separator selection (for CSV)
- "Drop all lines" checkbox for destructive replace
- API: `POST /api/v1/datasets/{id}/_bulk_lines` with file
- Results summary: nbOk, nbCreated, nbModified, nbDeleted, nbErrors, nbWarnings with line numbers

**Wiring:** Verify it's properly wired into `dataset-actions.vue`, visible only for REST datasets.

---

## Group 3 — External Service Dialogs

### 3.1 Notifications Dialog — `notifications-dialog.vue`

Shared component embedding the external events service UI.

**Props:** `resource`, `resourceType`, `canSubscribe` (boolean)

**Behavior:**
- Events URL derived as `window.location.origin + '/events'` (same convention as legacy)
- Constructs iframe URL: `{eventsUrl}/embed/subscribe?key={keys}&title={titles}&url-template={urlTemplate}&sender={sender}&register=false`
- Event keys filtered by resource type (e.g., `data-fair:dataset-{id}-*` for datasets)
- Wrapped in `v-dialog` with responsive sizing
- Only shown if `$uiConfig.eventsIntegration` is true

**Wiring:** Added to both `dataset-actions.vue` and `application-actions.vue`.

### 3.2 Webhooks Dialog — `webhooks-dialog.vue`

Same pattern as notifications but for the webhooks endpoint.

**Behavior:**
- Iframe URL: `{eventsUrl}/embed/subscribe-webhooks?key={keys}&title={titles}&sender={sender}`
- Same URL construction with sender and event filtering
- Admin-only: guarded by `canAdmin` prop

**Wiring:** Added to both `dataset-actions.vue` and `application-actions.vue`, admin-only.

---

## Group 4 — Dataset-Specific Features

### 4.1 New Dataset Page Rewrite — `new-dataset.vue`

Full rewrite of the creation page as a stepper matching legacy behavior.

**Step 1 — Type selection:** Four options presented as cards: file, REST, virtual, metadata-only.

**Step 2 — Init from (optional, skippable):** `dataset-init-from.vue` component:
- Select existing dataset as template via autocomplete search
- API: `GET /api/v1/datasets?q={search}&owner={owner}&select=title,id,schema,description` for search
- Choose parts to copy: data, schema, extensions, metadataAttachments, description
- If copying data, schema is auto-included
- Can only copy data from queryable datasets (filter by `status: 'finalized'`)

**Steps 3+ — Type-specific parameters:**
- **File:** file upload + advanced options (encoding, escapeKeyAlgorithm slug|compat-ods, normalize) + optional attachments zip
- **REST:** title + history toggle + line ownership (admin only) + attachments toggle
- **Virtual:** title + children dataset selector (autocomplete search of owned datasets) + auto-fill schema from children + initialize description/attachments from first child
- **MetaOnly:** just title

**Final step — Action:**
- Owner selection via `owner-pick` from `@data-fair/lib-vuetify` (receives `activeAccount` from session)
- Conflict detection via `dataset-conflicts.vue`: queries `GET /api/v1/datasets?title={title}` and `GET /api/v1/datasets?filename={filename}` to check for duplicates, displays list with links
- Create button with progress tracking
- API: `POST /api/v1/datasets` with appropriate body (FormData for file, JSON for REST/virtual/metaOnly). Query param `draft=true` for large files or schema initialization.

### 4.2 Read API Key — `dataset-read-api-key.vue`

**Behavior:**
- VJSF v4 form. Schema fetched at runtime from `GET /api/v1/datasets/{id}/schema?type=readApiKey` or hardcoded based on legacy `api/types/dataset/schema` definition (to be determined during implementation — check what endpoint exposes the readApiKey sub-schema)
- Displays current key with expiration date and example URL
- API: `GET {resourceUrl}/read-api-key` for current key, `PATCH` for updates

**Wiring:** Added as a section on dataset home page.

### 4.3 Revisions Wiring

`dataset-edit-history.vue` already exists but isn't wired into the dataset home page. Add it as a section for REST datasets with `rest.history` enabled.

---

## Group 5 — Application-Specific Features

### 5.1 Application Capture Dialog — `application-capture-dialog.vue`

Server-side screenshot via the capture service. The application object has `captureUrl` set by the API proxy (`api/src/applications/proxy.js:201`).

**Behavior:**
- Width/height inputs (defaults from `prodBaseApp.meta['df:capture-width']` / `['df:capture-height']`, or 800x450)
- If base app supports `df:sync-state` (check `prodBaseApp.meta['df:sync-state']`): shows `d-frame` preview (or `v-iframe` if `d-frame` lacks sync-state support) where user navigates to choose capture state, state params forwarded as `app_*` query params
- Download button constructs URL: `{application.href}/capture?width={w}&height={h}&updatedAt={fullUpdatedAt}&app_*={stateParams}`
- Fetches PNG blob via `GET` with `responseType: 'blob'`, saves via `js-file-download` (or native `URL.createObjectURL` + anchor click)

**Wiring:** Added to `application-actions.vue`.

### 5.2 Application Attachments

Two components:

**`application-attachments.vue`** — list view:
- Download links for each attachment
- Set-as-thumbnail option
- Delete with confirmation
- API: `GET/DELETE /api/v1/applications/{id}/metadata-attachments/{name}`

**`application-attachment-dialog.vue`** — upload dialog:
- Name input, file select, upload progress
- Duplicate name warning
- API: `POST /api/v1/applications/{id}/metadata-attachments` with multipart FormData

**Wiring:** Added as a section/tab on `application/[id]/index.vue`.

### 5.3 Version Upgrade Notifications

**Behavior:**
- Uses or creates `application-versions` composable to compute available versions from base application registry
- Shows alert/banner on application detail page when a newer version of the base application exists
- Action button to trigger upgrade: `PATCH /api/v1/applications/{id}` with `{ url: newVersion.url }` (updates the base app URL to the newer version)
- Confirmation dialog before upgrade (can break existing config)

**Wiring:** Added to `application/[id]/index.vue`.

---

## Group 6 — Share Dataset Page

Full rewrite of `share-dataset.vue` as a 5-step publication workflow stepper.

**Step 1 — Portal selection:**
- Fetch publication sites: `GET /api/v1/settings/{ownerType}/{ownerId}` → `settings.publicationSites` array
- For org-level accounts without department, use `department: '*'` to get all department-scoped sites
- Warning if no publication sites configured

**Step 2 — Dataset selection:**
- `dataset-select` autocomplete scoped to owner + portal department
- API: `GET /api/v1/datasets?owner={owner}&q={search}` for search
- Warning if dataset already published on selected portal (check `dataset.publicationSites` array)
- Loads full dataset on selection: `GET /api/v1/datasets/{id}`

**Step 3 — Permissions:**
- Embedded `permissions` component in simple mode
- Gated by `can('getPermissions')`, disabled if `!can('setPermissions')`
- Shows dependency warning if dataset has public applications (`hasPublicApplications` getter)

**Step 4 — Metadata:**
- `dataset-info` in simple mode with required fields from `publicationSite.settings.datasetsRequiredMetadata`
- Form validation gate before proceeding

**Step 5 — Action:**
- "Publish" button if `can('writePublicationSites')` or staging mode, and department matches
- Otherwise "Request publication" button (submits to admin)
- Publish: `PATCH /api/v1/datasets/{id}` with updated `publicationSites` array
- Request: `PATCH /api/v1/datasets/{id}` with updated `requestedPublicationSites` array
- On success: redirect to portal URL template `publicationSite.datasetUrlTemplate` (replacing `{id}` and `{slug}`) or dataset detail page

---

## Group 7 — Phase 5 Cleanup

**Delete legacy workspaces:**
- Remove `ui-legacy/` directory entirely
- Remove `nuxt-server/` directory entirely
- Clean up all references: root `package.json`, `Dockerfile`, `tsconfig`, eslint config, zellij layout, CI/CD, docker-compose, nginx configs

**Remove old dependencies:**
- Strip Nuxt/Vue 2 related deps from root `package.json` (nuxt-start, vue 2, vuex, etc.)

**Audit d-frame pages:**
- Check all Phase 2 d-frame wrapper pages — any pointing to legacy routes need URL updates or native replacements
- Verify all iframe URLs still work after legacy removal
- Target pages to audit: catalogs, processings, portals, events, reuses, pages, metrics, admin plugins, me, organization, department, subscription, extra, admin-extra

---

## Implementation Order

1. **Prerequisites** (P1-P5) — resolve before starting any group
2. **Group 1** (shared dialogs) — builds reusable components needed by Groups 4-6
3. **Group 2** (dataset file ops) — high user impact
4. **Group 3** (external service dialogs) — shared iframe pattern, quick to build
5. **Group 4** (dataset-specific) — largest group; new-dataset rewrite is the most complex single feature, with `dataset-init-from.vue` and `dataset-conflicts.vue` as significant sub-components
6. **Group 5** (application-specific) — capture + attachments + versions
7. **Group 6** (share dataset) — full stepper, depends on dataset-info and permissions components
8. **Group 7** (cleanup) — only after all features confirmed working

Groups 4 and 5 can be partially parallelized since they target different stores, components, and pages.
