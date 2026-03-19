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

No routing changes needed — Vue Router 5 migration is already done and `unplugin-vue-router` is already removed.

## 2. Template Breaking Changes

### v-select/v-autocomplete `#item` slot rename (6 files, ~8 occurrences)

`#item="{item}"` → `#item="{internalItem}"` and update references inside the slot.

Affected files:
- `src/components/dataset/select/dataset-select.vue`
- `src/components/remote-service/remote-service-schema.vue`
- `src/components/dataset/dataset-schema-view.vue` (4 slots)
- `src/components/dataset/dataset-file-formats.vue`
- `src/pages/storage.vue`

### v-container `fluid` prop removal (~30 occurrences)

Remove `fluid` and `:fluid` props from all `v-container` elements. The Vuetify 4 grid overhaul changes how this works.

Affected files: `dataset-status.vue`, `dataset-publication-sites.vue`, `application-config.vue`, `remote-service-config.vue`, `remote-services/[id]/index.vue`, `dataset/[id]/map-bounds.vue`, `dataset/[id]/table.vue`, `dataset/[id]/table-edit.vue`, `dataset/[id]/map.vue`, `dataset/[id]/search-files.vue`, `dataset/[id]/thumbnails.vue`, `dataset/[id]/related-datasets.vue`, `settings/index.vue` (9 occurrences), `settings/[type]/[id]/datasets-metadata.vue`, `settings/[type]/[id]/licenses.vue`, `settings/[type]/[id]/webhooks.vue`, `settings/[type]/[id]/topics.vue`, `settings/[type]/[id]/api-keys.vue`.

### v-btn icon pattern (1 occurrence)

`tutorial-alert.vue` — audit and update to the new `:icon` prop pattern if using old `icon` boolean + nested `v-icon`.

## 3. Typography and CSS Changes

### Typography class renames (~15 occurrences across 12 files)

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

### H-tag CSS reset (known pain point, ~14 bare h-tags)

Vuetify 4 reduces its CSS reset — bare `<h2>`, `<h3>`, `<h4>` tags get browser default styles instead of Vuetify's reset.

Affected files: `storage.vue` (2), `dataset/[id]/download.vue`, `settings-api-keys.vue`, `dev.vue`, `settings/index.vue`, `admin/errors.vue` (4), `admin/owners.vue`, `admin/info.vue`, `admin/base-apps.vue` (2).

Fix: add explicit typography classes to all bare h-tags.

### `!important` overrides (7 occurrences in 3 files)

CSS layers change specificity. These need auditing after the upgrade:
- `dataset-item-value-multiple.vue` (2 padding overrides)
- `dataset-item-detail-dialog.vue` (2 padding overrides)
- `dataset-map.vue` (1 color override)
- `dataset-edit-multiple-lines.vue` (3 padding/margin overrides)

## 4. Migration Strategy

### Order of operations

1. Bump all dependencies in `package.json`
2. Fix build errors (import paths, plugin config changes if any)
3. Mechanical find-and-replace fixes: typography classes, `#item` → `#internalItem`, remove `fluid` props, v-btn icon pattern
4. Add explicit typography classes to bare h-tags
5. Audit `!important` overrides with CSS layers
6. Visual testing — run the dev server and check each major view for layout/style regressions

### Not in scope

- Vue Router migration (already on v5)
- `unplugin-vue-router` removal (already done)
- Options API → Composition API conversion
- `v-row dense` (not used in embed-ui)

### Risk areas

- **`@koumoul/vjsf` integration** — JSON schema forms are complex, need visual verification after upgrade
- **CSS layer specificity** — any third-party CSS or custom overrides may behave differently under mandatory CSS layers
- **`d-frame` custom element** — verify it still works with Vuetify 4's CSS layers
- **H-tag styling** — known pain point from previous migrations, reduced CSS reset affects bare h-tags
