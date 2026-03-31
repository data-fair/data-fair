# Group 1 — D-Frame Wrapper Pages Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify all d-frame and plain iframe wrapper pages work correctly after the infrastructure fix, with proper URLs, attributes, and type safety.

**Architecture:** Systematic page-by-page verification against legacy equivalents, fixing any gaps found.

**Tech Stack:** Vue 3, Vuetify 4, `@data-fair/frame`, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Group 1

**Prerequisite:** Plan `2026-03-20-ui-audit-infra.md` must be completed first.

---

### Task 1: Audit d-frame pages

**Files:**
- Read (legacy): `ui-legacy/public/pages/catalogs.vue`, `processings.vue`, `portals.vue`, `events.vue`, `reuses.vue`, `pages.vue`, `metrics.vue`, `api-doc.vue`, `notifications.vue`, `admin/processings-plugins.vue`, `admin/catalogs-plugins.vue`
- Read (new): corresponding files in `ui/src/pages/`

For each d-frame page, verify:

- [ ] **Step 1: Compare each page's attributes with legacy**

Check table:

| Page | Attr to verify | Legacy value |
|------|---------------|--------------|
| catalogs | src, sync-path, id | `/catalogs/catalogs/`, `/data-fair/catalogs/`, `catalogs` |
| processings | src, sync-path, id | `/processings/processings/`, `/data-fair/processings/`, `processings` |
| portals | src, sync-path, id | `/portals-manager/portals/`, `/data-fair/portals/`, `portals-manager` |
| events | src, sync-path, id | `/events/embed/events/`, `/data-fair/events/`, `events` |
| reuses | src, sync-path, id | `/portals-manager/reuses/`, `/data-fair/reuses/`, `portals-manager` |
| pages | src, sync-path, id | `/portals-manager/pages/`, `/data-fair/pages/`, `portals-manager` |
| metrics | src, id | `/metrics/embed/home`, `metrics` |
| api-doc | src, id | openapi-viewer URL, `api-doc` |
| notifications | multiple d-frames | Check all subscribe URLs |
| admin/processings-plugins | src, id | `/processings/admin/plugins/`, `processings` |
| admin/catalogs-plugins | src, id | `/catalogs/admin/plugins/`, `catalogs` |

- [ ] **Step 2: Verify each page has `:adapter.prop`, `@message`, `@iframe-message`, `:height`**

After the infra fix, all d-frame pages using `sync-path` should have these. Pages without `sync-path` should still have `:adapter.prop` and `:height`.

- [ ] **Step 3: Fix any discrepancies found**

- [ ] **Step 4: Commit fixes**

```bash
git add ui/src/pages/
git commit -m "fix: correct d-frame page attributes after audit"
```

---

### Task 2: Audit plain iframe pages

**Files:**
- Read (legacy): `ui-legacy/public/pages/me.vue`, `organization.vue`, `department.vue`, `subscription.vue`, `extra/_id.vue`, `admin-extra/_id.vue`
- Read (new): corresponding files in `ui/src/pages/`

- [ ] **Step 1: Verify src URLs match legacy**

| Page | Expected src pattern |
|------|---------------------|
| me | `{sdUrl}/me?embed=true` |
| organization | `{sdUrl}/organization/{orgId}?embed=true` |
| department | `{sdUrl}/organization/{orgId}/department/{dept}?embed=true` |
| subscription | `$uiConfig.subscriptionUrl` |
| extra/[id] | `$uiConfig.extraNavigationItems[id].iframe` |
| admin-extra/[id] | `$uiConfig.extraAdminNavigationItems[id].iframe` |

- [ ] **Step 2: Verify authorization guards**

Organization/department pages should check that the user has appropriate access.

- [ ] **Step 3: Verify height handling**

All plain iframe pages should handle height (either auto-resize or viewport calculation).

- [ ] **Step 4: Check for missing breadcrumb support in extra pages**

The legacy `extra/_id.vue` used the `extraPageMixin` which handled breadcrumbs from v-iframe messages. Check if the new `extra/[id].vue` supports this. If using plain `<iframe>`, breadcrumb support from the iframe is lost — document this gap or add `postMessage` listening.

- [ ] **Step 5: Fix any issues and commit**

```bash
git add ui/src/pages/
git commit -m "fix: correct plain iframe pages after audit"
```

---

### Task 3: TypeScript and Vuetify check

- [ ] **Step 1: Check TypeScript in all wrapper pages**

Verify no `any` types on props, computed values, or event handlers (except the d-frame `@notif` handler which receives an untyped custom element event — `any` is acceptable there).

- [ ] **Step 2: Check Vuetify usage**

These pages are thin wrappers, but verify:
- No custom CSS overrides where Vuetify props would suffice
- Proper use of `v-container` or layout components if present

- [ ] **Step 3: Fix and commit**

```bash
git add ui/src/pages/
git commit -m "fix: TypeScript and Vuetify improvements in wrapper pages"
```

---

### Task 4: Add smoke tests

**Files:**
- Modify or create: `tests/features/ui/dframe-pages.e2e.spec.ts`

- [ ] **Step 1: Write smoke tests for 2-3 d-frame pages**

Test that the page loads and the d-frame element is present with correct src.

- [ ] **Step 2: Write smoke test for one plain iframe page**

Test that the page loads and the iframe is present.

- [ ] **Step 3: Run tests and commit**

```bash
npx playwright test tests/features/ui/dframe-pages.e2e.spec.ts
git add tests/features/ui/
git commit -m "test: add d-frame and iframe page smoke tests"
```
