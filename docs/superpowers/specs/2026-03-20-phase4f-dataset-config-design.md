# Phase 4f — Dataset Configuration Components Design

Migrates three legacy Vue 2 dataset configuration components to Vue 3/Vuetify 4 v-model components integrated into the existing `edit-metadata.vue` page.

## Scope

- `dataset-master-data.vue` — master data source configuration (VJSF v4)
- `dataset-extensions.vue` — remote service enrichments + calculated columns
- `dataset-virtual.vue` — virtual dataset config (children, columns, filters)
- `dataset-virtual-child-compat.vue` — schema compatibility checker
- `confirm-menu.vue` — small shared utility
- `useRemoteServices` composable
- Integration into `edit-metadata.vue`

### Deferred

- Extension details dialog (paginated enrichment results table)
- Expression evaluation preview dialog
- These are view-only dialogs, not configuration — can be added later without changing the v-model pattern.

## Architecture

All three components follow the same v-model pattern established in Phases 4b–4e:

```
edit-metadata.vue
  └─ useEditFetch (PATCH mode, draft: true)
       ├─ datasetEditFetch.data.value  →  v-model to child components
       ├─ datasetEditFetch.serverData  →  diff detection (fast-deep-equal)
       └─ datasetEditFetch.save        →  single save button in df-navigation-right
```

Each component receives the full dataset via `defineModel<any>()` and mutates sub-properties directly. No component makes its own API PATCH calls.

## Component Designs

### 1. `dataset-master-data.vue`

**Location:** `ui/src/components/dataset/dataset-master-data.vue`

**v-model:** `dataset.masterData` (object)

**Template:**
- Descriptive text explaining master data capabilities
- `<vjsf>` component bound to `dataset.masterData`
- Schema sourced from `datasetSchema.properties.masterData` (API types import)
- VJSF options: locale, readOnly based on `can('writeDescription')`

**VJSF context object:**
- `dataset` — current dataset object
- `directoryUrl` — from app info / env
- `ownerOrg` — boolean (is owner an organization?)
- `stringProperties` — string-type properties from schema
- `filterProperties` — filterable properties
- `searchProperties` — searchable properties
- `propertiesWithConcepts` — properties with x-refersTo

All property lists derived from `dataset.schema`.

**Visibility:** `!dataset.draftReason && !dataset.isMetaOnly && userOwnerRole === 'admin'`

### 2. `dataset-extensions.vue`

**Location:** `ui/src/components/dataset/dataset-extensions.vue`

**v-model:** `dataset.extensions` (array)

**Template:**
1. **Add extension menu** — `v-menu` dropdown listing available remote service actions (filtered to exclude already-added ones), plus "Add calculated column" button
2. **Extension cards** — responsive grid of `v-card`, two variants:
   - **Remote service extension:** service/action summary, autocomplete for additional output columns, overwrite key fields, auto-update checkbox (REST only), refresh/delete via `confirm-menu`
   - **Expression eval extension:** expression text field, property type selector, delete button

**Sub-components:**
- `dataset-add-property-dialog` (existing from Phase 4c) — for adding calculated columns
- `confirm-menu` (new) — for refresh/delete confirmation

**New composable — `useRemoteServices`:**

**Location:** `ui/src/composables/use-remote-services.ts`

Simple `useFetch` wrapper:
- Fetches `GET /api/v1/remote-services` with owner/access params
- Returns `remoteServices` (ref to results array) and `remoteServicesMap` (computed, keyed by id)
- Used only by `dataset-extensions.vue`

**Key logic:**
- `availableExtensions` — computed from remote services, filtering out already-added extensions
- Field selection uses vocabulary/concept matching from dataset schema
- `escapeKey` (existing utility) for safe property key generation
- Add pushes to `dataset.extensions`, remove splices from it

**Visibility:** `!dataset.isVirtual && !dataset.isMetaOnly`

### 3. `dataset-virtual.vue`

**Location:** `ui/src/components/dataset/dataset-virtual.vue`

**v-model:** `dataset.virtual` (object with `children`, `filters`) and `dataset.schema` (array — column list)

**Template — three sections:**

1. **Children management**
   - `v-autocomplete` with custom async search (fetches `/api/v1/datasets` + `/api/v1/remote-services` for master-data parents)
   - Results grouped: "master data" header + "your datasets" header
   - Draggable `v-list` of selected children (vuedraggable v4)
   - Per child: expandable field selector (autocomplete for picking inherited fields), delete action
   - `dataset-virtual-child-compat` inline per child for schema compatibility

2. **Column selection**
   - Draggable `v-list` of inherited columns (non-calculated fields only)
   - Reorder via drag handles, delete action per column

3. **Filter configuration**
   - Autocomplete to add column-based filters
   - Per filter: operator selector (`in`/`nin`), value combobox populated from child data
   - Active account filter checkbox (when applicable)
   - Delete action per filter

**Internal async logic:**
- `searchDatasets` — debounced search via `useAsyncAction`, fetches datasets + remote services grouped by master-data / owner
- `fetchChildSchemas` — fetches each child's schema when children change, for compatibility checking and column enumeration
- `valuesByKey` — computed from child schemas to populate filter value comboboxes

**Visibility:** `dataset.isVirtual`

### 4. `dataset-virtual-child-compat.vue`

**Location:** `ui/src/components/dataset/dataset-virtual-child-compat.vue`

**Props:** `child` (object, required), `parentSchema` (array, required)

**Pure computed validation** — no API calls, no store deps. Compares child schema against parent schema and reports categorized messages:
- **Info:** additional fields in child not in parent
- **Warning:** missing fields, disabled/active capability mismatches
- **Error:** dataset in error status, type mismatches, concept mismatches

Uses `propertyTypes` from API schema import and `capabilitiesSchema` for capability defaults.

### 5. `confirm-menu.vue`

**Location:** `ui/src/components/common/confirm-menu.vue`

Small utility (~30 lines). A `v-menu` wrapping a confirmation prompt with cancel/confirm buttons. Props: `label` (string), `color` (string, default 'warning'). Emits: `confirm`. Activator via default slot.

## Integration into `edit-metadata.vue`

### New diff computations

```ts
const extensionsHasDiff = computed(() => {
  if (!d || !s) return false
  return !equal(d.extensions, s.extensions)
})

const masterDataHasDiff = computed(() => {
  if (!d || !s) return false
  return !equal(d.masterData, s.masterData)
})

const virtualHasDiff = computed(() => {
  if (!d || !s) return false
  return !equal(d.virtual, s.virtual) || !equal(d.schema, s.schema)
})
```

Note: `virtualHasDiff` includes schema changes because virtual dataset column management modifies the schema array. The existing `schemaHasDiff` will also trigger — both sections highlighting is correct since save applies all changes together.

### New conditional sections

Added to the `computedDeepDiff` sections array:

- **Extensions** — after schema section. Condition: `!d.isVirtual && !d.isMetaOnly`. Icon: `mdiPuzzle`.
- **Master data** — after extensions. Condition: `!d.draftReason && !d.isMetaOnly && userOwnerRole === 'admin'`. Icon: `mdiDatabase`.
- **Virtual** — after schema section (replaces extensions/master-data position for virtual datasets). Condition: `d.isVirtual`. Icon: `mdiSetAll`.

Each uses `layout-section-tabs` with accent coloring when its diff computed is true.

## Dependencies

- `@koumoul/vjsf` — already in ui workspace (for master-data)
- `vuedraggable` — already added in Phase 4c (for virtual)
- `fast-deep-equal` — already used in edit-metadata
- `escapeKey` — existing utility from Phase 4c
- `dataset-add-property-dialog` — existing from Phase 4c
- No new npm dependencies required

## Files Created/Modified

**New files:**
- `ui/src/components/dataset/dataset-master-data.vue`
- `ui/src/components/dataset/dataset-extensions.vue`
- `ui/src/components/dataset/dataset-virtual.vue`
- `ui/src/components/dataset/dataset-virtual-child-compat.vue`
- `ui/src/components/common/confirm-menu.vue`
- `ui/src/composables/use-remote-services.ts`

**Modified files:**
- `ui/src/pages/dataset/[id]/edit-metadata.vue` — add three sections + diff computations
