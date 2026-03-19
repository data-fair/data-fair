# embed-ui Vuetify 3→4 Migration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the embed-ui workspace from Vuetify 3 to Vuetify 4.

**Architecture:** Focused dependency upgrade + mechanical breaking change fixes. No composition API migration or unrelated refactoring. Follows patterns established in the data-fair/metrics vuetify-v4 branch.

**Tech Stack:** Vue 3, Vuetify 4, Vite 6, Vue Router 5, @data-fair/lib-vuetify v2, @koumoul/vjsf (Vuetify 4-compatible)

**Spec:** `docs/superpowers/specs/2026-03-19-embed-ui-vuetify4-migration-design.md`

---

### Task 1: Bump dependencies

**Files:**
- Modify: `embed-ui/package.json`

- [ ] **Step 1: Update package.json versions**

In `embed-ui/package.json`, update:
```json
"vuetify": "^4.0.0",
"@data-fair/lib-vuetify": "^2.0.0",
"vite-plugin-vuetify": "^2.1.3"
```
Update `@koumoul/vjsf` to its Vuetify 4-compatible version.
Update `eslint-plugin-vuetify` if a Vuetify 4-compatible version exists.

- [ ] **Step 2: Install dependencies**

Run: `npm install`
Expected: clean install, no peer dependency errors related to vuetify version mismatch.

- [ ] **Step 3: Commit**

```bash
git add embed-ui/package.json package-lock.json
git commit -m "chore(embed-ui): bump vuetify to v4 and related dependencies"
```

---

### Task 2: Fix internal vuetify imports

Replace `vuetify/lib/composables/*` deep imports with public `vuetify` exports. These internal paths are not stable across major versions.

**Files:**
- Modify: `embed-ui/src/components/layout/layout-gradient-box.vue:11`
- Modify: `embed-ui/src/components/layout/layout-section-tabs.vue:74-75`
- Modify: `embed-ui/src/components/layout/layout-themed-svg.vue:10`
- Modify: `embed-ui/src/pages/settings/index.vue:347`

- [ ] **Step 1: Fix layout-gradient-box.vue**

Replace line 11:
```typescript
// before
import { useTheme } from 'vuetify/lib/composables/theme.mjs'
// after
import { useTheme } from 'vuetify'
```

- [ ] **Step 2: Fix layout-section-tabs.vue**

Replace lines 74-75:
```typescript
// before
import { useDisplay } from 'vuetify/lib/composables/display.js'
import { useTheme } from 'vuetify/lib/composables/theme.mjs'
// after
import { useDisplay, useTheme } from 'vuetify'
```

- [ ] **Step 3: Fix layout-themed-svg.vue**

Replace line 10:
```typescript
// before
import { useTheme } from 'vuetify/lib/composables/theme.js'
// after
import { useTheme } from 'vuetify'
```

- [ ] **Step 4: Fix settings/index.vue**

Replace line 347:
```typescript
// before
import { useDisplay } from 'vuetify/lib/composables/display.mjs'
// after
import { useDisplay } from 'vuetify'
```

- [ ] **Step 5: Verify build compiles**

Run: `npm -w embed-ui run check-types`
Expected: no errors related to vuetify imports.

- [ ] **Step 6: Commit**

```bash
git add embed-ui/src/components/layout/layout-gradient-box.vue embed-ui/src/components/layout/layout-section-tabs.vue embed-ui/src/components/layout/layout-themed-svg.vue embed-ui/src/pages/settings/index.vue
git commit -m "refactor(embed-ui): replace internal vuetify/lib imports with public exports"
```

---

### Task 3: Fix `tile` prop → `rounded="0"`

The `tile` prop is removed in Vuetify 4. Replace with `rounded="0"`.

Only change Vuetify component props — do not touch d3 `.tile()` calls, map `tileUrl` variables, or `:key` bindings that contain "tile".

**Files:**
- Modify: `embed-ui/src/components/dataset/table/dataset-table-cell.vue:14`
- Modify: `embed-ui/src/components/dataset/table/dataset-table-header-menu.vue:14,51`
- Modify: `embed-ui/src/components/dataset/dataset-download-results.vue:5,58`
- Modify: `embed-ui/src/components/remote-service/remote-service-card.vue:6`
- Modify: `embed-ui/src/components/dataset/dataset-publication-sites.vue:18`
- Modify: `embed-ui/src/components/dataset/dataset-item-card.vue:14`
- Modify: `embed-ui/src/components/settings/settings-api-keys.vue:102`
- Modify: `embed-ui/src/pages/admin/base-apps.vue:49`

- [ ] **Step 1: Replace `tile` with `rounded="0"` in each file**

In each file listed above, find the Vuetify component prop `tile` (standalone, not part of another word) and replace with `rounded="0"`.

Example:
```html
<!-- before -->
<v-card tile>
<!-- after -->
<v-card rounded="0">
```

For `base-apps.vue:49` it's `<v-avatar tile>` → `<v-avatar rounded="0">`.

- [ ] **Step 2: Verify no remaining Vuetify `tile` props**

Run: `grep -n 'tile' embed-ui/src/**/*.vue` and verify all remaining matches are d3/map/key-binding related, not Vuetify component props.

- [ ] **Step 3: Commit**

```bash
git add embed-ui/src/
git commit -m "fix(embed-ui): replace removed tile prop with rounded=0 for vuetify 4"
```

---

### Task 4: Fix v-autocomplete `#item` slot and `v-model:search-input` rename

In Vuetify 4, the `item` slot prop in v-select/v-autocomplete/v-combobox is renamed to `internalItem`. The `internalItem` is a Vuetify `ListItem` wrapper — use `.raw` to access the original item object.

**Important:** This does NOT apply to v-data-table `#item` slots. `storage.vue:16`, `remote-service-schema.vue:7`, `dataset-schema-view.vue:14`, and `dataset-file-formats.vue:10` all use v-data-table `#item` slots and should NOT be modified.

Also, `v-model:search-input` is renamed to `v-model:search` in Vuetify 4.

**Files:**
- Modify: `embed-ui/src/components/dataset/select/dataset-select.vue:3,20`

- [ ] **Step 1: Fix v-model:search-input rename**

In `dataset-select.vue` line 3, replace:
```html
<!-- before -->
v-model:search-input="search"
<!-- after -->
v-model:search="search"
```

- [ ] **Step 2: Fix #item slot**

This is a `v-autocomplete` with `#item="{item}"`. The `internalItem` is a Vuetify `ListItem` wrapper, so use `.raw` to get the original dataset object:
```html
<!-- before -->
<template #item="{item}">
  <dataset-list-item
    :dataset="item"
<!-- after -->
<template #item="{internalItem}">
  <dataset-list-item
    :dataset="internalItem.raw"
```

- [ ] **Step 3: Commit**

```bash
git add embed-ui/src/components/dataset/select/dataset-select.vue
git commit -m "fix(embed-ui): fix v-autocomplete slot and model renames for vuetify 4"
```

---

### Task 5: Remove `fluid` prop from v-container

The `fluid` prop is removed in Vuetify 4's grid overhaul. Remove all occurrences.

**Files (~30 occurrences across 18 files):**
- Modify: `embed-ui/src/components/dataset/dataset-status.vue`
- Modify: `embed-ui/src/components/dataset/dataset-publication-sites.vue`
- Modify: `embed-ui/src/components/application/application-config.vue`
- Modify: `embed-ui/src/components/remote-service/remote-service-config.vue`
- Modify: `embed-ui/src/pages/remote-services/[id]/index.vue`
- Modify: `embed-ui/src/pages/dataset/[id]/map-bounds.vue`
- Modify: `embed-ui/src/pages/dataset/[id]/table.vue`
- Modify: `embed-ui/src/pages/dataset/[id]/table-edit.vue`
- Modify: `embed-ui/src/pages/dataset/[id]/map.vue`
- Modify: `embed-ui/src/pages/dataset/[id]/search-files.vue`
- Modify: `embed-ui/src/pages/dataset/[id]/thumbnails.vue`
- Modify: `embed-ui/src/pages/dataset/[id]/related-datasets.vue`
- Modify: `embed-ui/src/pages/settings/index.vue`
- Modify: `embed-ui/src/pages/settings/[type]/[id]/datasets-metadata.vue`
- Modify: `embed-ui/src/pages/settings/[type]/[id]/licenses.vue`
- Modify: `embed-ui/src/pages/settings/[type]/[id]/webhooks.vue`
- Modify: `embed-ui/src/pages/settings/[type]/[id]/topics.vue`
- Modify: `embed-ui/src/pages/settings/[type]/[id]/api-keys.vue`

- [ ] **Step 1: Remove all `fluid` props**

Remove `fluid` (standalone prop) and `:fluid="..."` (bound prop) from every `v-container` in the files listed above.

For `application-config.vue` which has `:fluid="display.lgAndDown.value"` — simply remove the prop. If layout testing reveals a regression, a conditional max-width class can be added later.

- [ ] **Step 2: Verify no remaining fluid props**

Search for `fluid` in embed-ui src to confirm all are removed from v-container elements.

- [ ] **Step 3: Commit**

```bash
git add embed-ui/src/
git commit -m "fix(embed-ui): remove fluid prop from v-container for vuetify 4 grid overhaul"
```

---

### Task 6: Rename typography classes

Vuetify 4 uses MD3 typography scale. Rename all old Vuetify 3 typography utility classes.

**Files (~21 occurrences across 15 files):**
- All files found by grepping `text-h[1-6]|text-subtitle|text-caption|text-body-[12]` in `embed-ui/src/`

- [ ] **Step 1: Rename typography classes**

Apply these replacements across all files:

| Find | Replace |
|---|---|
| `text-h3` | `text-display-medium` |
| `text-h4` | `text-headline-small` |
| `text-h5` | `text-title-large` |
| `text-h6` | `text-title-large` |
| `text-subtitle-1` | `text-title-medium` |
| `text-caption` | `text-body-small` |
| `text-body-1` | `text-body-large` |
| `text-body-2` | `text-body-medium` |

Be careful with word boundaries — only replace exact class names, not substrings.

- [ ] **Step 2: Add typography classes to bare h-tags**

These h-tags have no typography class and will be affected by the reduced CSS reset:
- `embed-ui/src/pages/storage.vue:5` — `<h2 class="mb-2">` → `<h2 class="text-title-large mb-2">`
- `embed-ui/src/pages/storage.vue:42` — `<h2 class="my-3">` → `<h2 class="text-title-large my-3">`
- `embed-ui/src/pages/settings/index.vue:13` — `<h2 class="mb-4">` → `<h2 class="text-title-large mb-4">`

- [ ] **Step 3: Verify no remaining old typography classes**

Search for `text-h[1-6]`, `text-subtitle-[12]`, `text-caption`, `text-body-[12]`, `text-overline` in embed-ui src. Should return zero matches.

- [ ] **Step 4: Commit**

```bash
git add embed-ui/src/
git commit -m "fix(embed-ui): rename typography classes to MD3 scale for vuetify 4"
```

---

### Task 7: Fix `.theme--light`/`.theme--dark` CSS selectors

**Files:**
- Modify: `embed-ui/src/components/remote-service/remote-service-card.vue:59-62`

- [ ] **Step 1: Update CSS selectors**

Replace:
```css
/* before */
.theme--light .card-desc170:before {
  background:linear-gradient(transparent 0, transparent 70%, white);
}
.theme--dark .card-desc170:before {
  background:linear-gradient(transparent 0, transparent 70%, #1E1E1E);
}
```

With a single rule using CSS custom properties from Vuetify 4's theme system:
```css
/* after */
.card-desc170:before {
  background: linear-gradient(transparent 0, transparent 70%, rgb(var(--v-theme-surface)));
}
```

This preserves the 3-stop gradient (transparent top 70%, fade to surface color in bottom 30%) and works for both light and dark themes.

- [ ] **Step 2: Commit**

```bash
git add embed-ui/src/components/remote-service/remote-service-card.vue
git commit -m "fix(embed-ui): replace theme--light/dark selectors with CSS custom properties"
```

---

### Task 8: Audit and fix `!important` overrides under CSS layers

Vuetify 4 uses mandatory CSS layers which change specificity rules. `!important` declarations may no longer be needed or may need adjustment.

**Files:**
- Modify: `embed-ui/src/components/dataset/dataset-item-value-multiple.vue:54-55`
- Modify: `embed-ui/src/components/dataset/dataset-item-detail-dialog.vue:66-67`
- Modify: `embed-ui/src/components/dataset/map/dataset-map.vue:105`
- Modify: `embed-ui/src/components/dataset/form/dataset-edit-multiple-lines.vue:145-147`

- [ ] **Step 1: Try removing `!important` from each override**

For each file, remove `!important` and test if the style still applies correctly. With CSS layers, custom styles should have higher priority than Vuetify's layered styles without needing `!important`.

If removing `!important` causes a regression, keep it — it will still work, just may not be necessary.

- [ ] **Step 2: Commit**

```bash
git add embed-ui/src/
git commit -m "fix(embed-ui): audit !important overrides for CSS layers compatibility"
```

---

### Task 9: Build verification and lint

**Files:**
- Potentially modify: any file with lint/type errors

- [ ] **Step 1: Run type checking**

Run: `npm -w embed-ui run check-types`
Expected: no type errors. If there are vuetify-related type errors, fix them.

- [ ] **Step 2: Run linting**

Run: `npm -w embed-ui run lint`
Expected: no new errors. If `eslint-plugin-vuetify` reports new issues for Vuetify 4, fix them.

- [ ] **Step 3: Fix any issues found and commit**

```bash
git add embed-ui/src/
git commit -m "fix(embed-ui): resolve type and lint errors after vuetify 4 migration"
```

---

### Task 10: Visual testing

Run the dev server and manually verify each major view for regressions.

- [ ] **Step 1: Start dev server**

Run: `npm -w embed-ui run dev`

- [ ] **Step 2: Check key views for regressions**

Verify these areas:
- **Button text casing** — Vuetify 4 removes default uppercase. Check if buttons look correct.
- **Responsive layouts** — breakpoint sizes are reduced. Test at various viewport widths.
- **v-data-table** — check dataset tables render correctly (especially schema view, file formats).
- **v-date-picker** — check `dataset-table-header-menu.vue` date pickers work correctly.
- **vjsf forms** — check any JSON schema form renders correctly.
- **H-tags** — verify heading styles look correct, especially on storage, settings, and admin pages.
- **Theme switching** — verify lib-vuetify v2 handles the default theme correctly (not unexpected dark mode).
- **d-frame** — verify custom element still works with CSS layers.
- **Maps** — verify maplibre integration still renders correctly.

- [ ] **Step 3: Fix any visual regressions found**

Document and fix issues. Each distinct fix gets its own commit with a descriptive message.
