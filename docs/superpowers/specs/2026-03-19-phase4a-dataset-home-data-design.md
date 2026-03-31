# Phase 4a: Dataset Home + Data Pages — Design Spec

## Overview

Create two new pages for the dataset detail view: a readonly **home page** and a tabbed **data page**. These replace the legacy monolithic `dataset/_id/index.vue` (which combined everything on one page) with a split design that separates readonly viewing from editing.

## Pages

### Dataset Home (`dataset/[id]/index.vue`)

Readonly overview page. Uses `layout-section-tabs` + `df-navigation-right` (same pattern as `application/[id]/index.vue` and `embed/remote-services/[id]/index.vue`).

Provides `provideDatasetStore(id, true)` (draft mode enabled) and subscribes via `useDatasetWatch(['journal', 'info', 'taskProgress'])`.

**Above sections:** `dataset-status` component (processing status, errors, retry button) — shown when dataset is not metaOnly.

**Sections (layout-section-tabs):**

1. **Description** (`id: 'description'`)
   - Rendered markdown description (or plain text)
   - Dataset image if present
   - Summary text

2. **Metadata** (`id: 'metadata'`)
   - Single tab "info": owner, license, keywords, temporal/spatial coverage, update frequency, last modified, record count, storage size, created/updated dates and users
   - Display only, no editing

3. **Schema** (`id: 'schema'`)
   - Single tab: uses existing `dataset-schema-view` component (readonly field list)

4. **Applications** (`id: 'applications'`)
   - Single tab: list of linked applications, fetched from API (`/applications?dataset={id}`)
   - Simple card list with title and link to `/application/{appId}`

5. **Share** (`id: 'share'`, conditional on permissions)
   - Tabs:
     - **Permissions** — `private-access` component (v-model on dataset)
     - **Publication sites** — existing `dataset-publication-sites` component (already uses `useDatasetStore()`)
     - **Related datasets** — existing `dataset-related-datasets` component (already uses `useDatasetStore()`)

6. **Activity** (`id: 'activity'`, conditional on `can('readJournal')`)
   - Single tab: `journal-view` component with journal data and task progress

**Right panel (df-navigation-right):**
- `dataset-actions` component (NEW — see below)
- `layout-toc` with sections, showing task progress in the activity section title

### Data Page (`dataset/[id]/data.vue`)

Tabbed view reusing existing embed components **directly** (not via d-frame). Provides `provideDatasetStore(id, true)` and subscribes via `useDatasetWatch(['info'])` to refresh on finalize.

**Tabs (shown conditionally based on dataset type):**

1. **Table** (always shown if `can('readLines')`) — `dataset-table` component in readonly mode, fixed height
2. **Map** (shown if `dataset.bbox`) — `dataset-map` component, fixed height
3. **Files** (shown if has DigitalDocument schema field) — `dataset-search-files` component, fixed height
4. **Thumbnails** (shown if has image schema field) — `dataset-thumbnails` component, fixed height
5. **Revisions** (shown if REST dataset with `rest.history`) — d-frame to embed table-edit page filtered by revisions (minor feature, no new component)

Each tab component consumes `useDatasetStore()` internally. The parent page sets a fixed height for the content area (e.g., `500px` or computed from viewport).

## New Components

### `dataset-actions.vue`

Right-panel actions for the dataset home page. Migrated from `ui-legacy/public/components/dataset/dataset-actions.vue`.

**Actions:**
- Download links (original file, converted CSV/JSON if available)
- Navigate to edit-metadata (if `can('writeDescription')`)
- Navigate to edit-data (if REST dataset and `can('createLine')`)
- Navigate to data page
- API documentation link
- Re-index action (if `can('writeData')`)
- Delete with confirmation dialog (if `can('delete')`)

Uses `useDatasetStore()` for dataset state and permissions.

## Modified Files

- **`dataset-store.ts`** — Add `applicationsFetch` (fetch applications linked to this dataset), `dataFiles` computed (download file URLs), and expose `resourceUrl` computed.
- **`dataset-watch.ts`** — Already supports `journal`, `info`, `taskProgress` keys. No changes needed.

## Patterns

- `can()` in dataset-store returns `ComputedRef<boolean>` (not plain boolean like application-store). In templates, Vue auto-unwraps refs so `v-if="can('readLines')"` works. In script, use `can('readLines').value`.
- `computedDeepDiff` for sections array to avoid unnecessary re-renders.
- `setBreadcrumbs` for navigation path.
- MDI icons imported from `@mdi/js`.

## Not in Phase 4a scope

- Edit-metadata page (Phase 4e)
- Edit-data page (Phase 4b)
- Schema editing components (Phase 4c)
- Dataset-info editing component (Phase 4d)
- Extensions, virtual dataset, master-data config (Phase 4e)
- Catalogs publishing tab (d-frame to external service, low priority)
- Read API key tab (needs VJSF v4 migration, deferred)
