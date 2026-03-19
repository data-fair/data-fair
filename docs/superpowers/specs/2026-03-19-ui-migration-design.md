# UI Migration: embed-ui becomes the new ui

## Overview

Complete migration from the legacy Nuxt 2 / Vue 2 / Vuetify 2 `ui` workspace to the modern Vue 3 / Vuetify 4 / Vite `embed-ui` workspace. The embed-ui workspace is renamed to `ui` and becomes the single UI entry point. The dataset page is redesigned with a new structure splitting concerns across multiple pages.

## Approach

Big bang rename followed by incremental page migration. The old `ui/` is kept as `ui-legacy/` for reference during migration, then deleted.

---

## 1. Workspace Restructuring

### Directory renames
- `embed-ui/` → `ui/` (new main UI workspace)
- `ui/` → `ui-legacy/` (reference only, deleted at end)
- `nuxt-server/` → deleted at end

### Root package.json
- Replace `"embed-ui"` with `"ui"` in workspaces
- Remove `"nuxt-server"` workspace entry

### Vite config
- Change `base` from `'/data-fair/embed'` to `'/data-fair/'`
- Update `renderBuiltUrl` to use `'/data-fair/'` instead of `'/data-fair/embed/'`
- Update `index.html` template path references

### Context (`src/context.ts`)
- Update router base: `createWebHistory($sitePath + '/data-fair/')`
- `$apiPath` stays `$sitePath + '/data-fair/api/v1'` (no change needed)

### Embed page file move
- Move all existing pages from `src/pages/` into `src/pages/embed/` to preserve `/embed/` prefix URLs for external consumers
- New main pages are created at `src/pages/` root level
- File-based routing produces `/embed/` prefix naturally
- External embed URLs (e.g., `/data-fair/embed/dataset/{id}/table`) remain unchanged
- API-generated preview URLs (`api/src/datasets/utils/index.js`) remain valid

### Root package.json scripts
- Update `lint`, `check-types`, `quality`, `build` scripts that reference `embed-ui`
- Update `dev-ui` script for the renamed workspace

### API server (`api/src/app.js`)
- Mount `ui/dist` as static SPA at `/data-fair/` with index.html fallback
- Remove Nuxt SSR setup (`nuxt.render` fallback, `proxyNuxt` dev mode)
- Remove `nuxt-server` require/import
- CSP handling: path-based logic within the SPA middleware — relaxed CSP (frame-ancestors, unsafe-eval) for `/embed/` paths, standard CSP for other paths
- `trackEmbed` middleware: mount before SPA static middleware for `/embed/` routes
- Remove `nuxtStatus` health check in `api/src/admin/service.ts`, replace with simple check that `ui/dist/index.html` exists

### Dev server
- Vite dev server proxied at `/data-fair/` instead of `/data-fair/embed/`
- Remove Nuxt dev proxy
- Note: HMR port 7200 remains unchanged

---

## 2. Layouts

### Default layout
Full app chrome, migrated from old `ui/public/layouts/default.vue`:
- Top app bar (`v-app-bar`)
- Left navigation drawer (`v-navigation-drawer`) with menu items
- Right sidebar via `df-navigation-right` from `@data-fair/lib-vuetify` (permanent drawer on large screens, FAB menu on small screens)
- Personal menu from `@data-fair/lib-vuetify`

Navigation items (conditional on permissions/config): Home, Datasets, Applications, Remote Services, Catalogs, Processings, Portals, Storage, Settings, Admin, etc.

### Embed layout
Minimal layout, already exists. Kept as-is for pages under `/embed/`.

### Layout switching mechanism
Use Vue Router route meta (e.g., `layout: 'embed'`) combined with a dynamic component in `App.vue`. Embed routes set `meta.layout = 'embed'` via a route-level `definePage` or a file-based convention. `App.vue` reads `route.meta.layout` and renders the appropriate layout wrapper around `<RouterView />`.

---

## 3. Page Migration

### Already in embed-ui (stay in `src/pages/embed/`)
- `dataset/[id]/table.vue`, `table-edit.vue`, `form.vue`, `map.vue`, `thumbnails.vue`, `search-files.vue`, `download.vue`, `journal.vue`, `publication-sites.vue`, `related-datasets.vue`, `fields.vue`, `map-bounds.vue`
- `application/[id]/config.vue`
- `settings/` pages (api-keys, webhooks, datasets-metadata, topics, licenses)
- `admin/` pages (info, base-apps, errors, owners)
- `remote-services/` pages
- `storage.vue`
- `workflow/update-dataset.vue`

### Pages to migrate from ui-legacy (new in `src/pages/`)
- `index.vue` — home/dashboard
- `datasets.vue` — dataset list
- `applications.vue` — application list
- `dataset/[id]/` — dataset pages (see Section 4)
- `dataset/[id]/events.vue` — dataset events (d-frame to events service)
- `application/[id]/index.vue`, `description.vue`, `api-doc.vue`
- `new-dataset.vue`, `new-application.vue`
- `catalogs.vue`, `processings.vue`, `portals.vue`, `events.vue` — module integration pages (d-frame to external services, use `[...path].vue` catch-all for deep iframe path syncing)
- `notifications.vue`, `me.vue`, `organization.vue`, `department.vue`
- `metrics.vue`, `subscription.vue`, `reuses.vue`, `pages.vue`
- `share-dataset.vue`, `api-doc.vue`
- `extra/[id].vue`, `admin-extra/[id].vue` — dynamic extra navigation pages (configurable external iframes)
- `admin/processings-plugins.vue`, `admin/catalogs-plugins.vue` — admin plugin management

### Migration pattern per page
- Vue 3 `<script setup lang="ts">` with `<i18n>` blocks (fr/en)
- Replace Vuex store access with composables (page-level) or props/emits (components)
- Vuetify 4 components
- Replace internal `d-frame` embeds with direct component usage
- Keep `d-frame` for external service embeds only
- VJSF v4 for forms
- Resource lists follow patterns from data-fair/portals
- Same scope and functionality as old pages

---

## 4. Component Migration

Many complex components from ui-legacy have no equivalent in embed-ui and need full migration. Components follow the same migration pattern as pages (`<script setup lang="ts">`, props/emits, Vuetify 4, VJSF v4) but additionally must replace Vuex store access (`mapState`, `mapActions`, `mapGetters`) with either props/emits or composables.

### 4.1 Schema editing components

The schema editor is one of the most complex component trees:

- **`dataset-schema.vue`** (286 lines) — column CRUD, primary key config, drag-and-drop reordering. Embed-ui has a readonly `dataset-schema-view.vue` but the full editor is missing. Migrate as a v-model component for edit-metadata.
- **`dataset-properties-slide.vue`** (532 lines) — detailed property editor with tabs for type, concept mapping, validation, labels, transform, capabilities. Uses vocabulary store for concept matching.
- **`dataset-add-property-dialog.vue`** (107 lines) — dialog for adding properties to REST datasets.
- **`dataset-property-capabilities.vue`** — configure indexing, text standard, facetable.
- **`dataset-property-validation.vue`** — required, min/max, pattern rules.
- **`dataset-property-labels.vue`** — enum values and display labels (uses VJSF).
- **`dataset-property-transform.vue`** (150 lines) — type overrides and transformation expressions.

All these currently call `patchAndCommit()` directly via Vuex. In the new architecture they must use `v-model` to edit the central `useEditFetch` state — no direct API calls from these components.

### 4.2 Dataset metadata components

- **`dataset-info.vue`** (733 lines) — title, description, summary, keywords, spatial/temporal coverage, license, topics, custom metadata fields. Uses facets API for keyword/spatial suggestions. Has sub-components: `markdown-editor.vue`, `dataset-edit-history.vue`, `dataset-edit-ttl.vue`, `dataset-edit-store-updated-by.vue`.
- **`dataset-attachments.vue`** + **`dataset-attachment-dialog.vue`** — file/URL attachments with upload, delete, set as thumbnail.

These also become v-model components under edit-metadata.

### 4.3 Dataset configuration components

- **`dataset-extensions.vue`** (470 lines) — enrichment & calculated columns. Two extension types (remoteService, exprEval), field mapping, auto-update scheduling. Needs remoteServices API. Very complex.
- **`dataset-master-data.vue`** (135 lines) — master data source capabilities (single/bulk search, virtual datasets, standard schema). Uses VJSF.
- **`dataset-virtual.vue`** (563 lines) — virtual dataset configuration: child dataset selection, field inheritance, filter configuration, drag-and-drop. Heavy async API usage.

Same v-model pattern — no direct PATCH calls.

### 4.4 Dataset home components (readonly or action-based)

- **`dataset-status.vue`** (200+ lines) — processing status, error handling, retry. Partial equivalent exists in embed-ui.
- **`dataset-publication-sites.vue`** — portal publication config. Embed-ui has a version already.
- **`dataset-read-api-key.vue`** — read API key display/management.
- **Permissions editor** — access control management (roles, users, organizations). Used on dataset home page.

### 4.5 Application components

- **`application-config.vue`** (367 lines) — already exists in embed-ui, may need updates. Split-screen preview + VJSF form with iframe postMessage communication.
- **`application-info.vue`** (150 lines) — metadata editor (title, description, topics, image, slug).
- **`application-facets.vue`**, **`application-list.vue`**, **`application-card.vue`** — list/display components for applications page. Follow portals resource list patterns.
- **`application-actions.vue`**, **`application-import.vue`**, **`application-integration-dialog.vue`**, **`application-capture-dialog.vue`**, **`application-publication-sites.vue`** — specialized config features.

### 4.6 Shared utility components

- **`markdown-editor.vue`** — markdown editor wrapper (used by dataset-info, application-info, descriptions).
- **`help-tooltip.vue`** — help icon with tooltip (used across schema editing).
- **`confirm-menu.vue`** — already exists in embed-ui.
- **`journal-view.vue`** — already exists in embed-ui.
- **`layout-section-tabs.vue`**, **`layout-toc.vue`**, **`layout-scroll-to-top.vue`** — already exist in embed-ui.

### 4.7 Key migration patterns for components

- **Vuex → v-model**: components that called `patchAndCommit()` become controlled components with `v-model` editing the parent's `useEditFetch` data ref.
- **Draggable.js**: used in schema, virtual, extensions. Migrate to Vue 3 compatible draggable library (e.g., `vuedraggable@next` or `@vueuse/integrations`).
- **VJSF**: upgrade from v2 to v4 (different API, same concept).
- **Vocabulary/concepts store**: currently a Vuex module. Migrate to a composable (embed-ui already has `use-store.ts` as a singleton for vocabulary).
- **Remote services fetching**: currently via Vuex actions. Migrate to a composable or direct `useFetch` calls.

---

## 5. Dataset Page Redesign

### 5a. Dataset Home (`dataset/[id]/index.vue`) — mostly readonly

Uses `layout-section-tabs` to organize sections. Uses `df-navigation-right` for the top-right menu.

**Right panel** (`df-navigation-right`):
- Actions menu: navigation links (edit-metadata, edit-data if editable, data) and actions (delete, change owner, re-index, etc.)
- `layout-toc` below the actions — auto-generated table of contents from `layout-section-tabs`

**Sections** (organized with `layout-section-tabs`):
- **Description** — rendered markdown, image if present
- **Metadata** — owner, license, keywords, temporal/spatial coverage, update frequency, last modified, record count, storage size
- **Schema** — readonly field list (reusing `dataset-schema-view.vue`)
- **Applications** — linked visualizations/reuses
- **Permissions** — access control management
- **Publication sites** — portal publication (direct component, no frame)
- **Catalogs** — catalog publication
- **Read API key** — public access config
- **Journal** — activity/audit log

Inspired by portal dataset page but oriented toward contribution and administration.

### 5b. Edit Metadata (`dataset/[id]/edit-metadata.vue`)

Uses `useEditFetch` with `patch: true` to manage dataset metadata centrally. Uses `useLeaveGuard(hasDiff)` for unsaved changes warning. Uses `layout-section-tabs` for section organization.

**Right panel** (`df-navigation-right`):
- Save button shown only when `hasDiff` is true (following agents settings page pattern)
- Navigation links back to home/data
- `layout-toc` below — auto-generated from `layout-section-tabs`

**Sections with v-model components editing central state:**
- **Info** — title, description, keywords, license, origin, etc.
- **Schema** — field types, labels, descriptions, concepts (editing mode)
- **Extensions** — enrichment configuration
- **Master data** — reference data settings
- **Virtual dataset** — configuration for virtual datasets (if applicable)
- **Attachments** — additional files

Components use `v-model` to edit the central `data` ref but do not PATCH themselves. Single save button PATCHes only changed fields.

### 5c. Edit Data (`dataset/[id]/edit-data.vue`)

- Only for editable (REST) datasets
- Reuses `dataset-table` component in edition mode
- Redirects or shows message for non-editable datasets

### 5d. Data (`dataset/[id]/data.vue`)

Tabbed view, tabs shown only when relevant to dataset type:
- **Table** — reuses `dataset-table` (readonly)
- **Revisions** — edit history (if REST dataset with history enabled)
- **Map** — reuses `dataset-map` (if geo data)
- **Files** — reuses `dataset-search-files` (if file dataset)
- **Thumbnails** — reuses `dataset-thumbnails` (if image fields)

---

## 6. Server-Side Changes

### API server
- Remove Nuxt SSR setup entirely
- Mount `ui/dist` at `/data-fair/` with SPA fallback
- Keep embed CSP handling
- Keep `trackEmbed` middleware

### Dev server
- Vite proxied at `/data-fair/`
- Remove Nuxt dev proxy (`proxyNuxt`)

### Cleanup
- Remove `nuxt-server/` directory
- Remove from root workspaces
- Update CI/build scripts referencing `embed-ui` or `nuxt-server`

---

## 7. Migration Ordering

### Phase 1 — Workspace rename & infrastructure
- Rename directories, update package.json, vite config, server mounts
- Add default layout (nav drawer, top bar)
- Verify existing embed pages still work under `/embed/`

### Phase 2 — Simple pages
- Home, datasets list, applications list
- New dataset, new application
- Module integration pages (catalogs, processings, portals, events)
- Utility pages (notifications, me, organization, department, metrics, subscription, storage, reuses, pages)

### Phase 3 — Application detail pages
- Application index, description, api-doc, config (config already migrated)

### Phase 4 — Dataset pages and components
- Shared utility components first: markdown-editor, help-tooltip
- Dataset home page (readonly) with status, permissions, publication-sites, read-api-key, journal
- Data page (tabbed view reusing existing embed components)
- Edit-data page (table in edit mode)
- Schema editing components: dataset-schema, dataset-properties-slide, property sub-dialogs (capabilities, validation, labels, transform)
- Dataset metadata components: dataset-info (with sub-components), dataset-attachments
- Dataset configuration components: dataset-extensions, dataset-master-data, dataset-virtual
- Edit-metadata page (useEditFetch, layout-section-tabs, wiring all the above as v-model components)
- Dataset description, api-doc

### Phase 5 — Cleanup
- Delete `ui-legacy/`
- Delete `nuxt-server/`
- Remove old dependencies and references
- E2E tests with Playwright

---

## 8. E2E Testing

- Playwright tests for key user flows, kept concise
- Focus: navigation, dataset home loads, edit-metadata save cycle, data page tabs, embed pages accessible
- Follow existing test patterns in the project
- Use Playwright MCP during development for visual verification

---

## Key Libraries & Patterns

| Concern | Tool |
|---|---|
| State management (page-level) | Composables with provide/inject |
| Component communication | Props and emits |
| Editable fetch + save | `useEditFetch` from `@data-fair/lib-vue` |
| Unsaved changes guard | `useLeaveGuard` from `@data-fair/lib-vue` |
| Efficient reactivity | `computedDeepDiff` from `@data-fair/lib-vue` |
| Forms | `@koumoul/vjsf@4` |
| Right-side menu | `df-navigation-right` from `@data-fair/lib-vuetify` |
| Page section organization | `layout-section-tabs` — tabbed sections within pages |
| Table of contents | `layout-toc` — rendered below right actions menu in `df-navigation-right` |
| External service embeds | `@data-fair/frame` (d-frame) |
| Icons | `@mdi/js` |
| i18n | `vue-i18n` with per-component `<i18n>` blocks (fr/en) |
| Resource lists | Follow data-fair/portals patterns |
