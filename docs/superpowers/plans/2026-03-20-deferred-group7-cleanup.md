# Group 7 — Phase 5 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove legacy workspaces (`ui-legacy/`, `nuxt-server/`), strip old dependencies, and audit d-frame wrapper pages for broken URLs.

**Architecture:** Sequential cleanup — remove directories, update references, verify build + tests still pass.

**Tech Stack:** git, npm, Docker, nginx

**Spec:** `docs/superpowers/specs/2026-03-20-deferred-features-design.md` — Group 7

**IMPORTANT:** Only execute this plan after all Groups 1-6 are confirmed working with passing e2e tests.

---

### Task 1: Inventory Legacy References

**Files:**
- Audit only (no changes yet)

- [ ] **Step 1: Find all references to ui-legacy and nuxt-server**

```bash
grep -r "ui-legacy\|nuxt-server\|nuxt-start" --include="*.json" --include="*.ts" --include="*.js" --include="*.yml" --include="*.yaml" --include="Dockerfile*" --include="*.conf" --include="*.kdl" -l . | grep -v node_modules | grep -v .git
```

- [ ] **Step 2: Document all files that need updating**

Create a checklist of files to modify. Expected locations:
- `package.json` (root) — workspace references, scripts
- `Dockerfile` — build/copy steps for nuxt-server
- `tsconfig.json` — references
- `.eslintrc.*` or `eslint.config.*` — ignore patterns
- `zellij/` layout files — panes for ui-legacy/nuxt-server
- `docker-compose*.yml` — service definitions
- `dev/nginx*.conf` — proxy locations
- CI/CD files (`.github/workflows/`, `.gitlab-ci.yml`, etc.)

---

### Task 2: Remove ui-legacy Directory

**Files:**
- Delete: `ui-legacy/` (entire directory)

- [ ] **Step 1: Remove ui-legacy**

```bash
rm -rf ui-legacy/
```

- [ ] **Step 2: Update root package.json**

Remove any workspace reference to `ui-legacy`, any scripts that reference it.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove ui-legacy workspace"
```

---

### Task 3: Remove nuxt-server Directory

**Files:**
- Delete: `nuxt-server/` (entire directory)

- [ ] **Step 1: Remove nuxt-server**

```bash
rm -rf nuxt-server/
```

- [ ] **Step 2: Update references**

Remove from:
- `package.json` — workspaces, scripts (`npm --prefix nuxt-server`)
- `Dockerfile` — any `COPY nuxt-server/` or build steps
- `docker-compose*.yml` — any service that runs nuxt-server
- nginx configs — any proxy_pass to nuxt-server port

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: remove nuxt-server workspace"
```

---

### Task 4: Clean Up Old Dependencies

**Files:**
- Modify: `package.json` (root)

- [ ] **Step 1: Identify Vue 2 / Nuxt dependencies**

Check root `package.json` for:
- `nuxt`, `nuxt-start`, `@nuxt/*`
- `vue` v2, `vue-template-compiler`, `vue-server-renderer`
- `vuex`
- Any other deps only used by ui-legacy or nuxt-server

- [ ] **Step 2: Remove identified dependencies**

```bash
npm uninstall <dep1> <dep2> ...
```

- [ ] **Step 3: Verify build**

```bash
npm install
npm --prefix ui run build
npm run lint
```

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: remove Vue 2 / Nuxt legacy dependencies"
```

---

### Task 5: Update Build Config Files

**Files:**
- Modify: `Dockerfile`
- Modify: `tsconfig.json`
- Modify: eslint config
- Modify: zellij layout (if exists)
- Modify: CI/CD config

- [ ] **Step 1: Update Dockerfile**

Remove any stages or COPY commands for ui-legacy, nuxt-server. The Dockerfile should only build `ui/` for the frontend.

- [ ] **Step 2: Update tsconfig.json**

Remove any `references` or `paths` pointing to ui-legacy or nuxt-server.

- [ ] **Step 3: Update eslint config**

Remove any ignore patterns for ui-legacy or nuxt-server directories.

- [ ] **Step 4: Update zellij layout**

If `zellij/` exists with layout files, remove panes for ui-legacy and nuxt-server dev servers.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile tsconfig.json .eslintrc* zellij/
git commit -m "chore: update build configs after legacy removal"
```

---

### Task 6: Audit D-Frame Wrapper Pages

**Files:**
- Audit: `ui/src/pages/` — all d-frame wrapper pages from Phase 2

Target pages to check:
- `catalogs.vue`, `processings.vue`, `portals.vue`, `events.vue`
- `reuses.vue`, `pages.vue`, `metrics.vue`, `admin-plugins.vue`
- `me.vue`, `organization.vue`, `department.vue`
- `subscription.vue`, `extra.vue`, `admin-extra.vue`

- [ ] **Step 1: List all d-frame pages**

```bash
grep -r "d-frame\|DFrame" ui/src/pages/ --include="*.vue" -l
```

- [ ] **Step 2: Check each page's iframe URL**

For each d-frame page, verify:
- Does the URL point to a still-valid endpoint?
- Was it pointing to a nuxt-server route that no longer exists?
- Does it need to be updated to point to an external service or new API endpoint?

- [ ] **Step 3: Fix broken URLs**

For any page with a broken URL:
- If the feature is handled by an external service (events, processings, etc.), update the URL
- If the feature was purely in ui-legacy, either build a native replacement or remove the page

- [ ] **Step 4: Verify with dev server**

```bash
npm --prefix ui run dev
```

Navigate to each d-frame page and verify it loads correctly.

- [ ] **Step 5: Commit fixes**

```bash
git add ui/src/pages/
git commit -m "fix: update d-frame wrapper URLs after legacy removal"
```

---

### Task 7: Run Full Test Suite

- [ ] **Step 1: Run all e2e tests**

```bash
npx playwright test
```

- [ ] **Step 2: Fix any failures**

Address any test failures caused by the cleanup.

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "test: verify all tests pass after Phase 5 cleanup"
```
