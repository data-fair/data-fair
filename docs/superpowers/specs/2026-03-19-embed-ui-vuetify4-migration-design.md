# embed-ui: Vuetify 3 to 4 Migration Design

## Context

The `embed-ui` workspace is a Vue 3 + Vite 6 + Vue Router 5 application using Vuetify 3.11.8. It provides the embed interface for Data-Fair with ~50 components organized by feature domain (dataset, layout, settings, storage, workflow, etc.).

Key dependencies that also need upgrading:
- `@data-fair/lib-vuetify` (v1 → v2) — centralized theme, SCSS settings, and 13 shared components. Maintained in-house, v2 already available.
- `@koumoul/vjsf` (v3 → compatible version) — Vue JSON Schema Forms. Maintained in-house, compatible version available.

Reference migration: `data-fair/metrics` repo, `vuetify-v4` branch.

## Approach

Focused Vuetify 4 upgrade only. No Options API → Composition API migration. No unrelated refactoring.

## 1. Dependency Upgrades

| Package | Current | Target |
|---|---|---|
| `vuetify` | `^3.11.8` | `^4.0.0` |
| `@data-fair/lib-vuetify` | `^1.13.1` | `^2.0.0` |
| `@koumoul/vjsf` | `^3.17.1` | Vuetify 4-compatible version |
| `vite-plugin-vuetify` | `^2.1.1` | `^2.1.3` |
| `eslint-plugin-vuetify` | `^2.5.1` | Vuetify 4-compatible version |

No routing changes needed — Vue Router 5 migration is already done and `unplugin-vue-router` is already removed.

## 2. Template Breaking Changes

### v-select/v-autocomplete `#item` slot rename

`#item="{item}"` → `#item="{internalItem}"` and update references inside the slot. This only applies to v-select, v-autocomplete, and v-combobox — **not** to v-data-table `#item.*` slots.

Affected files (need per-file verification of which component the slot belongs to):
- `src/components/dataset/select/dataset-select.vue`
- `src/pages/storage.vue`

Not affected (v-data-table slots, unchanged in Vuetify 4):
- `src/components/remote-service/remote-service-schema.vue` (v-data-table)
- `src/components/dataset/dataset-schema-view.vue` (v-data-table-virtual)
- `src/components/dataset/dataset-file-formats.vue` (v-data-table)

### v-container `fluid` prop removal (~30 occurrences)

Remove `fluid` and `:fluid` props from all `v-container` elements. The Vuetify 4 grid overhaul changes how this works.

Note: `application-config.vue` uses conditional `:fluid="display.lgAndDown.value"` — may need a replacement strategy (e.g., conditional max-width class).

Affected files: `dataset-status.vue`, `dataset-publication-sites.vue`, `application-config.vue`, `remote-service-config.vue`, `remote-services/[id]/index.vue`, `dataset/[id]/map-bounds.vue`, `dataset/[id]/table.vue`, `dataset/[id]/table-edit.vue`, `dataset/[id]/map.vue`, `dataset/[id]/search-files.vue`, `dataset/[id]/thumbnails.vue`, `dataset/[id]/related-datasets.vue`, `settings/index.vue` (9 occurrences), `settings/[type]/[id]/datasets-metadata.vue`, `settings/[type]/[id]/licenses.vue`, `settings/[type]/[id]/webhooks.vue`, `settings/[type]/[id]/topics.vue`, `settings/[type]/[id]/api-keys.vue`.

### `tile` prop replacement (~10 occurrences)

`tile` prop replaced by `rounded="0"` on v-card, v-btn, v-avatar, etc.

Affected files: `remote-service-card.vue`, `dataset-table-cell.vue`, `dataset-table-header-menu.vue` (2), `dataset-download-results.vue` (2), `dataset-publication-sites.vue`, `settings-api-keys.vue`, `dataset-item-card.vue`, `admin/base-apps.vue`.

### Internal `vuetify/lib/...` import paths

Deep imports from `vuetify/lib/composables/` are not part of the public API and may break. Replace with public exports.

Affected files:
- `layout-gradient-box.vue`: `vuetify/lib/composables/theme.mjs` → `import { useTheme } from 'vuetify'`
- `layout-section-tabs.vue`: `vuetify/lib/composables/display.js` and `theme.mjs` → public imports
- `layout-themed-svg.vue`: `vuetify/lib/composables/theme.js` → `import { useTheme } from 'vuetify'`
- `settings/index.vue`: `vuetify/lib/composables/display.mjs` → `import { useDisplay } from 'vuetify'`

### v-btn text-transform removal

Vuetify 4 removes the default `text-transform: uppercase` on buttons. If the current design relies on uppercase button text, this will be a visual change across the application. Audit during visual testing.

### v-date-picker range behavior

`dataset-table-header-menu.vue` uses `v-date-picker` in 2 places. Vuetify 4 range picker only emits start/end values. Audit whether range mode is used.

### v-form slot props unreffed

Vuetify 4 unrefs v-form slot props (raw values instead of refs). Audited: no v-form slot prop destructuring found in the codebase. Not applicable.

## 3. Typography and CSS Changes

### Typography class renames (~21 occurrences across 15 files)

| Old (Vuetify 3) | New (Vuetify 4) |
|---|---|
| `text-h3` | `text-display-medium` |
| `text-h4` | `text-headline-small` |
| `text-h5` | `text-title-large` |
| `text-h6` | `text-title-large` |
| `text-subtitle-1` | `text-title-medium` |
| `text-caption` | `text-body-small` |
| `text-body-1` | `text-body-large` |
| `text-body-2` | `text-body-medium` |

### H-tag CSS reset (known pain point)

Vuetify 4 reduces its CSS reset — bare `<h2>`, `<h3>`, `<h4>` tags get browser default styles instead of Vuetify's reset.

Truly bare h-tags (no typography class): `storage.vue` (2), `settings/index.vue` (1).

H-tags with old typography classes (will be fixed by the class rename above): `dataset/[id]/download.vue`, `settings-api-keys.vue`, `dev.vue`, `admin/errors.vue` (4), `admin/owners.vue`, `admin/info.vue`, `admin/base-apps.vue` (2).

Fix for bare h-tags: add explicit typography classes.

### `.theme--light` / `.theme--dark` CSS selectors

`remote-service-card.vue` uses `.theme--light` and `.theme--dark` CSS selectors. These Vuetify 2-era class names are removed in Vuetify 4. Migrate to `v-theme--light` / `v-theme--dark` or use CSS custom properties from the theme system.

### `!important` overrides (8 occurrences in 4 files)

CSS layers change specificity. These need auditing after the upgrade:
- `dataset-item-value-multiple.vue` (2 padding overrides)
- `dataset-item-detail-dialog.vue` (2 padding overrides)
- `dataset-map.vue` (1 color override)
- `dataset-edit-multiple-lines.vue` (3 padding/margin overrides)

## 4. Migration Strategy

### Order of operations

1. Bump all dependencies in `package.json`
2. Replace `vuetify/lib/composables/*` deep imports with public `vuetify` imports
3. Fix remaining build errors (import paths, plugin config changes if any)
4. Mechanical find-and-replace fixes: typography classes, `#item` → `#internalItem` (v-select only), remove `fluid` props, `tile` → `rounded="0"`, `.theme--light`/`.theme--dark` selectors
5. Add explicit typography classes to bare h-tags
6. Audit `!important` overrides with CSS layers
7. Visual testing — run the dev server and check each major view for layout/style regressions, paying attention to:
   - Button text casing (no more default uppercase)
   - Responsive layouts at breakpoint boundaries (reduced default breakpoint sizes)
   - v-date-picker range behavior
   - vjsf form rendering
   - d-frame custom element

### Not in scope

- Vue Router migration (already on v5)
- `unplugin-vue-router` removal (already done)
- Options API → Composition API conversion
- `v-row dense` (not used in embed-ui)

### Risk areas

- **Default theme changed to "system"** — lib-vuetify v2 must explicitly set `defaultTheme` or the app may unexpectedly render in dark mode. Verify against lib-vuetify v2's implementation.
- **Reduced breakpoint sizes** — `useDisplay()` checks (`mdAndUp`, `lgAndDown`, etc.) will trigger at different viewport widths. Files using these: `dataset-lines.ts`, `layout-section-tabs.vue`, `settings/index.vue`, `application-config.vue`, `dataset-table-select-display.vue`, `dataset-table.vue`.
- **`@koumoul/vjsf` integration** — JSON schema forms are complex, need visual verification after upgrade
- **CSS layer specificity** — any third-party CSS or custom overrides may behave differently under mandatory CSS layers
- **`d-frame` custom element** — verify it still works with Vuetify 4's CSS layers
- **H-tag styling** — known pain point from previous migrations, reduced CSS reset affects bare h-tags
