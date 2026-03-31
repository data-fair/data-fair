# UI Migration Phase 2: Simple Pages

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate all non-dataset, non-application-detail pages from ui-legacy to the new Vue 3 UI.

**Architecture:** Pages are migrated from Nuxt 2/Vue 2/Vuetify 2 to Vue 3/Vuetify 4 `<script setup lang="ts">` with `<i18n>` blocks. Most pages are d-frame wrappers (external service embeds) and require minimal logic. Complex pages (datasets list, new-dataset) use composables and follow portals list patterns.

**Tech Stack:** Vue 3, Vuetify 4, vue-i18n, @data-fair/lib-vue (useFetch, reactive-search-params), @data-fair/frame (d-frame)

**Spec:** `docs/superpowers/specs/2026-03-19-ui-migration-design.md`

---

### Task 1: d-frame wrapper pages (batch)

These pages all follow the same pattern: a `d-frame` component embedding an external service URL. Migrate them as a batch.

**Files to create:**
- `ui/src/pages/catalogs.vue`
- `ui/src/pages/processings.vue`
- `ui/src/pages/portals.vue`
- `ui/src/pages/events.vue`
- `ui/src/pages/reuses.vue`
- `ui/src/pages/pages.vue`
- `ui/src/pages/metrics.vue`
- `ui/src/pages/admin/processings-plugins.vue`
- `ui/src/pages/admin/catalogs-plugins.vue`

**Reference:** `ui-legacy/public/pages/catalogs.vue` and siblings — all ~48 lines, pure d-frame wrappers.

**Pattern for each page:**

```vue
<template>
  <d-frame
    :src="src"
    @state-change="onStateChange"
  />
</template>

<script lang="ts" setup>
import { computed } from 'vue'

// src URL varies per page:
// catalogs: $sitePath + '/catalogs/catalogs/'
// processings: $sitePath + '/processings/processings/'
// portals: $sitePath + '/portals-manager/portals/'
// events: $sitePath + '/events/embed/events/'
// reuses: $sitePath + '/portals-manager/reuses/'
// pages: $sitePath + '/portals-manager/pages/'
// metrics: $sitePath + '/metrics/embed/home'
// admin/processings-plugins: $sitePath + '/processings/admin/plugins/'
// admin/catalogs-plugins: $sitePath + '/catalogs/admin/plugins/'

const src = computed(() => $sitePath + '/catalogs/catalogs/')

const onStateChange = (state: any) => {
  // breadcrumb/path sync if needed
}
</script>
```

Check `ui-legacy/public/pages/catalogs.vue` for the exact src patterns and state-change handling. The d-frame component is already available (used in embed pages). The `@state-change` handler syncs the iframe path with the browser URL for deep linking. The `@notif` handler shows notifications using `useUiNotif`.

- [ ] **Step 1: Read all 9 legacy pages to get exact src URLs and handlers**
- [ ] **Step 2: Create all 9 pages following the pattern**
- [ ] **Step 3: Verify types check:** `npm -w ui run check-types`
- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/catalogs.vue ui/src/pages/processings.vue ui/src/pages/portals.vue ui/src/pages/events.vue ui/src/pages/reuses.vue ui/src/pages/pages.vue ui/src/pages/metrics.vue ui/src/pages/admin/
git commit -m "feat: add d-frame wrapper pages (catalogs, processings, portals, events, reuses, pages, metrics, admin plugins)"
```

---

### Task 2: v-iframe wrapper pages (batch)

These pages embed simple-directory or other services via v-iframe.

**Files to create:**
- `ui/src/pages/me.vue`
- `ui/src/pages/organization.vue`
- `ui/src/pages/department.vue`
- `ui/src/pages/subscription.vue`
- `ui/src/pages/extra/[id].vue`
- `ui/src/pages/admin-extra/[id].vue`

**Reference:** `ui-legacy/public/pages/me.vue` (~29 lines) and siblings.

**Pattern:** These use `@koumoul/v-iframe` or a simple iframe. In Vue 3, use d-frame or a plain iframe. Check how `ui-legacy/public/pages/me.vue` builds the URL (e.g., `directoryUrl + '/me?embed=true'`). The new pages should use `$uiConfig.directoryUrl` or `$sdUrl` from context.

For `organization.vue` and `department.vue`: these have authorization checks (must be org admin). Migrate the check using `useSessionAuthenticated()`.

For `extra/[id].vue` and `admin-extra/[id].vue`: these render dynamic iframe pages from `$uiConfig.extraNavigationItems` / `$uiConfig.extraAdminNavigationItems` configuration. Look up the item by route param id and render its iframe URL.

- [ ] **Step 1: Read legacy pages to get exact URLs and auth checks**
- [ ] **Step 2: Create all 6 pages**
- [ ] **Step 3: Verify types check**
- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/me.vue ui/src/pages/organization.vue ui/src/pages/department.vue ui/src/pages/subscription.vue ui/src/pages/extra/ ui/src/pages/admin-extra/
git commit -m "feat: add iframe wrapper pages (me, organization, department, subscription, extra)"
```

---

### Task 3: API documentation page

**Files to create:**
- `ui/src/pages/api-doc.vue`

**Reference:** `ui-legacy/public/pages/api-doc.vue` (~22 lines) — renders an OpenAPI viewer component. Check how the legacy page builds the API doc URL and what component it uses. The new page might use a d-frame to the openapi-viewer service or render an inline component.

- [ ] **Step 1: Read legacy page**
- [ ] **Step 2: Create page**
- [ ] **Step 3: Commit**

---

### Task 4: Notifications page

**Files to create:**
- `ui/src/pages/notifications.vue`

**Reference:** `ui-legacy/public/pages/notifications.vue` (~290 lines) — medium complexity with multiple d-frame embeds for device management, dataset/application event subscriptions, and portal-specific subscriptions. Uses webhook schema URLs and publication sites configuration.

Migrate to Vue 3 with `useSessionAuthenticated()` for account info, `useFetch` for publication sites data, and multiple d-frame components.

- [ ] **Step 1: Read legacy page, understand webhook schema URL construction and publication sites logic**
- [ ] **Step 2: Create page with all d-frame sections**
- [ ] **Step 3: Verify types check**
- [ ] **Step 4: Commit**

---

### Task 5: Home/dashboard page

**Files to modify:**
- `ui/src/pages/index.vue` (replace placeholder)

**Reference:** `ui-legacy/public/pages/index.vue` (~333 lines) — dashboard with conditional sections based on account type (user/org/department), permission levels (admin/contrib), and subscription status. Shows metric cards for datasets and applications.

Simplify for now: show basic account info, links to key sections, storage summary. The dashboard metric card components (datasets-error, datasets-draft, etc.) are complex and can be added incrementally. Start with a functional but simpler dashboard.

- [ ] **Step 1: Read legacy page to understand structure**
- [ ] **Step 2: Create simplified dashboard with account info and key navigation links**
- [ ] **Step 3: Commit**

---

### Task 6: Datasets list page

**Files to create:**
- `ui/src/pages/datasets.vue`

**Reference:** `ui-legacy/public/pages/datasets.vue` wraps `dataset-list` component (~80 lines). The actual list component is complex (infinite scroll, facets, filters, API pagination).

Follow portals list pattern: use `useFetch` with reactive query params (`useStringSearchParam` for search, sort). Use `v-data-iterator` or manual rendering with `v-card` grid. Include basic search and sorting. Faceted filtering can be added later.

The page should:
- Fetch datasets from `$apiPath + '/datasets'` with params (size, page, q, sort, owner, select)
- Display as cards in a grid
- Support search via `useStringSearchParam('q')`
- Support sorting
- Link each dataset card to `/dataset/{id}`
- Include a "New dataset" button linking to `/new-dataset`

- [ ] **Step 1: Read legacy dataset-list component to understand API params and display**
- [ ] **Step 2: Create datasets page with list, search, and basic pagination**
- [ ] **Step 3: Commit**

---

### Task 7: Applications list page

**Files to create:**
- `ui/src/pages/applications.vue`

Same pattern as datasets list but for applications.

- [ ] **Step 1: Read legacy application-list component**
- [ ] **Step 2: Create applications page with list, search, and basic pagination**
- [ ] **Step 3: Commit**

---

### Task 8: New dataset page (placeholder)

**Files to create:**
- `ui/src/pages/new-dataset.vue`

**Reference:** `ui-legacy/public/pages/new-dataset.vue` (~1,051 lines) — very complex multi-step wizard. Create a functional but simplified version for now. The full wizard with all 4 dataset types (file, REST, virtual, metadata-only) can be refined in a follow-up.

Start with: file upload (the most common flow). Use a v-stepper with steps: choose type → upload file → configure → create.

- [ ] **Step 1: Read legacy page to understand the creation flow**
- [ ] **Step 2: Create simplified new-dataset page with file upload flow**
- [ ] **Step 3: Commit**

---

### Task 9: New application page

**Files to create:**
- `ui/src/pages/new-application.vue`

**Reference:** `ui-legacy/public/pages/new-application.vue` (~34 lines) — simple wrapper around `application-import` component. Create a basic version that lists available base apps and allows creating a new application.

- [ ] **Step 1: Read legacy page**
- [ ] **Step 2: Create new-application page**
- [ ] **Step 3: Commit**

---

### Task 10: Share dataset and remaining pages

**Files to create:**
- `ui/src/pages/share-dataset.vue` — complex 5-step wizard, create as placeholder
- `ui/src/pages/update-dataset.vue` — already exists in embed, create redirect or wrapper

- [ ] **Step 1: Create placeholder pages**
- [ ] **Step 2: Commit**

---

### Task 11: E2E tests for Phase 2

**Files to create:**
- `tests/features/ui/navigation.e2e.spec.ts`

Test key flows:
- Navigate to datasets list, verify it loads
- Navigate to d-frame pages (catalogs, settings), verify frames load
- Navigate to home dashboard

- [ ] **Step 1: Write tests**
- [ ] **Step 2: Run and verify**
- [ ] **Step 3: Commit**
