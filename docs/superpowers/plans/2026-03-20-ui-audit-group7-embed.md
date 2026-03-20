# Group 7 — Embed Pages Audit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Light check of embed pages — verify imports are correct after workspace rename and that embed pages share components with main pages where appropriate.

**Architecture:** File-level review, no deep functionality audit (these pages were already Vue 3 before the migration).

**Tech Stack:** Vue 3, Vuetify 4

**Spec:** `docs/superpowers/specs/2026-03-20-ui-audit-design.md` — Group 7

---

### Task 1: Verify imports and component sharing

**Files:**
- Read: all files under `ui/src/pages/embed/`
- Cross-reference with: main page components in `ui/src/components/`

- [ ] **Step 1: List all embed pages and their component imports**

```bash
grep -r "import\|from" ui/src/pages/embed/ --include="*.vue" --include="*.ts"
```

- [ ] **Step 2: Check for broken imports**

After the workspace rename (`embed-ui/` → `ui/`), some import paths may be stale. Verify all resolve correctly.

- [ ] **Step 3: Check component sharing**

Verify these components are shared (not duplicated) between embed and main pages:
- `dataset-table` — used in `embed/dataset/[id]/table.vue` and `dataset/[id]/data.vue`
- `dataset-map` — used in `embed/dataset/[id]/map.vue` and `dataset/[id]/data.vue`
- `dataset-search-files` — used in embed and main data page
- `dataset-thumbnails` — used in embed and main data page
- `journal-view` — used in `embed/dataset/[id]/journal.vue` and dataset home page
- `dataset-publication-sites` — used in embed and dataset home page
- `application-config` — used in `embed/application/[id]/config.vue` and application config page

- [ ] **Step 4: Fix any broken imports or unnecessary duplication**

- [ ] **Step 5: Verify build**

Run: `npm --prefix ui run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add ui/src/pages/embed/ ui/src/components/
git commit -m "fix: verify embed page imports and component sharing"
```

---

### Task 2: Quick TypeScript check

- [ ] **Step 1: Run vue-tsc on embed pages**

Check for type errors specific to embed pages.

- [ ] **Step 2: Fix any errors and commit**

```bash
git add ui/src/pages/embed/
git commit -m "fix: TypeScript errors in embed pages"
```
