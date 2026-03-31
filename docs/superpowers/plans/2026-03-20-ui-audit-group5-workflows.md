# Group 5 — Workflow Pages Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify new-dataset, new-application, and share-dataset workflow pages match legacy functionality, with proper TypeScript and new e2e tests.

**Architecture:** Side-by-side comparison with legacy workflow pages.

**Tech Stack:** Vue 3, Vuetify 4, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Group 5

---

### Task 1: Audit new-dataset page

**Files:**
- Read (legacy): `ui-legacy/public/pages/new-dataset.vue`
- Read (new): `ui/src/pages/new-dataset.vue`, `ui/src/components/dataset/dataset-init-from.vue`, `ui/src/components/dataset/dataset-conflicts.vue`

- [ ] **Step 1: Compare creation flows**

Legacy supports: file upload, REST dataset, virtual dataset, metadata-only. Verify all 4 types are present in the new stepper.

- [ ] **Step 2: Compare init-from (template initialization)**

Verify init-from component matches legacy behavior.

- [ ] **Step 3: Compare conflict detection**

Verify duplicate detection works.

- [ ] **Step 4: Check redirect after creation**

Legacy redirects to the new dataset page after creation. Verify the new page does the same.

- [ ] **Step 5: Fix gaps and commit**

```bash
git add ui/src/pages/new-dataset.vue ui/src/components/dataset/
git commit -m "fix: new-dataset page parity improvements from audit"
```

---

### Task 2: Audit new-application page

**Files:**
- Read (legacy): `ui-legacy/public/pages/new-application.vue`, `ui-legacy/public/components/application-base-apps.vue`, `ui-legacy/public/components/application-import.vue`
- Read (new): `ui/src/pages/new-application.vue`

- [ ] **Step 1: Compare creation flow**

Legacy: select base application from catalog, configure, create. Check the new page matches.

- [ ] **Step 2: Check for application import**

Legacy had `application-import.vue` for importing applications. Verify if this is present or intentionally omitted.

- [ ] **Step 3: Fix gaps and commit**

```bash
git add ui/src/pages/new-application.vue
git commit -m "fix: new-application page parity improvements from audit"
```

---

### Task 3: Audit share-dataset page

**Files:**
- Read (legacy): `ui-legacy/public/pages/share-dataset.vue`
- Read (new): `ui/src/pages/share-dataset.vue`

- [ ] **Step 1: Compare publication workflow steps**

Legacy: select portal, select dataset, set permissions, metadata review, confirm publication. Verify each step is present.

- [ ] **Step 2: Check API calls**

Verify the new page makes the same API calls for publication.

- [ ] **Step 3: Fix gaps and commit**

```bash
git add ui/src/pages/share-dataset.vue
git commit -m "fix: share-dataset page parity improvements from audit"
```

---

### Task 4: TypeScript and Vuetify check

- [ ] **Step 1: Check TypeScript in workflow pages**

Verify stepper state, form data, API responses are typed.

- [ ] **Step 2: Check Vuetify stepper usage**

Verify `v-stepper` is used properly with Vuetify 4 API (slots may have changed from v2).

- [ ] **Step 3: Fix and commit**

```bash
git add ui/src/pages/
git commit -m "fix: TypeScript and Vuetify improvements in workflow pages"
```

---

### Task 5: Add e2e tests

**Files:**
- Create: `tests/features/ui/workflow-pages.e2e.spec.ts`

- [ ] **Step 1: Add smoke test for new-dataset**

Navigate to page, verify stepper renders with type selection options.

- [ ] **Step 2: Add interaction test for new-dataset**

Select file type, verify upload UI appears. Or select REST type, verify REST config appears.

- [ ] **Step 3: Add smoke test for new-application**

Navigate to page, verify base app selection renders.

- [ ] **Step 4: Add smoke test for share-dataset**

Navigate to page, verify stepper renders.

- [ ] **Step 5: Run and commit**

```bash
npx playwright test tests/features/ui/workflow-pages.e2e.spec.ts
git add tests/features/ui/
git commit -m "test: add workflow pages e2e tests"
```
