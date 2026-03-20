# Remaining Gaps — Design Spec

> **Date:** 2026-03-20
> **Branch:** `feat-upgrade-ui`
> **Goal:** Fix all 15 gaps identified during the pre-cleanup audit, completing functional parity before the final cleanup phase.

---

## Approach

Dependency-first ordering: build shared utilities and composables first, then wire them into consuming pages. Four phases: foundation, dataset gaps, application + workflow gaps, infrastructure gaps.

## Guiding Principle

Imitate the legacy codebase (`ui-legacy/`) for all features. No redesign — match existing behavior, API usage, and UX patterns. Translate Vue 2/Vuex patterns to Vue 3 Composition API / Pinia-style composables.

---

## Phase 1 — Foundation

### 1a. `useDatasetsMetadata` composable

**File:** `ui/src/composables/use-datasets-metadata.ts`

- Fetches `GET /api/v1/settings/{type}/{id}/datasets-metadata` for a given owner
- Caches by owner key (`{type}/{id}`) to avoid redundant fetches
- Returns reactive `datasetsMetadata` object
- Used by `dataset-info.vue` to conditionally display metadata fields

**Legacy reference:** `ui-legacy/public/store/index.js` — `fetchDatasetsMetadata` action, `ownerDatasetsMetadata` getter.

### 1b. `useNotificationsWS` composable

**File:** `ui/src/composables/use-notifications-ws.ts`

- Adapts `useWS` from `@data-fair/lib-vue` for real-time notification delivery
- Subscribes to WebSocket channel `user:{userId}:notifications`
- Emits incoming notifications to a callback
- Handles reconnection via the `useWS` built-in mechanism

**Legacy reference:** `ui-legacy/public/plugins/ws.js` (ReconnectingWebSocket + eventBus), `ui-legacy/public/components/notifications-queue.vue` (subscription pattern).

### 1c. `permissions-editor.vue` component

**File:** `ui/src/components/permissions-editor.vue`

Native Vue 3 recreation of legacy `ui-legacy/public/components/permissions.vue`.

**Props:**
- `resource` — dataset or application object
- `resourceType` — `'datasets' | 'applications'`
- `canGetPermissions` — boolean
- `canSetPermissions` — boolean

**Features:**
- Visibility dropdown: public / private / organization scopes
- Contrib profile selector for organization-owned resources
- Detailed mode: permission dialog + data table (scope, actions, delete controls)
- Role-based restrictions for organizations
- Warning for public apps with private dataset dependencies

**API:** `GET/PUT /api/v1/{resourceType}/{id}/permissions`

---

## Phase 2 — Dataset Gaps

### 2a. Conditional metadata fields in `dataset-info.vue` (Gap 1)

Wire `useDatasetsMetadata` composable into `dataset-info.vue`. Conditionally render fields based on `datasetsMetadata.{fieldName}` truthy check:

- `projection` — coordinate reference system selector
- `spatial` — spatial coverage (bounding box or geometry)
- `temporal` — temporal coverage (start/end dates)
- `frequency` — update frequency selector
- `creator` — data creator/producer
- `modified` — source modification date (distinct from system updated date)
- `customMetadata` — VJSF form driven by schema from `datasetsMetadata.customMetadata`
- `attachmentsAsImage` — toggle to display attachments as images

**Legacy reference:** `ui-legacy/public/components/dataset/dataset-info.vue` lines 234-383.

### 2b. Revisions tab in `data.vue` (Gap 2)

Add a "Revisions" tab in `dataset/[id]/data.vue`, visible when `dataset.rest?.history === true`.

**New component:** `dataset-history.vue`
- Paginated data table: revision actions (create/update/delete) with icons
- Attachment previews for digital document fields
- "Fetch more" pagination
- API: `GET {resourceUrl}/revisions` with `page` and `size` params

**Legacy reference:** `ui-legacy/public/components/dataset/dataset-history.vue`.

### 2c. Catalog publications section (Gap 3)

Add section in dataset home page share area.

**Conditions:** `$uiConfig.catalogsIntegration && can('admin').value`

**Implementation:** d-frame pointing to `{window.location.origin}/catalogs/dataset-publications?dataset-id={dataset.id}` with `sync-params` attribute and `@notif` handler for snackbar notifications.

**Legacy reference:** `ui-legacy/public/pages/dataset/_id/index.vue` lines 313-376.

### 2d. Events/traceability link in `dataset-actions.vue` (Gap 4)

Add list item in dataset-actions.

- **Route:** `/dataset/{id}/events`
- **Condition:** `can('changeOwner').value && $uiConfig.eventsIntegration`
- **Icon:** `mdi-clipboard-text-clock`
- **Label:** i18n key `events`

**Legacy reference:** `ui-legacy/public/components/dataset/dataset-actions.vue` lines 108-120.

### 2e. WebSocket progress updates in `dataset-watch.ts` (Gap 5)

Extend the existing `useDatasetWatch` composable with the full event-state mapping from legacy. Currently only handles `finalize-end` and `draft-cancelled`.

**Event-state mapping to add:**
```
data-updated → loaded
store-start → loaded
store-end → stored
normalize-start → stored
normalize-end → normalized
analyze-start → normalized
analyze-end → analyzed
validate-start → analyzed
validate-end → validated
extend-start → validated
extend-end → extended
index-start → extended
index-end → indexed
finalize-start → indexed
error → error
```

On each state change, update `dataset.status` in the store reactively so the UI (dataset-status component, progress indicators) updates in real time.

**Legacy reference:** `ui-legacy/public/store/dataset.js` lines 21-39, 214-260.

### 2f. nbVirtualDatasets in dataset home (Gap 6)

**Store addition:** In `dataset-store.ts`, add `nbVirtualDatasets` state + fetch via `GET /api/v1/datasets?children={id}&size=0` → store `result.count`.

**Display:** In dataset info section, show count as a link to `/datasets?children={id}` (filtered dataset list showing virtual datasets derived from this one).

**Legacy reference:** `ui-legacy/public/store/dataset.js` line 191-192, `ui-legacy/public/components/dataset/dataset-info.vue` lines 54-62.

### 2g. Raw REST download in `dataset-actions.vue` (Gap 7)

Add list item in dataset-actions.

- **href:** `{resourceUrl}/raw`
- **Condition:** `dataset.isRest && user?.adminMode`
- **Icon:** `mdi-progress-download` with admin color styling
- **Labels:** i18n keys `downloadRawRest` / `downloadRawRestSubtitle`

**Legacy reference:** `ui-legacy/public/components/dataset/dataset-actions.vue` lines 27-40.

---

## Phase 3 — Application + Workflow Gaps

### 3a. Application copy mode in `new-application.vue` (Gap 8)

Add creation type selection step to `new-application.vue`.

**Two modes:**
- "From template" — existing baseApp selection flow (current behavior)
- "Copy existing" — application autocomplete search, pre-fills title with `"{title} (copy)"`, sends POST with source app's configuration

**API:** `POST /api/v1/applications` with body containing `url`, `configuration`, `datasets` from the source application.

**Legacy reference:** `ui-legacy/public/components/application/application-import.vue` lines 1-120.

### 3b. `dataset-normalize-options.vue` (Gap 9)

**File:** `ui/src/components/dataset/dataset-normalize-options.vue`

Simple form component with three number fields:
- `spreadsheetWorksheetIndex` — sheet number
- `spreadsheetHeaderLine` — header row number
- `spreadsheetStartCol` — first data column number

v-model binding with deep watch to clean empty/null values.

**Wiring:** Shown in `new-dataset.vue` file step for spreadsheet formats (xlsx, ods, xls).

**Legacy reference:** `ui-legacy/public/components/dataset/dataset-normalize-options.vue`.

### 3c. suggestArchive alert in `new-dataset.vue` (Gap 10)

Add `v-alert` in the file selection step.

**Condition:** `file.size > 50_000_000 && /\.(csv|tsv|txt|geojson)$/i.test(file.name)`

**Content:** i18n message suggesting compression to .gz or .zip archive, interpolated with filename.

**Legacy reference:** `ui-legacy/public/components/dataset/dataset-import-file.vue` lines 40-45.

### 3d. Full permissions editor in `share-dataset.vue` (Gap 11)

Replace the current simplified info note in step 3 with `permissions-editor.vue` from Phase 1 (1c).

**Props wiring:**
- `canGetPermissions` from dataset `can('getPermissions').value`
- `canSetPermissions` from dataset `can('setPermissions').value`
- `resource` = selected dataset
- `resourceType` = `'datasets'`

**Additional:** Show dependency warning if dataset has public applications (`hasPublicApplications` check via applications fetch).

### 3e. Full portal metadata in `share-dataset.vue` (Gap 12)

In step 4, fetch portal settings via `GET /api/v1/settings/{ownerType}/{ownerId}` to get `publicationSite.settings.datasetsRequiredMetadata` array.

Pass as `required` prop to `dataset-info` component (which highlights those fields and validates them).

Gate step progression on metadata validation passing.

**Legacy reference:** `ui-legacy/public/pages/share-dataset.vue` lines 170-181.

---

## Phase 4 — Infrastructure Gaps

### 4a. Real-time WebSocket notifications in `notifications-queue.vue` (Gap 13)

Replace polling with `useNotificationsWS` composable from Phase 1 (1b).

**Behavior:**
- On mount: subscribe to `user:{userId}:notifications` channel
- On incoming notification: prepend to list, mark as `new`, update unread count
- Keep initial fetch via `GET {eventsUrl}/api/v1/notifications` for state on load
- Remove polling interval

**Legacy reference:** `ui-legacy/public/components/notifications-queue.vue` lines 115-134.

### 4b. Extra page breadcrumb relay (Gap 14)

Extend `useBreadcrumbs` composable's `receiveBreadcrumbs` to handle breadcrumbs from extra/iframe pages.

**Mapping:** iframe breadcrumb paths → parent route query params (`?p={path}`), matching legacy `extra-page.js` mixin pattern.

**Wiring:** Add `@message` handler on `extra.vue` and `admin-extra.vue` d-frame pages to feed breadcrumbs through.

**Legacy reference:** `ui-legacy/public/mixins/extra-page.js` lines 20-27.

### 4c. `me.vue` missingSubscription redirect (Gap 15)

In `me.vue` `onMounted`:
- Check `missingSubscription` from `usePermissions` composable (condition: `limits?.defaults && $uiConfig.subscriptionUrl`)
- If true and `activeAccount.type === 'organization'`, `router.replace('/subscription')`

**Legacy reference:** `ui-legacy/public/pages/me.vue` lines 18-23, `ui-legacy/public/store/index.js` `missingSubscription` getter.

---

## Implementation Order

1. **Phase 1 — Foundation** (1a, 1b, 1c) — shared composables and permissions editor
2. **Phase 2 — Dataset gaps** (2a–2g) — conditional fields, revisions, catalogs, events link, WS progress, nbVirtualDatasets, raw REST download
3. **Phase 3 — Application + workflow** (3a–3e) — copy mode, normalize options, suggestArchive, share-dataset permissions + metadata
4. **Phase 4 — Infrastructure** (4a–4c) — WS notifications, breadcrumb relay, missingSubscription redirect

Phases 2 and 3 can be partially parallelized since they target different pages and stores.

## Commit Strategy

- One commit per phase sub-item (e.g., one commit for 2a, one for 2b, etc.)
- Foundation commits first since they are dependencies
- E2E tests included with each commit where testable (revisions tab, permissions editor, copy mode)

## Testing

- **permissions-editor.vue:** dedicated e2e test verifying visibility toggle and permission add/remove
- **dataset-history.vue:** e2e test for revisions tab visibility and pagination
- **dataset-watch.ts progress:** verify via existing dataset processing e2e tests (status updates should now show intermediate states)
- **new-application copy mode:** e2e test for copy flow
- **Quick fixes (2d, 2f, 2g, 4c):** covered by existing smoke tests or manual verification; no dedicated tests needed
