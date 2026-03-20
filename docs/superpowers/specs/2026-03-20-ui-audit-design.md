# UI Migration Audit — Design Spec

> **Phase:** Pre-cleanup audit (between deferred features and Phase 5 cleanup)
> **Branch:** `feat-upgrade-ui`
> **Goal:** Thorough review of every migrated page and layout to fix drift, ensure functional parity with legacy, verify component sharing, Vuetify usage, TypeScript types, and minimal test coverage before manual testing.

---

## Approach

Hybrid: fix cross-cutting infrastructure gaps first, then audit pages by group.

**Group ordering rationale:** infrastructure first (unblocks all d-frame pages), then simplest pages (d-frame wrappers) to most complex (workflows), ending with embed pages (light check only). This ensures systemic fixes are in place before per-page review, and groups that share context are audited together.

## Audit Dimensions

Every audited page/component is checked against:

1. **Functionality parity** — compare with legacy page (or design spec for redesigned pages). Missing features, wrong behavior, lost props/events.
2. **Component sharing** — duplication across pages, missed reuse of existing components, embed pages sharing components with main pages.
3. **TypeScript** — use `api/types/` imports for API responses and store state. Eliminate `any` on props, emits, composable return values, API responses, v-model bindings. Do not create new type definitions — only use what `api/types/` provides.
4. **Vuetify usage** — use Vuetify components with minimal CSS overrides, proper slot usage, no reimplemented Vuetify features.
5. **Responsive/mobile** — verify breakpoint usage migrated from `$vuetify.breakpoint` to `useDisplay()`, check mobile-specific behaviors (filter dialogs, breadcrumb hiding, layout adjustments).
6. **Tests** — proportional coverage: simple d-frame wrappers get a smoke test, complex native pages get smoke + interaction tests.

## Fix Boundaries

- Fix drift and bugs — yes
- Add missing parity features (d-frame sync, breadcrumbs) — yes
- Refactor working code for style preference — no
- Create new type definitions not in `api/types/` — no
- Rewrite components that work but are imperfect — no, only fix clear issues

## Commit Strategy

- Part 1 breadcrumbs (composable + rendering): one commit
- Part 1 adapter + catch-all routes: one commit (separate from breadcrumbs in case adapter needs a compatibility shim)
- One commit per group audit (fixes + tests together)

---

## Part 1: D-Frame Infrastructure Fix

### Problem

All ~15 d-frame wrapper pages are missing two features from the legacy UI:

1. **Breadcrumb display** — the legacy top bar received `postMessage` breadcrumbs from iframes and rendered `v-breadcrumbs`. The new UI has a `setBreadcrumbs()` utility that *sends* breadcrumbs (for when the new UI is embedded) but does not *receive* or *render* them.
2. **Deep URL sync** — the legacy used `createStateChangeAdapter(router)` on each d-frame plus catch-all `_page.vue` routes to enable bidirectional URL sync between parent and iframe. The new UI has `dFrameContent(router)` in `main.ts` and `sync-params`/`sync-path` attributes but no `:adapter` prop and no catch-all routes.

### Design

1. **`useBreadcrumbs()` composable** — reactive `breadcrumbItems` ref + `receiveBreadcrumbs(message)` handler that maps iframe paths to parent routes using the `sync-path` prefix. Provided at App.vue level via provide/inject.

2. **Breadcrumb rendering** — add `v-breadcrumbs` to `layout-navigation-top.vue`, conditionally shown when items exist and on `md+` breakpoints (matching legacy).

3. **State change adapter** — each d-frame page gets `:adapter` prop bound to `createStateChangeAdapter(router)` (from `@data-fair/frame/lib/vue-router/state-change-adapter`), plus `@message` handler feeding breadcrumbs into the composable.

   > **Risk:** The adapter was written for Vue Router 3. Vue Router 4 has API differences (`router.currentRoute` is a ref, different `push` return behavior). Verify compatibility first; if incompatible, write a thin shim or fork the adapter function.

4. **Catch-all routes** — add `[...page].vue` under each d-frame page's directory (e.g., `pages/catalogs/[...page].vue`) rendering an empty `<div>`. This is a simplification from the legacy's 5-level nested `_page.vue` approach — Vue Router 4's `[...param]` catch-all natively captures arbitrarily deep paths in a single file, achieving the same URL pattern matching.

5. **E2e smoke test** — one test verifying a d-frame page loads and renders its iframe.

### Notifications queue gap

The legacy `layout-navigation-top.vue` includes a `<notifications-queue>` component showing real-time notification alerts (when `user && env.eventsUrl`). The new top bar does not have this. This is noted as a known gap but not in scope for this audit — it requires the events service integration which is external.

---

## Part 2: Page Group Audits

### Group 1 — D-frame wrapper pages

**D-frame pages:** catalogs, processings, portals, events, reuses, pages, metrics, notifications, api-doc, admin/processings-plugins, admin/catalogs-plugins

**Plain iframe pages:** me, organization, department, subscription, extra, admin-extra

**Scope — d-frame pages:**
- Verify each has correct `src`, `sync-path`, `:adapter`, `@message` handler after infra fix
- Smoke test: one shared test hitting 2-3 representative d-frame pages

**Scope — plain iframe pages:**
- Verify correct `src` URL, authorization guards, height/resize behavior
- These do not get adapter/sync/breadcrumbs — they are cross-origin iframes to simple-directory or external services

### Group 2 — List pages

**Pages:** datasets, applications

**Scope:**
- Compare facets, sort options, search behavior, infinite scroll with legacy
- Verify `useCatalogList` composable is properly typed
- Verify grid/list toggle (datasets), mobile filter dialog
- Already 19 e2e tests — check coverage is sufficient

### Group 3 — Dataset detail pages

**Pages:** dataset/[id]/index, data, edit-data, edit-metadata

**Scope:**
- Intentionally redesigned (single legacy page → 4 pages), so parity check is against the design spec not legacy 1:1
- Verify all sections from spec are present and wired
- Check `dataset-store.ts` typing against `api/types/dataset`
- Already 14 e2e tests — check for gaps in edit-data and data page interactions

### Group 4 — Application detail pages

**Pages:** application/[id]/index, config, api-doc

**Scope:**
- Compare with legacy tabs, actions, journal, publication sites
- Check `application-store.ts` typing against `api/types/application`
- Already 3 e2e tests — add interaction tests for key actions

### Group 5 — Workflow pages

**Pages:** new-dataset, new-application, share-dataset

**Scope:**
- Compare new-dataset stepper with legacy (4 types, init-from, conflict detection)
- Compare share-dataset publication stepper with legacy workflow
- Check new-application against legacy
- No dedicated e2e tests — add smoke + one interaction each

### Group 6 — Dashboard + navigation

**Pages:** index (home), layout-navigation-left (nav drawer)

**Scope:**
- Compare home dashboard sections with legacy (contribute, manage, metrics)
- Verify nav drawer permission logic, collapsible groups, extra nav items
- Already 16 e2e tests — check coverage is sufficient

### Group 7 — Embed pages

**Pages:** all under `pages/embed/`

**Scope:**
- Light check: verify imports are correct after workspace rename
- Check that embed pages share components with main pages (dataset-table, dataset-map, etc.)
- No new tests unless something is broken
