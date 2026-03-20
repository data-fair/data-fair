# Group 4 — Application Detail Pages Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify application detail pages (index, config, api-doc) have full feature parity with legacy, proper TypeScript, and sufficient test coverage.

**Architecture:** Side-by-side comparison with legacy application pages.

**Tech Stack:** Vue 3, Vuetify 4, TypeScript, `api/types/application`

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Group 4

---

### Task 1: Inventory and compare legacy application page

**Files:**
- Read (legacy): `ui-legacy/public/pages/application/_id/index.vue`, `description.vue`, `config.vue`, `api-doc.vue`
- Read (legacy): `ui-legacy/public/store/application.js`
- Read (legacy): `ui-legacy/public/components/application-actions.vue`, `application-info.vue`, `application-integration-dialog.vue`, `application-capture-dialog.vue`, `application-attachments.vue`, `application-publication-sites.vue`, `application-protected-links.vue`
- Read (new): `ui/src/pages/application/[id]/index.vue`, `config.vue`, `api-doc.vue`
- Read (new): `ui/src/composables/application-store.ts`
- Read (new): Application components in `ui/src/components/application/`

- [ ] **Step 1: List legacy tabs/sections**

Expected: Metadata/info, Datasets used, Render preview, Share/permissions/publication-sites, Activity/journal. Plus config page and API doc page.

- [ ] **Step 2: List legacy actions**

Expected: Open full page, Edit config, API doc, Delete, Change owner, Capture/screenshot, Attachments, Integration/embed, Slug editing, Version upgrades.

- [ ] **Step 3: Map each to new pages and identify gaps**

- [ ] **Step 4: Fix gaps and commit**

```bash
git add ui/src/pages/application/ ui/src/components/application/
git commit -m "fix: application detail pages parity gaps from audit"
```

---

### Task 2: TypeScript audit

**Files:**
- `ui/src/composables/application-store.ts`
- `ui/src/composables/application-watch.ts`
- `ui/src/composables/application-versions.ts`
- Application components in `ui/src/components/application/`
- `api/types/application/index.d.ts`

- [ ] **Step 1: Check application-store.ts types**

Verify: application ref uses `Application` type, `can()` method typed, journal entries typed, datasets fetch typed.

- [ ] **Step 2: Check component props**

Verify application components use proper types.

- [ ] **Step 3: Fix and commit**

```bash
git add ui/src/composables/ ui/src/components/application/
git commit -m "fix: improve TypeScript types in application detail pages"
```

---

### Task 3: Verify and improve test coverage

**Files:**
- `tests/features/ui/application-pages.e2e.spec.ts` (3 tests)

- [ ] **Step 1: Review existing tests**

Current: index loads, config loads, api-doc loads. Missing: interaction tests.

- [ ] **Step 2: Add interaction tests**

Priority: navigate between index/config/api-doc, verify sections render on index page, verify action links work.

- [ ] **Step 3: Run and commit**

```bash
npx playwright test tests/features/ui/application-pages.e2e.spec.ts
git add tests/features/ui/
git commit -m "test: improve application detail page e2e coverage"
```
