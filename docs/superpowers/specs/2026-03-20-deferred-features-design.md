# Deferred Features — Full Parity Design Spec

**Date:** 2026-03-20
**Branch:** feat-upgrade-ui
**Goal:** Complete feature parity between legacy Nuxt 2/Vue 2 UI and new Vue 3/Vuetify 4 UI by implementing all deferred features from Phases 3 and 4, refining simplified pages, and cleaning up legacy code.

## Approach

Features are grouped by shared patterns (Approach B) to maximize component reuse and minimize duplication. Within each group, features are ordered by user impact.

---

## Group 1 — Shared Dialogs

### 1.1 Owner Change Dialog — `owner-change-dialog.vue`

Shared component used by both datasets and applications.

**Props:** `resource` (dataset/application object), `resourceType` ('datasets' | 'applications')

**Behavior:**
- Uses `owner-pick` from `@data-fair/lib-vuetify` for owner selection
- Warning checklist before confirmation (permissions, apps, portals, catalogs, API keys, processings)
- API: `PUT /api/v1/{resourceType}/{id}/owner` with new owner object
- On success: redirect to resource detail page under new owner context

**Wiring:** Added to both `dataset-actions.vue` and `application-actions.vue`.

### 1.2 Integration Dialog — `integration-dialog.vue`

Shared component for generating embed code snippets.

**Props:** `resourceType`, `resource`, `previews` (array, datasets only)

**Behavior:**
- Two modes: `iframe` (simple HTML snippet) and `d-frame` (advanced, with optional "sync params" toggle)
- d-frame mode includes live preview panel
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

### 2.2 REST Bulk Upload Dialog — `dataset-bulk-upload-dialog.vue`

For bulk importing lines into REST datasets.

**Behavior:**
- File picker accepting CSV, GeoJSON, XLSX, ODS
- Separator selection (for CSV)
- "Drop all lines" checkbox for destructive replace
- API: `POST /api/v1/datasets/{id}/_bulk_lines` with file
- Results summary: nbOk, nbCreated, nbModified, nbDeleted, nbErrors, nbWarnings with line numbers

**Wiring:** Added to `dataset-actions.vue`, visible only for REST datasets.

---

## Group 3 — External Service Dialogs

### 3.1 Notifications Dialog — `notifications-dialog.vue`

Shared component embedding the external events service UI.

**Props:** `resource`, `resourceType`

**Behavior:**
- Constructs iframe URL from `$uiConfig.eventsUrl` with query params: event keys filtered by resource type, title, URL template, sender info
- Wrapped in `v-dialog` with responsive sizing
- Only shown if `$uiConfig.eventsUrl` is configured

**Wiring:** Added to both `dataset-actions.vue` and `application-actions.vue`.

### 3.2 Webhooks Dialog — `webhooks-dialog.vue`

Same pattern as notifications but for the webhooks endpoint.

**Behavior:**
- Iframe embed to events service webhooks endpoint
- Same URL construction with sender and event filtering
- Admin-only: guarded by admin permission check

**Wiring:** Added to both `dataset-actions.vue` and `application-actions.vue`, admin-only.

---

## Group 4 — Dataset-Specific Features

### 4.1 New Dataset Page Rewrite — `new-dataset.vue`

Full rewrite of the creation page as a stepper matching legacy behavior.

**Step 1 — Type selection:** Four options presented as cards: file, REST, virtual, metadata-only.

**Step 2 — Init from (optional, skippable):** `dataset-init-from.vue` component:
- Select existing dataset as template via autocomplete search
- Choose parts to copy: data, schema, extensions, metadataAttachments, description
- If copying data, schema is auto-included
- Can only copy data from queryable datasets

**Steps 3+ — Type-specific parameters:**
- **File:** file upload + advanced options (encoding, escapeKeyAlgorithm, normalize) + optional attachments zip
- **REST:** title + history toggle + line ownership (admin only) + attachments toggle
- **Virtual:** title + children dataset selector (autocomplete search of owned datasets) + auto-fill schema from children + initialize description/attachments from first child
- **MetaOnly:** just title

**Final step — Action:**
- Owner selection via `owner-pick`
- Conflict detection via `dataset-conflicts.vue` (checks duplicate titles and filenames, displays list with links)
- Create button with progress tracking
- API: `POST /api/v1/datasets` with appropriate body (FormData for file, JSON for REST/virtual/metaOnly)

### 4.2 Read API Key — `dataset-read-api-key.vue`

**Behavior:**
- VJSF v4 form using readApiKey schema from API (active toggle, interval dropdown)
- Displays current key with expiration date and example URL
- API: `GET {resourceUrl}/read-api-key` for current key, `PATCH` for updates

**Wiring:** Added as a section on dataset home page.

### 4.3 Revisions Wiring

`dataset-edit-history.vue` already exists but isn't wired into the dataset home page. Add it as a section for REST datasets with `rest.history` enabled.

---

## Group 5 — Application-Specific Features

### 5.1 Application Capture Dialog — `application-capture-dialog.vue`

Server-side screenshot via the application service's `/capture` endpoint.

**Behavior:**
- Width/height inputs (defaults from `prodBaseApp.meta['df:capture-width']` / `['df:capture-height']`, or 800x450)
- If base app supports `df:sync-state`: shows `v-iframe` preview where user navigates to choose capture state, state params forwarded as `app_*` query params
- Download button: `GET {application.href}/capture?width=&height=&updatedAt=&app_*=`
- Saves PNG blob via `js-file-download`

**Wiring:** Added to `application-actions.vue`.

### 5.2 Application Attachments

Two components:

**`application-attachments.vue`** — list view:
- Download links for each attachment
- Set-as-thumbnail option
- Delete with confirmation

**`application-attachment-dialog.vue`** — upload dialog:
- Name input, file select, upload progress
- Duplicate name warning

**Wiring:** Added as a section/tab on `application/[id]/index.vue`.

### 5.3 Version Upgrade Notifications

**Behavior:**
- Check available versions for the base application
- Show alert/banner on application detail page when newer version exists
- Action button to trigger upgrade

**Wiring:** Added to `application/[id]/index.vue`, uses or creates `application-versions` composable.

---

## Group 6 — Share Dataset Page

Full rewrite of `share-dataset.vue` as a 5-step publication workflow stepper.

**Step 1 — Portal selection:**
- List available publication sites from owner's settings (fetched from API)
- Scoped by department if applicable (`department: '*'` for org-level)
- Warning if no publication sites configured

**Step 2 — Dataset selection:**
- `dataset-select` autocomplete scoped to owner + portal department
- Warning if dataset already published on selected portal
- Loads dataset into store on selection

**Step 3 — Permissions:**
- Embedded `permissions` component in simple mode
- Gated by `can('getPermissions')`, disabled if `!can('setPermissions')`
- Shows dependency warning if dataset has public applications

**Step 4 — Metadata:**
- `dataset-info` in simple mode with required fields from `publicationSite.settings.datasetsRequiredMetadata`
- Form validation gate before proceeding

**Step 5 — Action:**
- "Publish" button if `can('writePublicationSites')` or staging mode, and department matches
- Otherwise "Request publication" button (submits to admin)
- Publish: `PATCH` dataset with updated `publicationSites` array
- Request: `PATCH` dataset with updated `requestedPublicationSites` array
- On success: redirect to portal URL template (if available) or dataset detail page

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

---

## Implementation Order

1. **Group 1** (shared dialogs) — builds reusable components needed by Groups 4-6
2. **Group 2** (dataset file ops) — high user impact
3. **Group 3** (external service dialogs) — shared iframe pattern, quick to build
4. **Group 4** (dataset-specific) — largest group, new-dataset rewrite is the most complex single feature
5. **Group 5** (application-specific) — capture + attachments + versions
6. **Group 6** (share dataset) — full stepper, depends on dataset-info and permissions components
7. **Group 7** (cleanup) — only after all features confirmed working

Groups 4 and 5 can be partially parallelized since they target different domains.
