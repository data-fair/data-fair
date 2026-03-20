# Group 3 — Dataset Detail Pages Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify the 4 new dataset detail pages (home, data, edit-data, edit-metadata) collectively cover ALL functionality from the single legacy dataset page and its sub-pages.

**Architecture:** Inventory every feature in the legacy dataset page, map each to its location in the new pages, fix any gaps.

**Tech Stack:** Vue 3, Vuetify 4, TypeScript, `api/types/dataset`

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Group 3

---

### Task 1: Inventory legacy dataset page features

**Files:**
- Read: `ui-legacy/public/pages/dataset/_id/index.vue`
- Read: `ui-legacy/public/pages/dataset/_id/description.vue`
- Read: `ui-legacy/public/pages/dataset/_id/events.vue`
- Read: `ui-legacy/public/store/dataset.js`
- Read: `ui-legacy/public/components/dataset-actions.vue`
- Read: `ui-legacy/public/components/dataset-status.vue`
- Read: All dataset-* components in `ui-legacy/public/components/`

- [ ] **Step 1: List every tab/section in the legacy dataset page**

Expected tabs from legacy index.vue: Description, Schema, Data, Enrichment/Extensions, Attachments, Permissions/Share, Activity/Journal. Plus actions in the top bar.

- [ ] **Step 2: List every action available in legacy**

Expected: Edit (navigate to description), View data, Download (various formats), API doc, Delete, Change owner, Upload/update file, Integration/embed code, Notifications subscription, Webhooks, Read API key, Slug editing.

- [ ] **Step 3: List every component used in legacy dataset pages**

Create a mapping checklist:
```
Legacy component → New location (page + component) or "MISSING"
```

- [ ] **Step 4: Document the inventory as a checklist for subsequent tasks**

---

### Task 2: Map legacy features to new pages

Using the inventory from Task 1, map each feature to one of the 4 new pages:

- [ ] **Step 1: Map to dataset/[id]/index.vue (home)**

Expected: readonly display of description, metadata summary, schema view, applications list, permissions/publication-sites, journal/activity, status, breadcrumbs.

- [ ] **Step 2: Map to dataset/[id]/data.vue**

Expected: data table, map, search-files, thumbnails (via tabs).

- [ ] **Step 3: Map to dataset/[id]/edit-data.vue**

Expected: editable data table for REST datasets.

- [ ] **Step 4: Map to dataset/[id]/edit-metadata.vue**

Expected: dataset-info (title, description, license, topics, etc.), dataset-schema (editable), dataset-extensions, dataset-master-data, dataset-virtual, dataset-attachments.

- [ ] **Step 5: Map actions to dataset-actions.vue**

Expected: all legacy actions present somewhere — either in the actions panel or as dialogs accessible from the relevant page.

- [ ] **Step 6: Identify any MISSING features**

Create a gap list with severity (must-fix vs acceptable-omission).

---

### Task 3: Fix identified gaps

- [ ] **Step 1: Fix each must-fix gap**

For each missing feature, either:
- Add the missing component/section to the appropriate page
- Add a missing dialog or action link
- Document as intentionally deferred (with rationale)

- [ ] **Step 2: Verify component sharing**

Check that components used in both home (readonly) and edit-metadata (editable) share code properly. E.g., `dataset-schema-view.vue` (readonly) vs `dataset-schema.vue` (editable) — verify they don't duplicate rendering logic unnecessarily.

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/dataset/ ui/src/components/dataset/
git commit -m "fix: dataset detail pages parity gaps from audit"
```

---

### Task 4: TypeScript audit

**Files:**
- `ui/src/composables/dataset-store.ts`
- `ui/src/composables/dataset-watch.ts`
- `ui/src/composables/dataset-lines.ts`
- `ui/src/composables/dataset-filters.ts`
- All dataset components in `ui/src/components/dataset/`
- `api/types/dataset/index.ts` and `api/types/dataset/index.d.ts`

- [ ] **Step 1: Check dataset-store.ts types**

The store should use `Dataset` type from `api/types/dataset`. Check:
- `dataset` ref type
- `journal` entries type
- `applicationsFetch` response type
- `can()` method parameter and return types
- All computed properties

- [ ] **Step 2: Check component props types**

Verify dataset components that receive the dataset object use the proper type, not `any`.

- [ ] **Step 3: Check v-model bindings in edit-metadata**

The edit-metadata page uses v-model on dataset-info, dataset-schema, etc. Verify these bindings are typed.

- [ ] **Step 4: Fix and commit**

```bash
git add ui/src/composables/ ui/src/components/dataset/
git commit -m "fix: improve TypeScript types in dataset detail pages"
```

---

### Task 5: Vuetify and responsive audit

- [ ] **Step 1: Check Vuetify usage in dataset components**

Look for:
- Custom CSS that could be replaced with Vuetify utility classes or props
- Missing density/variant props where needed
- Reimplemented features (e.g., custom tabs instead of v-tabs)

- [ ] **Step 2: Check responsive behavior**

Verify layout-section-tabs, dataset-actions panel, and data page tabs work on mobile.

- [ ] **Step 3: Fix and commit**

```bash
git add ui/src/components/dataset/ ui/src/pages/dataset/
git commit -m "fix: Vuetify and responsive improvements in dataset pages"
```

---

### Task 6: Verify test coverage

**Files:**
- `tests/features/ui/dataset-pages.e2e.spec.ts` (14 tests)

- [ ] **Step 1: Review existing tests**

Check coverage of: home page sections, data page table, edit-data interactions, edit-metadata save flow, navigation between pages.

- [ ] **Step 2: Identify gaps**

Priority: data page tab switching, edit-data for REST datasets, action dialogs (upload, delete, etc.).

- [ ] **Step 3: Add missing tests**

- [ ] **Step 4: Run and commit**

```bash
npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts
git add tests/features/ui/
git commit -m "test: improve dataset detail page e2e coverage"
```
