# Phase 4f — Dataset Configuration Components Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate three dataset configuration components (master-data, extensions, virtual) from Vue 2/Vuex to Vue 3/Vuetify 4 v-model components integrated into the existing edit-metadata page.

**Architecture:** Each component receives the full dataset object via `defineModel<any>()` and mutates sub-properties directly. The parent `edit-metadata.vue` owns `useEditFetch` (PATCH mode), detects diffs per section, and provides a single save button. One exception: extension refresh emits an event handled by the parent via the dataset store's `patchDataset`.

**Tech Stack:** Vue 3, Vuetify 4, VJSF v4 (`@koumoul/vjsf`), vuedraggable v4, fast-deep-equal, TypeScript

**Spec:** `docs/superpowers/specs/2026-03-20-phase4f-dataset-config-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `ui/src/composables/use-remote-services.ts` | Create | Fetch remote services list, provide `remoteServicesMap` |
| `ui/src/components/dataset/dataset-master-data.vue` | Create | VJSF-driven master data editor |
| `ui/src/components/dataset/dataset-extensions.vue` | Create | Remote service + calculated column extension editor |
| `ui/src/components/dataset/dataset-virtual-child-compat.vue` | Create | Schema compatibility validation between child and parent |
| `ui/src/components/dataset/dataset-virtual.vue` | Create | Virtual dataset config (children, columns, filters) |
| `ui/src/pages/dataset/[id]/edit-metadata.vue` | Modify | Add 3 new sections + diff computations + refresh handler |

---

### Task 1: `useRemoteServices` composable

**Files:**
- Create: `ui/src/composables/use-remote-services.ts`

- [ ] **Step 1: Create the composable**

Note: `.ts` composable files require explicit imports (auto-imports only work in `.vue` SFCs). Follow the pattern from `dataset-store.ts`.

```ts
// ui/src/composables/use-remote-services.ts
import { computed, type Ref } from 'vue'
import { withQuery } from 'ufo'

export function useRemoteServices (owner: Ref<{ type: string, id: string } | undefined>) {
  const url = computed(() => {
    if (!owner.value) return null
    return withQuery(`${$apiPath}/remote-services`, {
      size: 1000,
      privateAccess: `${owner.value.type}:${owner.value.id}`
    })
  })

  const remoteServicesFetch = useFetch<{ results: any[] }>(url)

  const remoteServices = computed(() => remoteServicesFetch.data.value?.results ?? [])

  const remoteServicesMap = computed(() => {
    const map: Record<string, { id: string, title: string, actions: Record<string, any> }> = {}
    for (const service of remoteServices.value) {
      const actions: Record<string, any> = {}
      for (const action of service.actions || []) {
        actions[action.id] = action
      }
      map[service.id] = { id: service.id, title: service.title, actions }
    }
    return map
  })

  return { remoteServices, remoteServicesMap, remoteServicesFetch }
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `cd ui && npx vue-tsc --noEmit --pretty 2>&1 | head -30`
Expected: No errors related to use-remote-services.ts

- [ ] **Step 3: Commit**

```bash
git add ui/src/composables/use-remote-services.ts
git commit -m "feat: add useRemoteServices composable for dataset extensions"
```

---

### Task 2: `dataset-master-data.vue`

**Files:**
- Create: `ui/src/components/dataset/dataset-master-data.vue`
- Reference: `ui-legacy/public/components/dataset/dataset-master-data.vue`
- Reference: `api/types/dataset/schema.js` (for masterData sub-schema)
- Reference: `api/contract/master-data.js` (the actual schema)

- [ ] **Step 1: Create the component**

Key patterns to follow from `dataset-info.vue`:
- `const dataset = defineModel<any>({ required: true })` — full dataset v-model
- `const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false`
- `const { t, locale } = useI18n()`

The component wraps VJSF v4, binding `v-model="dataset.masterData"` with the masterData JSON schema. It initializes `dataset.masterData` to the default if undefined.

Schema import: `import { schema as masterDataSchema } from '../../../../api/contract/master-data.js'`

The VJSF context object must include:
- `dataset`: current dataset
- `directoryUrl`: from `$sitePath + '/simple-directory'` (matching `ui/src/main.ts:26`)
- `ownerOrg`: `dataset.value.owner?.type === 'organization'`
- `stringProperties`, `filterProperties`, `searchProperties`, `propertiesWithConcepts`, `hasDateIntervalConcepts` — all computed from `dataset.value.schema` (copy the exact filter logic from the legacy component lines 99-111). Note: `hasDateIntervalConcepts` is required by the master-data JSON schema for conditional display of date-interval options.

VJSF options: `{ locale: locale.value, readOnly: !can('writeDescription') }`

Template: VJSF form with descriptive intro text. No save button (parent handles save). Include tutorial alert slots matching the legacy component's `#shareOrgs-before`, `#singleSearchs-before`, etc.

i18n block with fr/en translations for the intro text.

- [ ] **Step 2: Verify lint passes**

Run: `cd ui && npx eslint src/components/dataset/dataset-master-data.vue`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/dataset/dataset-master-data.vue
git commit -m "feat: add dataset-master-data component with VJSF v4"
```

---

### Task 3: `dataset-extensions.vue`

**Files:**
- Create: `ui/src/components/dataset/dataset-extensions.vue`
- Reference: `ui-legacy/public/components/dataset/dataset-extensions.vue`
- Reference: `ui/src/composables/use-remote-services.ts` (from Task 1)
- Reference: `ui/src/components/confirm-menu.vue` (existing)
- Reference: `ui/src/components/dataset/dataset-add-property-dialog.vue` (existing from Phase 4c)

- [ ] **Step 1: Create the component**

Key patterns:
- `const dataset = defineModel<any>({ required: true })` — full dataset v-model
- `const emit = defineEmits<{ refresh: [extension: any] }>()` — for immediate PATCH refresh
- Uses `useRemoteServices(owner)` composable
- Uses `useStore()` for `vocabulary`
- `const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false`

Core data:
- `dataset.value.extensions` is the array being edited (mutated directly via v-model)
- No local copy needed (v-model pattern replaces the legacy `localExtensions` + `hasChanges` + `applyExtensions` pattern)

Template structure (migrated from legacy lines 1-243):

1. **Add extension menu** (`v-menu` with `v-btn` activator):
   - List available extensions from `availableExtensions` computed
   - Active extensions clickable to add to `dataset.value.extensions`
   - Disabled extensions shown greyed with reason text
   - "Add calculated column" button opens `dataset-add-property-dialog`

2. **Extension cards** (`v-row` > `v-col cols=12 md=6` per extension):
   - **Remote service type**: card title = action summary, body = link info text + `v-autocomplete` for additional columns (selectFields computed), overwrite key fields section (collapsible), auto-update checkbox (REST only). Card actions: refresh via `confirm-menu` (emits `refresh`), delete via `confirm-menu`
   - **Expression eval type**: card title = property originalName, body = disabled text field showing expression. Card actions: delete via `confirm-menu`
   - No details dialog, no preview dialog (deferred)

Computed properties (migrated from legacy):
- `datasetConcepts` — `new Set(dataset.value.schema.map(...))` (legacy line 311-313)
- `availableExtensions` — iterates `remoteServices`, checks concept matching, marks disabled (legacy lines 314-337)
- `selectFields` — builds field/tag lists per extension from remote service output (legacy lines 338-365)

Methods (simplified from legacy):
- `removeExtension(idx)` — `dataset.value.extensions.splice(idx, 1)`
- `extensionLinkInfo(extension)` — concept-based link description (legacy lines 427-436)
- `validPropertyOverwrite(extension, name, newName)` — validates overwrite key uniqueness (legacy lines 438-457)
- `setOverwriteOriginalName(extension, propKey, value)` — sets overwrite x-originalName (legacy lines 458-466, replace `$set`/`$delete` with direct assignment)

Vue 2 → Vue 3 migration notes:
- Replace `this.$set(obj, key, val)` with `obj[key] = val`
- Replace `this.$delete(obj, key)` with `delete obj[key]`
- Replace `v-on="on"` activator pattern with `v-bind="props"` (Vuetify 4)
- Replace `v-t="'key'"` with `{{ t('key') }}`
- Replace `item-text` with `item-title` on autocomplete
- Vuetify 4 list items: remove `v-list-item-content` wrapper (deleted in v4), keep `v-list-item-title`/`v-list-item-subtitle` as direct children of `v-list-item`. Replace `v-list-item-avatar` with `template #prepend`, `v-list-item-action` with `template #append`.
- Replace `this.$t(...)` with `t(...)`
- Replace `depressed` with `variant="flat"`

i18n block: copy from legacy lines 245-280, both fr and en.

- [ ] **Step 2: Verify lint passes**

Run: `cd ui && npx eslint src/components/dataset/dataset-extensions.vue`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/dataset/dataset-extensions.vue
git commit -m "feat: add dataset-extensions component for enrichment config"
```

---

### Task 4: `dataset-virtual-child-compat.vue`

**Files:**
- Create: `ui/src/components/dataset/dataset-virtual-child-compat.vue`
- Reference: `ui-legacy/public/components/dataset/dataset-virtual-child-compat.vue`
- Reference: `api/contract/capabilities.js`
- Reference: `ui/src/utils/dataset.ts` (for `propertyTypes`)
- Reference: `ui/src/composables/use-store.ts` (for `vocabulary`)

- [ ] **Step 1: Create the component**

Props-based component with computed validation. No v-model needed.

```ts
const props = defineProps<{
  child: { schema: any[], status?: string },
  parentSchema: any[]
}>()
```

Uses:
- `import capabilitiesSchema from '../../../../api/contract/capabilities.js'` — for capability defaults
- `import { propertyTypes } from '~/utils/dataset'` — for type matching
- `const { vocabulary } = useStore()` — for concept title resolution

Template: `<ul>` with colored `<li>` items. Vuetify 4 color classes: `text-success`, `text-warning`, `text-error` (replacing legacy `success--text`, `warning--text`, `error--text`).

Computed `messages` — direct port of legacy lines 65-129:
- Info: additional fields in child not in parent
- Warning: missing fields, disabled/active capability mismatches
- Error: dataset error status, type mismatches, concept mismatches

`matchPropertyType(p)` method — finds matching type from `propertyTypes` array (legacy lines 132-135).

i18n block: copy from legacy lines 27-49.

- [ ] **Step 2: Verify lint passes**

Run: `cd ui && npx eslint src/components/dataset/dataset-virtual-child-compat.vue`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/dataset/dataset-virtual-child-compat.vue
git commit -m "feat: add dataset-virtual-child-compat schema validation component"
```

---

### Task 5: `dataset-virtual.vue`

**Files:**
- Create: `ui/src/components/dataset/dataset-virtual.vue`
- Reference: `ui-legacy/public/components/dataset/dataset-virtual.vue`
- Reference: `ui/src/components/dataset/dataset-virtual-child-compat.vue` (from Task 4)

- [ ] **Step 1: Create the component**

Key patterns:
- `const dataset = defineModel<any>({ required: true })` — full dataset v-model
- Edits `dataset.value.virtual` (object) and `dataset.value.schema` (array) directly
- `const { account } = useSessionAuthenticated()` — for owner-scoped search and active account filter
- `const can = (op: string) => dataset.value?.userPermissions?.includes(op) ?? false`

Internal state (not part of v-model, used for UI):
- `childrenById` — `ref<Record<string, any>>({})` — fetched child dataset info
- `loadingChildren` — `ref(false)`
- `searchDataset` — `ref('')` — search input for autocomplete
- `searchCol` — `ref<Record<string, string>>({})` — per-child column search
- `searchFilter` — `ref('')`
- `searchedFilter` — `ref<string | null>(null)`

Template structure (migrated from legacy lines 1-305):

**Section 1 — Children management:**
- `v-autocomplete` with `v-model:search="searchDataset"`, `:items="childrenItems"`, `no-filter`, `hide-no-data`
  - Item template: show dataset title + owner info (no dataset-list-item component, use inline template since we decided on custom search)
  - On change: push child id to `dataset.value.virtual.children`, then `fetchChildren()`
- Loading indicator
- `v-card` with `v-list` of children:
  - Per child: title as router-link, field selector autocomplete, `dataset-virtual-child-compat` inline, delete button
  - No draggable on children list (legacy didn't use draggable on children, only on columns)

**Section 2 — Column selection:**
- `v-card` with draggable `v-list` (vuedraggable v4):
  - `import draggable from 'vuedraggable'` (matching `dataset-properties-slide.vue` pattern)
  - `v-model="dataset.value.schema"` on the draggable
  - Filter to show only non-calculated fields (`v-show="!field['x-calculated']"`)
  - Per column: drag handle icon, title, delete button

**Section 3 — Filter configuration:**
- Active account checkbox (conditional on schema having account concept or `virtual.filterActiveAccount`)
- Autocomplete to add filters from `allColumns`
- `v-list` of filters with operator select (`in`/`nin`) and value combobox

Async logic:
- `fetchChildren()` — fetches `/api/v1/datasets` with `id=children.join(',')`, populates `childrenById` (legacy lines 471-483)
- `searchDatasets()` — fetches remote services for master-data parents + owner datasets (legacy lines 484-507). Use `useAsyncAction` + `watchDebounced` on `searchDataset`
- `childrenItems` — computed combining `refDatasets` and `datasets` with headers (legacy lines 429-440)
- `allColumns` — computed from `childrenById` schemas (legacy lines 403-409)
- `valuesByKey` — computed from `childrenById` schemas for enum values (legacy lines 411-425)
- `existingFields` — `computed(() => dataset.value.schema.map(f => f.key))`

Methods:
- `addChild(child)` — push to `dataset.value.virtual.children`, reset search, re-fetch children
- `deleteChild(i)` — splice from `dataset.value.virtual.children`
- `addField(field, child)` — push new field object to `dataset.value.schema` (legacy lines 517-526)
- `deleteField(field)` — filter from `dataset.value.schema`
- `addFilter(key)` — push to `dataset.value.virtual.filters`
- `filterLabel(filter)` — label from allColumns (legacy line 530-532)

Vue 2 → Vue 3 migration notes:
- Replace `this.$axios.$get(url, { params })` with `$fetch(withQuery(url, params))`
- Replace `:search-input.sync` with `v-model:search`
- Replace `@change` on autocomplete with `@update:model-value`
- Replace `@input` on select with `@update:model-value`
- Vuetify 4 list items: remove `v-list-item-content` wrapper (deleted in v4), keep `v-list-item-title`/`v-list-item-subtitle` as direct children. Replace `v-list-item-avatar` with `template #prepend`, `v-list-item-action` with `template #append`.
- Replace `this.$set(obj, key, val)` with direct assignment
- Replace `nuxt-link` with `router-link`
- Import `withQuery` from `'ufo'`

i18n block: copy from legacy lines 308-360.

Style: `.handle { cursor: grab; }` (from legacy)

- [ ] **Step 2: Verify lint passes**

Run: `cd ui && npx eslint src/components/dataset/dataset-virtual.vue`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/dataset/dataset-virtual.vue
git commit -m "feat: add dataset-virtual component for virtual dataset config"
```

---

### Task 6: Integrate into `edit-metadata.vue`

**Files:**
- Modify: `ui/src/pages/dataset/[id]/edit-metadata.vue`

- [ ] **Step 1: Add imports and session**

Add to script section:
```ts
import { mdiPuzzle, mdiDatabase, mdiSetAll } from '@mdi/js'
```

Add after the `useI18n()` line (`useSessionAuthenticated` is auto-imported in `.vue` files, no explicit import needed):
```ts
const { accountRole } = useSessionAuthenticated()
```

- [ ] **Step 2: Add diff computations**

Add after `schemaHasDiff`:
```ts
const extensionsHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.extensions, s.extensions)
})

const masterDataHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.masterData, s.masterData)
})

const virtualHasDiff = computed(() => {
  const d = datasetEditFetch.data.value
  const s = datasetEditFetch.serverData.value
  if (!d || !s) return false
  return !equal(d.virtual, s.virtual) || !equal(d.schema, s.schema)
})
```

- [ ] **Step 3: Add conditional sections to the sections computed**

In the `computedDeepDiff` callback, after the schema section and **before** the attachments section (`if (!d.draftReason)`), add:

```ts
    // Extensions section (non-virtual, non-meta-only datasets)
    if (!d.isVirtual && !d.isMetaOnly) {
      result.push({
        title: t('extensions'),
        id: 'extensions',
        color: extensionsHasDiff.value ? 'accent' : undefined,
        tabs: [{
          key: 'extensions',
          title: t('extensions'),
          icon: mdiPuzzle,
          appendIcon: extensionsHasDiff.value ? mdiAlert : undefined,
          color: extensionsHasDiff.value ? 'accent' : undefined
        }]
      })
    }

    // Master data section (admin only, finalized, non-meta-only)
    if (!d.draftReason && !d.isMetaOnly && accountRole.value === 'admin') {
      result.push({
        title: t('masterData'),
        id: 'master-data',
        color: masterDataHasDiff.value ? 'accent' : undefined,
        tabs: [{
          key: 'master-data',
          title: t('masterData'),
          icon: mdiDatabase,
          appendIcon: masterDataHasDiff.value ? mdiAlert : undefined,
          color: masterDataHasDiff.value ? 'accent' : undefined
        }]
      })
    }

    // Virtual dataset section
    if (d.isVirtual) {
      result.push({
        title: t('virtual'),
        id: 'virtual',
        color: virtualHasDiff.value ? 'accent' : undefined,
        tabs: [{
          key: 'virtual',
          title: t('virtual'),
          icon: mdiSetAll,
          appendIcon: virtualHasDiff.value ? mdiAlert : undefined,
          color: virtualHasDiff.value ? 'accent' : undefined
        }]
      })
    }
```

- [ ] **Step 4: Add template sections**

After the schema `layout-section-tabs` block and before the attachments block, add:

```vue
          <layout-section-tabs
            v-if="section.id === 'extensions'"
            :id="section.id"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="extensions">
                  <v-container fluid>
                    <dataset-extensions
                      v-model="datasetEditFetch.data.value"
                      @refresh="onRefreshExtension"
                    />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <layout-section-tabs
            v-if="section.id === 'master-data'"
            :id="section.id"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="master-data">
                  <v-container fluid>
                    <dataset-master-data v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>

          <layout-section-tabs
            v-if="section.id === 'virtual'"
            :id="section.id"
            :min-height="300"
            :title="section.title"
            :tabs="section.tabs"
            :color="section.color"
          >
            <template #content="{ tab }">
              <v-tabs-window :model-value="tab">
                <v-tabs-window-item value="virtual">
                  <v-container fluid>
                    <dataset-virtual v-model="datasetEditFetch.data.value" />
                  </v-container>
                </v-tabs-window-item>
              </v-tabs-window>
            </template>
          </layout-section-tabs>
```

- [ ] **Step 5: Add refresh handler**

Add to the script section. Note: after the store patch, we must refresh `datasetEditFetch` so that `serverData` stays in sync and diff indicators don't show false changes.

```ts
const onRefreshExtension = async (extension: any) => {
  await store.patchDataset.execute({ extensions: [{ ...extension, needsUpdate: true }] })
  // Refresh editFetch to sync serverData after the server-side patch
  await datasetEditFetch.refresh()
}
```

- [ ] **Step 6: Add i18n keys**

Add to the i18n block:
```yaml
# fr section:
  extensions: Enrichissements
  masterData: Données de référence
  virtual: Jeu de données virtuel
# en section:
  extensions: Extensions
  masterData: Master data
  virtual: Virtual dataset
```

- [ ] **Step 7: Verify lint passes**

Run: `cd ui && npx eslint src/pages/dataset/\\[id\\]/edit-metadata.vue`
Expected: No errors (warnings about v-html in other files are OK)

- [ ] **Step 8: Commit**

```bash
git add ui/src/pages/dataset/[id]/edit-metadata.vue
git commit -m "feat: integrate extensions, master-data, and virtual sections into edit-metadata"
```

---

### Task 7: Manual smoke test

- [ ] **Step 1: Start dev server**

Run: `npm run dev` (or the project's dev command)

- [ ] **Step 2: Test master-data section**

Navigate to a non-virtual, non-meta-only dataset's edit-metadata page as admin. Verify:
- Master data section appears with VJSF form
- Editing fields highlights section in accent
- Save button appears and works

- [ ] **Step 3: Test extensions section**

Navigate to a non-virtual dataset's edit-metadata page. Verify:
- Extensions section appears
- "Add extension" menu shows available remote services
- "Add calculated column" opens add-property dialog
- Adding/removing extensions highlights section
- Refresh emits correctly

- [ ] **Step 4: Test virtual dataset section**

Navigate to a virtual dataset's edit-metadata page. Verify:
- Virtual section appears (extensions/master-data do not)
- Child dataset search works
- Column drag-drop reordering works
- Filter configuration works
- Save applies changes

- [ ] **Step 5: Commit any fixes**

```bash
git add -u
git commit -m "fix: address smoke test issues in Phase 4f components"
```
