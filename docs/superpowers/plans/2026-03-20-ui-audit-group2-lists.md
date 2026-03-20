# Group 2 — List Pages Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify datasets and applications list pages have full feature parity with legacy, proper TypeScript, good Vuetify usage, and sufficient test coverage.

**Architecture:** Side-by-side comparison of legacy vs new list pages, checking facets, search, sorting, pagination, and responsive behavior.

**Tech Stack:** Vue 3, Vuetify 4, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Group 2

---

### Task 1: Audit datasets list page

**Files:**
- Read (legacy): `ui-legacy/public/pages/datasets.vue`, `ui-legacy/public/components/dataset-list.vue`, `ui-legacy/public/components/dataset-card.vue`, `ui-legacy/public/components/dataset-facets.vue`
- Read (new): `ui/src/pages/datasets.vue`, `ui/src/components/dataset/dataset-card.vue`, `ui/src/components/dataset/dataset-list-item.vue`, `ui/src/components/dataset/dataset-facets.vue`, `ui/src/composables/use-catalog-list.ts`

- [ ] **Step 1: Compare facets**

Legacy facets to check: owner, status, draftStatus, visibility, topics, publicationSites, requestedPublicationSites, services, concepts. Verify each is present in the new facets component with correct API parameter names.

- [ ] **Step 2: Compare search and sort**

Verify: debounced search, sort options match legacy (relevance, title, createdAt, updatedAt, dataUpdatedAt), URL param sync.

- [ ] **Step 3: Compare pagination/infinite scroll**

Verify infinite scroll via `v-intersect` triggers loading more results. Check loading states.

- [ ] **Step 4: Compare grid/list toggle**

Legacy had grid and list views. Verify both exist and render correctly.

- [ ] **Step 5: Check mobile behavior**

Verify facets move to a dialog on mobile. Check that `useDisplay()` is used (not `$vuetify.breakpoint`).

- [ ] **Step 6: Fix any gaps found**

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/datasets.vue ui/src/components/dataset/
git commit -m "fix: datasets list parity improvements from audit"
```

---

### Task 2: Audit applications list page

**Files:**
- Read (legacy): `ui-legacy/public/pages/applications.vue`, `ui-legacy/public/components/application-list.vue`, `ui-legacy/public/components/application-card.vue`, `ui-legacy/public/components/application-facets.vue`
- Read (new): `ui/src/pages/applications.vue`, `ui/src/components/application/application-card.vue`, `ui/src/components/application/application-facets.vue`

- [ ] **Step 1: Compare facets**

Legacy facets to check: owner, base-application, visibility, topics, publicationSites, requestedPublicationSites.

- [ ] **Step 2: Compare search, sort, pagination**

Same checks as datasets.

- [ ] **Step 3: Check mobile behavior**

- [ ] **Step 4: Fix any gaps and commit**

```bash
git add ui/src/pages/applications.vue ui/src/components/application/
git commit -m "fix: applications list parity improvements from audit"
```

---

### Task 3: TypeScript audit for list composable and components

**Files:**
- `ui/src/composables/use-catalog-list.ts`
- `ui/src/components/dataset/dataset-card.vue`
- `ui/src/components/dataset/dataset-list-item.vue`
- `ui/src/components/dataset/dataset-facets.vue`
- `ui/src/components/application/application-card.vue`
- `ui/src/components/application/application-facets.vue`

- [ ] **Step 1: Type the useCatalogList composable**

Check return types, params type, API response types. Use `api/types/dataset` and `api/types/application` for the list items.

- [ ] **Step 2: Type card and facet component props**

Verify props use proper types (not `any` for dataset/application objects).

- [ ] **Step 3: Fix and commit**

```bash
git add ui/src/composables/use-catalog-list.ts ui/src/components/dataset/ ui/src/components/application/
git commit -m "fix: improve TypeScript types in list pages and components"
```

---

### Task 4: Verify test coverage

**Files:**
- `tests/features/ui/datasets-list.e2e.spec.ts` (10 tests)
- `tests/features/ui/applications-list.e2e.spec.ts` (9 tests)

- [ ] **Step 1: Review existing tests**

Check if they cover: search, sort, facet filtering, grid/list toggle, empty state, navigation to detail/new pages.

- [ ] **Step 2: Add any missing interaction tests**

Priority gaps: facet filtering interaction, infinite scroll loading.

- [ ] **Step 3: Run all tests and commit**

```bash
npx playwright test tests/features/ui/datasets-list.e2e.spec.ts tests/features/ui/applications-list.e2e.spec.ts
git add tests/features/ui/
git commit -m "test: improve list page e2e coverage"
```
