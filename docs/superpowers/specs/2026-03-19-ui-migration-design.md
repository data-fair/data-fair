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

## 4. Dataset Page Redesign

### 4a. Dataset Home (`dataset/[id]/index.vue`) — mostly readonly

Uses `layout-section-tabs` to organize sections. Uses `df-navigation-right` for the top-right menu.

**Top-right menu** (`df-navigation-right` with `v-list`):
- Navigation links: edit-metadata, edit-data (if editable), data
- Actions: delete, change owner, re-index, etc.

**Sections:**
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

### 4b. Edit Metadata (`dataset/[id]/edit-metadata.vue`)

Uses `useEditFetch` with `patch: true` to manage dataset metadata centrally. Uses `useLeaveGuard(hasDiff)` for unsaved changes warning. Uses `layout-section-tabs` for section organization.

**Top-right menu** (`df-navigation-right`):
- Save button shown only when `hasDiff` is true (following agents settings page pattern)
- Navigation links back to home/data

**Sections with v-model components editing central state:**
- **Info** — title, description, keywords, license, origin, etc.
- **Schema** — field types, labels, descriptions, concepts (editing mode)
- **Extensions** — enrichment configuration
- **Master data** — reference data settings
- **Virtual dataset** — configuration for virtual datasets (if applicable)
- **Attachments** — additional files

Components use `v-model` to edit the central `data` ref but do not PATCH themselves. Single save button PATCHes only changed fields.

### 4c. Edit Data (`dataset/[id]/edit-data.vue`)

- Only for editable (REST) datasets
- Reuses `dataset-table` component in edition mode
- Redirects or shows message for non-editable datasets

### 4d. Data (`dataset/[id]/data.vue`)

Tabbed view, tabs shown only when relevant to dataset type:
- **Table** — reuses `dataset-table` (readonly)
- **Revisions** — edit history (if REST dataset with history enabled)
- **Map** — reuses `dataset-map` (if geo data)
- **Files** — reuses `dataset-search-files` (if file dataset)
- **Thumbnails** — reuses `dataset-thumbnails` (if image fields)

---

## 5. Server-Side Changes

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

## 6. Migration Ordering

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

### Phase 4 — Dataset pages
- Dataset home (new readonly design)
- Data page (tabbed view)
- Edit-data page (table in edit mode)
- Edit-metadata page (useEditFetch, layout-section-tabs, save button)
- Dataset description, api-doc

### Phase 5 — Cleanup
- Delete `ui-legacy/`
- Delete `nuxt-server/`
- Remove old dependencies and references
- E2E tests with Playwright

---

## 7. E2E Testing

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
| External service embeds | `@data-fair/frame` (d-frame) |
| Icons | `@mdi/js` |
| i18n | `vue-i18n` with per-component `<i18n>` blocks (fr/en) |
| Resource lists | Follow data-fair/portals patterns |
