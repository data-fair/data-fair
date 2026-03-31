# Group 6 — Dashboard + Navigation Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify home dashboard and navigation drawer match legacy functionality, with proper permissions, responsive behavior, and sufficient test coverage.

**Architecture:** Side-by-side comparison with legacy home and layout components.

**Tech Stack:** Vue 3, Vuetify 4, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Group 6

---

### Task 1: Audit home dashboard

**Files:**
- Read (legacy): `ui-legacy/public/pages/index.vue`
- Read (new): `ui/src/pages/index.vue`, dashboard components in `ui/src/components/dashboard/`

- [ ] **Step 1: Compare sections**

Legacy sections: contribute cards (SVG links), manage datasets (error/draft/requested), manage applications (requested), activity/recent. Verify each is present.

- [ ] **Step 2: Compare permission logic**

Legacy: different views for contributor, admin, unauthenticated. Verify `usePermissions` composable gates match.

- [ ] **Step 3: Compare subscription alert**

Legacy shows subscription warning from limits API. Verify present.

- [ ] **Step 4: Compare unauthenticated view**

Legacy: description SVG + login button. Verify.

- [ ] **Step 5: Fix gaps and commit**

```bash
git add ui/src/pages/index.vue ui/src/components/dashboard/
git commit -m "fix: home dashboard parity improvements from audit"
```

---

### Task 2: Audit navigation drawer

**Files:**
- Read (legacy): `ui-legacy/public/components/layout/layout-navigation-left.vue`
- Read (new): `ui/src/components/layout/layout-navigation-left.vue`

- [ ] **Step 1: Compare navigation sections**

Legacy groups: content (datasets, applications), management (org/settings/portals), connectors (catalogs, processings, remote-services), monitoring (subscription/storage/metrics/events), help (API doc, extra doc links), admin.

Verify each group and its items are present with correct routes and permission checks.

- [ ] **Step 2: Compare extra navigation items**

Legacy: `$uiConfig.extraNavigationItems` injected into groups, `$uiConfig.extraAdminNavigationItems`. Verify.

- [ ] **Step 3: Compare portal home link**

Legacy: shows portal home when `site.main === false`. Verify.

- [ ] **Step 4: Compare collapsible behavior**

Legacy: `open-strategy="multiple"`, auto-expand active route's group. Verify.

- [ ] **Step 5: Fix gaps and commit**

```bash
git add ui/src/components/layout/layout-navigation-left.vue
git commit -m "fix: navigation drawer parity improvements from audit"
```

---

### Task 3: TypeScript and responsive check

- [ ] **Step 1: Check usePermissions composable types**

- [ ] **Step 2: Check responsive behavior**

Verify drawer hides on mobile, dashboard layout adapts, cards stack properly.

- [ ] **Step 3: Fix and commit**

```bash
git add ui/src/composables/ ui/src/components/layout/ ui/src/pages/index.vue
git commit -m "fix: TypeScript and responsive improvements in dashboard and nav"
```

---

### Task 4: Verify test coverage

**Files:**
- `tests/features/ui/home-nav.e2e.spec.ts` (16 tests)

- [ ] **Step 1: Review existing tests**

Check coverage of: dashboard sections, permission-gated views, nav drawer groups, navigation links.

- [ ] **Step 2: Add any missing tests**

Priority: unauthenticated view, admin navigation items.

- [ ] **Step 3: Run and commit**

```bash
npx playwright test tests/features/ui/home-nav.e2e.spec.ts
git add tests/features/ui/
git commit -m "test: improve dashboard and navigation e2e coverage"
```
