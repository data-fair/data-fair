# Table Pagination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add classic pagination to the dataset table view with toggle between infinite scroll (default) and pagination mode, supporting page size selection (20/50/100) with URL parameters.

**Architecture:** 
- Extend `useLines` composable to support both cursor-based pagination (infinite scroll) and offset-based pagination (classic)
- Add URL parameters `pagination=true`, `page`, and `limit` to track pagination state
- Create new `dataset-table-pagination.vue` component for pagination controls (page numbers + limit dropdown)
- Modify `dataset-table.vue` to add pagination toggle and conditionally render pagination component
- Default mode: infinite scroll (pagination disabled)

**Tech Stack:** Vue 3 Composition API, Vuetify, URL search params synchronization

---

## File Structure

**Files to create:**
- `ui/src/components/dataset/table/dataset-table-pagination.vue` — Pagination controls component

**Files to modify:**
- `ui/src/components/dataset/table/dataset-table.vue` — Add pagination toggle + manage pagination state
- `ui/src/composables/dataset/lines.ts` — Support both infinite scroll and offset-based pagination modes

---

## Task 1: Extend useLines Composable

**Files:**
- Modify: `ui/src/composables/dataset/lines.ts`

- [ ] **Step 1: Read the complete useLines composable**

Run: `wc -l ui/src/composables/dataset/lines.ts`

Verify the full file length to understand all parameters and return values.

- [ ] **Step 2: Add pagination mode parameters to useLines signature**

Modify the function signature to accept `paginationMode` (boolean) and create computed refs for `page` and `limit`:

```typescript
export const useLines = (
  displayMode: MaybeRefOrGetter<string>,
  pageSize: MaybeRefOrGetter<number>,
  selectedCols: MaybeRefOrGetter<string[]>,
  q: Ref<string>,
  sort: MaybeRefOrGetter<string | undefined>,
  extraParams: MaybeRefOrGetter<Record<string, string>>,
  indexedAt: MaybeRefOrGetter<string | undefined>,
  paginationMode?: MaybeRefOrGetter<boolean>,
  page?: Ref<number>,
  limit?: Ref<number>
) => {
```

- [ ] **Step 3: Adapt baseFetchUrl to support pagination mode**

Replace the baseFetchUrl computed to conditionally use either `size: pageSize` (infinite scroll) or `limit: limit.value` (pagination) + `skip: (page.value - 1) * limit.value` (offset calculation):

```typescript
const baseFetchUrl = computed(() => {
  if (!dataset.value?.schema) return null
  if (truncate.value === null) return null
  
  const isPaginationMode = toValue(paginationMode ?? false)
  const query: Record<string, string | number | boolean | undefined> = {
    draft,
    truncate: truncate.value,
    q: q.value || undefined,
    sort: toValue(sort) || undefined,
    ...toValue(extraParams)
  }
  
  if (isPaginationMode && page && limit) {
    // Pagination mode: use skip/limit
    query.skip = (page.value - 1) * limit.value
    query.limit = limit.value
  } else {
    // Infinite scroll mode: use size
    query.size = toValue(pageSize)
  }
  
  if (toValue(indexedAt)) query.indexedAt = toValue(indexedAt)
  else query.finalizedAt = dataset.value.finalizedAt
  
  return withQuery($apiPath + `/datasets/${id}/lines`, query)
})
```

- [ ] **Step 4: Modify fetchResults to reset pagination properly**

In the `fetchResults` function, ensure that when `reset` is called in pagination mode, it doesn't append but replaces:
- In infinite scroll mode: append results (current behavior)
- In pagination mode: always replace results

Check the existing code at line ~111-112 where `if (reset) results.value = extendedResults` is handled. This should already work, but verify the reset parameter is passed correctly.

- [ ] **Step 5: Update reset watcher to handle pagination mode**

The `reset` function already calls `fetchResults.execute(true)` when `baseFetchUrl` changes, which will replace results. This is correct for both modes.

- [ ] **Step 6: Return pagination state from composable**

Update the return statement to include pagination info:

```typescript
return { baseFetchUrl, total, results, fetchResults, truncate }
```

(No change needed here - we don't return page/limit as they're passed as refs and modified externally)

- [ ] **Step 7: Commit changes to useLines**

```bash
git add ui/src/composables/dataset/lines.ts
git commit -m "refactor: extend useLines to support both infinite scroll and pagination modes"
```

---

## Task 2: Create Pagination Component

**Files:**
- Create: `ui/src/components/dataset/table/dataset-table-pagination.vue`

- [ ] **Step 1: Create the pagination component file**

```vue
<template>
  <div class="dataset-table-pagination">
    <v-row
      align="center"
      justify="space-between"
      class="pa-4"
      dense
    >
      <!-- Results info -->
      <v-col cols="auto">
        <span class="text-caption text-medium-emphasis">
          {{ t('itemsPerPage') }}
        </span>
      </v-col>

      <!-- Limit dropdown -->
      <v-col cols="auto">
        <v-select
          v-model.number="selectedLimit"
          :items="limitOptions"
          density="compact"
          variant="outlined"
          hide-details
          @update:model-value="$emit('update:limit', selectedLimit)"
        />
      </v-col>

      <v-spacer />

      <!-- Pagination -->
      <v-col cols="auto">
        <v-pagination
          v-model="selectedPage"
          :length="totalPages"
          density="compact"
          @update:model-value="$emit('update:page', selectedPage)"
        />
      </v-col>
    </v-row>
  </div>
</template>

<i18n lang="yaml">
fr:
  itemsPerPage: Éléments par page
en:
  itemsPerPage: Items per page
</i18n>

<script setup lang="ts">
const { t } = useI18n()

defineProps({
  page: { type: Number, required: true },
  limit: { type: Number, required: true },
  total: { type: Number, required: true }
})

const emit = defineEmits<{
  'update:page': [page: number]
  'update:limit': [limit: number]
}>()

const limitOptions = [20, 50, 100]

const selectedPage = computed({
  get: () => props.page,
  set: (value) => {
    // Local state, emitted on blur in v-pagination
  }
})

const selectedLimit = computed({
  get: () => props.limit,
  set: (value) => {
    // Local state, emitted on change in v-select
  }
})

const totalPages = computed(() => {
  return Math.ceil(props.total / props.limit)
})
</script>

<style scoped>
.dataset-table-pagination {
  border-top: 1px solid rgba(0, 0, 0, 0.12);
  background-color: var(--v-surface-base);
}
</style>
```

- [ ] **Step 2: Test component renders without errors**

```bash
npm run dev
# Navigate to a dataset table page
# Check browser console for any errors
```

- [ ] **Step 3: Commit the new component**

```bash
git add ui/src/components/dataset/table/dataset-table-pagination.vue
git commit -m "feat: create dataset-table-pagination component"
```

---

## Task 3: Modify dataset-table.vue - Add Pagination State

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue:388-450` (script setup section)

- [ ] **Step 1: Add pagination v-models to dataset-table.vue**

After the existing v-models (around line 395-400), add:

```typescript
const paginationEnabled = defineModel<boolean>('paginationEnabled', { default: false })
const page = defineModel<number>('page', { default: 1 })
const limit = defineModel<number>('limit', { default: 20 })
```

- [ ] **Step 2: Pass pagination parameters to useLines**

Find the line where `useLines` is called (around line 447):

```typescript
const { baseFetchUrl, total, results, fetchResults, truncate } = useLines(displayMode, pageSize, selectedCols, q, sortStr, extraParams, indexedAt)
```

Modify it to:

```typescript
const { baseFetchUrl, total, results, fetchResults, truncate } = useLines(
  displayMode,
  pageSize,
  selectedCols,
  q,
  sortStr,
  extraParams,
  indexedAt,
  paginationEnabled,
  page,
  limit
)
```

- [ ] **Step 3: Verify dataset-table integration with useLines call**

Check the file to confirm the line number and exact context. Run:

```bash
grep -n "useLines" ui/src/components/dataset/table/dataset-table.vue
```

Verify the context matches before modifying.

- [ ] **Step 4: Commit pagination state setup**

```bash
git add ui/src/components/dataset/table/dataset-table.vue
git commit -m "refactor: add pagination state v-models to dataset-table"
```

---

## Task 4: Modify dataset-table.vue - Add Pagination Toggle

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue:36-54` (toolbar section)

- [ ] **Step 1: Add pagination toggle button in toolbar**

Find the v-btn-group in the toolbar (around line 36-54). Add a toggle button for pagination mode:

```vue
<v-btn-group
  class="mx-2"
  density="compact"
  variant="outlined"
  divided
>
  <v-btn
    :icon="paginationEnabled ? mdiCheckboxMarked : mdiCheckboxBlankOutline"
    size="small"
    title="Toggle pagination mode"
    @click="paginationEnabled = !paginationEnabled"
  />
  <dataset-table-select-display
    v-if="display.mdAndUp.value"
    v-model="displayMode"
    :edit="edit"
  />
  <dataset-select-cols v-model="cols" />
  <dataset-download-results-menu
    v-if="baseFetchUrl && total !== undefined"
    :base-url="baseFetchUrl"
    :selected-cols="cols"
    :total="total"
  />
</v-btn-group>
```

- [ ] **Step 2: Import required MDI icons**

Find the mdi imports at the top of the script (line 375) and add the checkbox icons:

```typescript
import { mdiMagnify, mdiSortDescending, mdiSortAscending, mdiMenuDown, mdiClose, mdiCheckboxMarked, mdiCheckboxBlankOutline } from '@mdi/js'
```

- [ ] **Step 3: Test toggle button appearance**

```bash
npm run dev
# Navigate to dataset table
# Verify the toggle button appears in the toolbar
# Click it and verify paginationEnabled state changes
```

- [ ] **Step 4: Commit pagination toggle**

```bash
git add ui/src/components/dataset/table/dataset-table.vue
git commit -m "feat: add pagination mode toggle button to table toolbar"
```

---

## Task 5: Modify dataset-table.vue - Conditionally Render Pagination

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue:186-246` (table footer and list mode)

- [ ] **Step 1: Add pagination component below table**

After the closing `</v-table>` tag (around line 187), add:

```vue
<!-- Pagination controls -->
<dataset-table-pagination
  v-if="paginationEnabled && total !== undefined"
  :page="page"
  :limit="limit"
  :total="total"
  @update:page="page = $event"
  @update:limit="limit = $event; page = 1"
/>
```

- [ ] **Step 2: Update infinite scroll trigger for pagination mode**

Find the intersection observer in list mode (around line 239):

```vue
<v-row
  v-if="results.length"
  v-intersect.quiet="(isIntersecting: boolean) => isIntersecting && fetchResults.execute()"
  align="center"
  class="my-0"
>
```

Modify it to only trigger in infinite scroll mode:

```vue
<v-row
  v-if="results.length && !paginationEnabled"
  v-intersect.quiet="(isIntersecting: boolean) => isIntersecting && fetchResults.execute()"
  align="center"
  class="my-0"
>
```

- [ ] **Step 3: Test pagination display**

```bash
npm run dev
# Navigate to dataset table
# Toggle pagination on
# Verify pagination component appears at bottom
# Toggle pagination off
# Verify pagination component disappears
```

- [ ] **Step 4: Commit pagination rendering**

```bash
git add ui/src/components/dataset/table/dataset-table.vue
git commit -m "feat: conditionally render pagination component based on mode"
```

---

## Task 6: Update Table Page Component to Sync URL

**Files:**
- Modify: `ui/src/pages/dataset/[id]/table.vue`

- [ ] **Step 1: Read the current table page component**

Check the file to understand the current structure and what route params are available.

- [ ] **Step 2: Add reactive search params for pagination**

In the script setup section, add:

```typescript
const route = useRoute<'/dataset/[id]/table'>()
const router = useRouter()
const searchParams = useReactiveSearchParams()

const paginationEnabled = computed({
  get: () => searchParams.pagination === 'true',
  set: (value) => {
    if (value) {
      searchParams.pagination = 'true'
      if (!searchParams.page) searchParams.page = '1'
      if (!searchParams.limit) searchParams.limit = '20'
    } else {
      delete searchParams.pagination
      delete searchParams.page
      delete searchParams.limit
    }
  }
})

const page = computed({
  get: () => parseInt(searchParams.page || '1'),
  set: (value) => {
    searchParams.page = String(value)
  }
})

const limit = computed({
  get: () => parseInt(searchParams.limit || '20'),
  set: (value) => {
    searchParams.limit = String(value)
  }
})
```

- [ ] **Step 3: Pass pagination state to dataset-table component**

Find the `<dataset-table>` component in the template and update it:

```vue
<dataset-table
  v-model:paginationEnabled="paginationEnabled"
  v-model:page="page"
  v-model:limit="limit"
  :height="contentHeight"
/>
```

- [ ] **Step 4: Test URL parameter sync**

```bash
npm run dev
# Navigate to a dataset table
# Toggle pagination on
# Verify URL changes to include ?pagination=true&page=1&limit=20
# Change page number
# Verify URL updates to ?...&page=2
# Change limit
# Verify URL updates to ?...&limit=50&page=1 (reset to page 1)
```

- [ ] **Step 5: Test URL persistence**

Manually navigate to `/dataset/[id]/table?pagination=true&page=2&limit=50`
- Verify pagination is enabled
- Verify page 2 is selected
- Verify limit is 50

- [ ] **Step 6: Commit URL sync**

```bash
git add ui/src/pages/dataset/[id]/table.vue
git commit -m "feat: sync pagination state with URL parameters"
```

---

## Task 7: Reset Page When Filters/Sort Change

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue:410-425` (script setup section)

- [ ] **Step 1: Add watcher for query/sort/filter changes**

In `dataset-table.vue` script setup, after the existing watchers (around line 410), add:

```typescript
// Reset to page 1 when filters, search, or sort changes in pagination mode
watch([q, sortStr, filters], () => {
  if (paginationEnabled.value && page.value !== 1) {
    page.value = 1
  }
}, { immediate: false })
```

- [ ] **Step 2: Test page reset**

```bash
npm run dev
# Navigate to dataset table
# Toggle pagination on and go to page 2
# Change a filter or search term
# Verify page resets to 1
# Go back to page 2
# Change sort
# Verify page resets to 1
```

- [ ] **Step 3: Commit page reset logic**

```bash
git add ui/src/components/dataset/table/dataset-table.vue
git commit -m "feat: reset to page 1 when filters/sort change in pagination mode"
```

---

## Task 8: Test Complete Pagination Flow

**Files:**
- Test: `ui/src/pages/dataset/[id]/table.vue`, `ui/src/components/dataset/table/dataset-table.vue`

- [ ] **Step 1: Manual test infinite scroll (default)**

```bash
npm run dev
# Navigate to /dataset/[id]/table
# Verify pagination controls are not visible
# Scroll down
# Verify more results load automatically
# Verify URL has no pagination params
```

- [ ] **Step 2: Manual test pagination mode enabled**

```bash
npm run dev
# Navigate to /dataset/[id]/table
# Click pagination toggle
# Verify pagination controls appear at bottom
# Verify URL changes to ?pagination=true&page=1&limit=20
# Verify infinite scroll stops (scroll doesn't load more)
```

- [ ] **Step 3: Manual test page navigation**

```bash
# From pagination view, click page 2 in pagination controls
# Verify page changes
# Verify results update
# Verify URL changes to ?pagination=true&page=2&limit=20
```

- [ ] **Step 4: Manual test limit change**

```bash
# From pagination view, change limit dropdown to 50
# Verify results refresh
# Verify page resets to 1
# Verify URL changes to ?pagination=true&page=1&limit=50
```

- [ ] **Step 5: Manual test toggle back to infinite scroll**

```bash
# While in pagination mode on page 2
# Click pagination toggle to disable
# Verify pagination controls disappear
# Verify URL resets (no pagination params)
# Scroll down
# Verify infinite scroll resumes
```

- [ ] **Step 6: Manual test filter with pagination**

```bash
# While in pagination mode
# Apply a filter
# Verify results update
# Verify page resets to 1
# Verify pagination numbers update based on new total
```

- [ ] **Step 7: Manual test URL direct navigation**

```bash
# Manually navigate to /dataset/[id]/table?pagination=true&page=3&limit=50
# Verify pagination is enabled
# Verify page 3 is shown
# Verify limit is 50
```

- [ ] **Step 8: Run existing tests (if any)**

```bash
npm run test
# Verify no tests break with the new changes
```

---

## Task 9: Fix Any Edge Cases

**Files:**
- Modify: As needed based on testing

- [ ] **Step 1: Test with different dataset sizes**

Test with:
- Very small dataset (< 20 items) - should show 1 page
- Large dataset (> 1000 items) - should show many pages

- [ ] **Step 2: Test mobile responsiveness**

- [ ] **Step 3: Test with all display modes**

Test pagination works with:
- Table mode
- Table dense mode
- List mode (cards)

- [ ] **Step 4: Document any issues found and fix them**

Create additional commits as needed for bug fixes.

---

## Summary

After completion, the dataset table view will have:
✅ Default infinite scroll behavior (unchanged UX)
✅ Toggle button to enable/disable classic pagination
✅ Pagination controls at bottom (page numbers + limit dropdown: 20/50/100)
✅ URL parameters: `?pagination=true&page=1&limit=20`
✅ Page resets to 1 when filters/sort changes
✅ Full two-mode support without breaking existing features
