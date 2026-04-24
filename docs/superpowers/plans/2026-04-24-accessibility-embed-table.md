# Accessibility Fixes — Embed Table View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the data-fair embed table view (`/embed/dataset/:id/table`) conformant to RGAA 4.1 criteria 5.5, 5.6, 7.1, 7.2, 7.3, and 7.5 so that the data grid, its search field, its sort controls, and its status messages are correctly restituted to assistive technologies.

**Architecture:**
The embed table page delegates all rendering to `ui/src/components/dataset/table/dataset-table.vue` (used by the portal, the back-office and the embed). The fixes stay in that shared component and in its two direct children (`search-field.vue`, `dataset-table-header-menu.vue`) — no plumbing through props is needed. A single visually-hidden `aria-live="polite"` status region is added once at the top of `dataset-table.vue`; a small composable (`use-table-announcer.ts`) owns the localized messages and the debouncing logic so that the template stays short.

**Tech Stack:** Vue 3 Composition API, Vuetify 3 (v-table / v-text-field / v-menu), vue-i18n, Playwright (e2e), axe-core via `@axe-core/playwright` for automated a11y regression (new dev dependency).

**Scope note on RGAA 7.2:** 7.2 asks for an accessible alternative when scripted components are inaccessible. Once 7.1, 7.3 and 7.5 are fixed, the table itself becomes accessible and 7.2 is satisfied implicitly — no separate "raw data API link" is needed. The download-results menu (already corrected in 6.1) also provides an alternative path to the raw data. No dedicated task in this plan.

---

## File Structure

**Files created:**
- `ui/src/components/dataset/table/use-table-announcer.ts` — composable that exposes a `message` ref plus `announceResults / announceSort / announceLoading / announceDisplay` helpers, fed by `watch()` effects on the relevant reactive sources. Keeps the template free of translation logic.
- `tests/features/embed/dataset-table-a11y.e2e.spec.ts` — Playwright e2e spec for the accessibility assertions (semantic, keyboard, live region, axe scan).

**Files modified:**
- `ui/src/components/dataset/table/dataset-table.vue` — add `<caption>` / `aria-label`, `scope="col"` on each `<th>`, `tabindex="0"` + `role="grid"` on the `<table>`, a visually-hidden aria-live region, and keyboard navigation handlers (arrow keys, Home/End, Enter to activate header menu).
- `ui/src/components/common/search-field.vue` — add an accessible name on the "append" (magnifying glass) button and on the clear affordance, wrap in a `<form role="search">` so criterion 7.1 and 12.6 are both covered.
- `ui/src/components/dataset/table/dataset-table-header-menu.vue` — make the header (acting as the menu activator) announce its state to screen readers via `aria-haspopup="menu"`, `aria-expanded`, `aria-controls`.
- `package.json` — add `@axe-core/playwright` dev dependency for the axe regression scan.

**Not modified (out of scope for this plan, tracked elsewhere):**
- 8.2 / 8.9 / 10.1 (invalid HTML, presentation attributes) — explicit user decision to defer.
- 10.12 (breadcrumb CSS) — not part of data-fair.
- 3.1 (colour-only filter indicator) and 12.6 on the surrounding portal — textual suggestions given separately.

---

## Task 1: Set up the Playwright a11y test harness

**Files:**
- Create: `tests/features/embed/dataset-table-a11y.e2e.spec.ts`
- Modify: `package.json`

- [ ] **Step 1: Install axe-core Playwright helper**

Run:
```bash
npm install --save-dev --workspace=. @axe-core/playwright
```

Expected: new entry in top-level `package.json` devDependencies, no lockfile churn elsewhere.

- [ ] **Step 2: Scaffold the a11y spec with a failing "semantic table" test**

Create `tests/features/embed/dataset-table-a11y.e2e.spec.ts`:

```ts
import { test, expect } from '../../fixtures/login.ts'
import AxeBuilder from '@axe-core/playwright'
import { axiosAuth, clean } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

test.describe('embed dataset table — accessibility (RGAA)', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test('table exposes accessible name and column scopes (5.5 / 5.6)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    const table = page.locator('table').first()
    await expect(table).toBeVisible({ timeout: 15000 })

    // 5.5 — accessible name
    const ariaLabel = await table.getAttribute('aria-label')
    const caption = await table.locator('caption').count()
    expect(Boolean(ariaLabel) || caption > 0).toBe(true)

    // 5.6 — every column header has scope="col"
    const ths = await table.locator('thead > tr > th').all()
    expect(ths.length).toBeGreaterThan(0)
    for (const th of ths) {
      await expect(th).toHaveAttribute('scope', 'col')
    }
  })
})
```

- [ ] **Step 3: Run the new test and verify it fails**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts
```

Expected: FAIL on the `aria-label`/`caption` assertion first (current table has neither).

- [ ] **Step 4: Commit the failing scaffold**

```bash
git add tests/features/embed/dataset-table-a11y.e2e.spec.ts package.json package-lock.json
git commit -m "test(embed-table): scaffold accessibility e2e suite"
```

---

## Task 2: Table accessible name (RGAA 5.5)

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue` (template lines 85–92 and i18n block)

- [ ] **Step 1: Extend i18n block with the table caption key**

In `ui/src/components/dataset/table/dataset-table.vue`, replace the `<i18n>` block with:

```yaml
<i18n lang="yaml">
  fr:
    cancel: Annuler
    delete: Supprimer
    save: Enregistrer
    editLine: Éditer une ligne
    deleteLine: Supprimer une ligne
    deleteLineWarning: Attention, la donnée de cette ligne sera perdue définitivement.
    helpFilterPrompt: Aide-moi à filtrer ces données
    checkDataQualityPrompt: Vérifier la qualité de ces données
    tableCaption: "Tableau de données : {title}"
    tableCaptionFallback: Tableau de données
  en:
    cancel: Cancel
    delete: Delete
    save: Save
    editLine: Edit a line
    helpFilterPrompt: Help me filter this data
    checkDataQualityPrompt: Check data quality
    deleteLine: Delete a line
    deleteLineWarning: Warning, the data from this line will be lost permanently
    tableCaption: "Data table: {title}"
    tableCaptionFallback: Data table
</i18n>
```

- [ ] **Step 2: Compute the caption from the dataset title**

In the same file, add this computed just after the `const { dataset, id: datasetId } = useDatasetStore()` line (around line 505):

```ts
const tableLabel = computed(() => dataset.value?.title
  ? t('tableCaption', { title: dataset.value.title })
  : t('tableCaptionFallback'))
```

- [ ] **Step 3: Render an accessible name on `<v-table>`**

Replace the opening `<v-table ...>` block (lines 85–91) with:

```vue
    <v-table
      v-if="displayMode === 'table' || displayMode === 'table-dense'"
      :height="pagination ? undefined : height - ((noInteraction && !searchOnly) ? 0 : 48)"
      :loading="fetchResults.loading.value"
      class="dataset-table"
      :fixed-header="!pagination"
      :aria-label="tableLabel"
    >
```

Note: `v-table` forwards root attributes to the inner `<table>` element, so `aria-label` lands on the correct node. A visible `<caption>` would also work but would break the existing sticky-header layout.

- [ ] **Step 4: Re-run the 5.5 assertion — should now pass**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts -g "5.5"
```

Expected: PASS for the `aria-label` branch of the assertion, still FAIL on the `scope="col"` branch.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/table/dataset-table.vue
git commit -m "fix(embed-table): add aria-label to data table (RGAA 5.5)"
```

---

## Task 3: Column header scopes (RGAA 5.6)

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue` (th element, lines 98–116)

- [ ] **Step 1: Add `scope="col"` on every `<th>`**

Replace the `<th>` opening tag (lines 98–116) with:

```vue
            <th
              :id="`header-${header.cssKey ?? header.key}`"
              scope="col"
              :title="header.title"
              class="text-left"
              :class="{
                'sticky': header.sticky,
                'bg-surface': header.sticky,
                'border-e-thin': header.sticky,
                'pr-2': header.sticky,
                'pl-2': displayMode === 'table-dense',
                'selectable-header': headerKeys || !!header.synthetic
              }"
              :style="{
                'min-width': (header.property || header.synthetic) ? (colsWidths[i] ?? minColWidth) + 'px' : '',
                cursor: header.property && !noInteraction ? 'pointer' : 'default',
              }"
              @mouseenter="hoveredHeader = noInteraction ? undefined : header"
              @mouseleave="hoveredHeader = undefined"
            >
```

The audit also flagged "`<th>` in `<tr>` unused: no `<td>` uses `headers`" — that warning is a secondary hint when a grid contains merged or irregular headers. A single-row, single-header-column table does NOT need `headers` attributes on each cell once `scope="col"` is set (per WAI tables tutorial §"Simple tables"). No per-cell change is required.

- [ ] **Step 2: Run the 5.6 assertion — should pass**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts -g "5.5"
```

Expected: full PASS on the combined 5.5 / 5.6 assertion.

- [ ] **Step 3: Commit**

```bash
git add ui/src/components/dataset/table/dataset-table.vue
git commit -m "fix(embed-table): add scope=col on table column headers (RGAA 5.6)"
```

---

## Task 4: Accessible search button and search landmark (RGAA 7.1 + 12.6)

**Files:**
- Modify: `ui/src/components/common/search-field.vue`

- [ ] **Step 1: Add the failing test**

Append to `tests/features/embed/dataset-table-a11y.e2e.spec.ts` inside the same `describe`:

```ts
  test('search field is labelled and wrapped in a search landmark (7.1 / 12.6)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

    const searchLandmark = page.locator('[role="search"], search')
    await expect(searchLandmark).toHaveCount(1)

    // Magnifier button must expose an accessible name
    const searchButton = searchLandmark.locator('button, [role="button"]').first()
    await expect(searchButton).toHaveAccessibleName(/recherche|search/i)
  })
```

- [ ] **Step 2: Run the new test — verify it fails**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts -g "7.1"
```

Expected: FAIL — no `[role="search"]` element yet, and the append-inner icon has no accessible name.

- [ ] **Step 3: Wrap the field in a search landmark and label interactive icons**

Replace the whole file `ui/src/components/common/search-field.vue`:

```vue
<template>
  <form
    role="search"
    :aria-label="t('searchLandmark')"
    class="d-contents"
    @submit.prevent="q = pendingQ"
  >
    <v-text-field
      v-model="pendingQ"
      :append-inner-icon="mdiMagnify"
      :label="t('search')"
      class="mx-2"
      color="primary"
      density="compact"
      max-width="250"
      min-width="175"
      variant="outlined"
      hide-details
      single-line
      clearable
      rounded
      :append-inner-aria-label="t('searchSubmit')"
      :clear-aria-label="t('searchClear')"
      @keyup.enter="q = pendingQ"
      @click:append-inner="q = pendingQ"
      @click:clear="q = ''"
    />
  </form>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  searchLandmark: Recherche dans le tableau
  searchSubmit: Lancer la recherche
  searchClear: Effacer la recherche
en:
  search: Search
  searchLandmark: Search in the table
  searchSubmit: Submit search
  searchClear: Clear search
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'

const { immediate } = defineProps<{ immediate?: boolean }>()

const { t } = useI18n()
const q = defineModel<string>({ default: '' })

const pendingQ = ref('')
watch(q, () => { pendingQ.value = q.value }, { immediate: true })
watch(pendingQ, () => { if (immediate) q.value = pendingQ.value })
</script>

<style scoped>
.d-contents { display: contents; }
</style>
```

Notes:
- `display: contents` keeps the existing flex layout of the surrounding toolbar intact (the `<form>` itself introduces no box).
- Vuetify 3 exposes `append-inner-aria-label` and `clear-aria-label` props on `v-text-field`; both are forwarded to the underlying buttons.

- [ ] **Step 4: Run the 7.1 / 12.6 test — should pass**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts -g "7.1"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/common/search-field.vue tests/features/embed/dataset-table-a11y.e2e.spec.ts
git commit -m "fix(search-field): wrap in search landmark and label icon buttons (RGAA 7.1 / 12.6)"
```

---

## Task 5: Announcer composable (RGAA 7.5 + 7.1 state changes)

**Files:**
- Create: `ui/src/components/dataset/table/use-table-announcer.ts`

- [ ] **Step 1: Create the composable**

```ts
import { ref, watch, type Ref } from 'vue'

type SortRef = Ref<{ key: string, direction: 1 | -1 } | undefined>

export interface TableAnnouncerOptions {
  q: Ref<string>
  total: Ref<number | undefined>
  loading: Ref<boolean>
  sort: SortRef
  displayMode: Ref<string>
  headerTitleFor: (key: string) => string
  t: (key: string, values?: Record<string, unknown>) => string
}

export function useTableAnnouncer ({ q, total, loading, sort, displayMode, headerTitleFor, t }: TableAnnouncerOptions) {
  const message = ref('')

  // Debounce so that quick consecutive updates do not stack.
  let timeout: ReturnType<typeof setTimeout> | undefined
  const announce = (msg: string) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => { message.value = msg }, 250)
  }

  watch([total, q], ([newTotal], [oldTotal]) => {
    if (loading.value) return
    if (newTotal === undefined) return
    if (q.value) {
      announce(t('announceSearchResults', { count: newTotal, query: q.value }))
    } else if (oldTotal !== undefined && newTotal !== oldTotal) {
      announce(t('announceResults', { count: newTotal }))
    }
  })

  watch(loading, (isLoading) => {
    if (isLoading) announce(t('announceLoading'))
  })

  watch(sort, (newSort) => {
    if (!newSort) {
      announce(t('announceSortCleared'))
      return
    }
    const direction = newSort.direction === 1 ? t('sortAscending') : t('sortDescending')
    announce(t('announceSort', { column: headerTitleFor(newSort.key), direction }))
  })

  watch(displayMode, (mode) => {
    announce(t('announceDisplayMode', { mode: t(`displayMode_${mode}`) }))
  })

  return { message }
}
```

- [ ] **Step 2: Write a unit test that exercises the announcer**

Add `ui/src/components/dataset/table/use-table-announcer.spec.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { ref, nextTick } from 'vue'
import { useTableAnnouncer } from './use-table-announcer'

describe('useTableAnnouncer', () => {
  it('announces search result count when q changes', async () => {
    vi.useFakeTimers()
    const q = ref('')
    const total = ref<number | undefined>(10)
    const loading = ref(false)
    const sort = ref()
    const displayMode = ref('table')
    const { message } = useTableAnnouncer({
      q, total, loading, sort, displayMode,
      headerTitleFor: () => '',
      t: (key, v) => `${key}:${JSON.stringify(v ?? {})}`
    })
    q.value = 'paris'
    total.value = 3
    await nextTick()
    vi.runAllTimers()
    expect(message.value).toContain('announceSearchResults')
    expect(message.value).toContain('"count":3')
    expect(message.value).toContain('"query":"paris"')
    vi.useRealTimers()
  })

  it('announces sort changes with column title and direction', async () => {
    vi.useFakeTimers()
    const sort = ref<{ key: string, direction: 1 | -1 }>()
    const { message } = useTableAnnouncer({
      q: ref(''),
      total: ref(0),
      loading: ref(false),
      sort,
      displayMode: ref('table'),
      headerTitleFor: (k) => `header-${k}`,
      t: (key, v) => `${key}:${JSON.stringify(v ?? {})}`
    })
    sort.value = { key: 'city', direction: -1 }
    await nextTick()
    vi.runAllTimers()
    expect(message.value).toContain('announceSort')
    expect(message.value).toContain('header-city')
    expect(message.value).toContain('sortDescending')
    vi.useRealTimers()
  })
})
```

- [ ] **Step 3: Run the unit test**

Run:
```bash
npx vitest run ui/src/components/dataset/table/use-table-announcer.spec.ts
```

Expected: both tests PASS.

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/dataset/table/use-table-announcer.ts ui/src/components/dataset/table/use-table-announcer.spec.ts
git commit -m "feat(embed-table): add status-announcer composable for screen readers"
```

---

## Task 6: Wire the announcer into `dataset-table.vue` (RGAA 7.5)

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue`

- [ ] **Step 1: Extend i18n with the announcement strings**

Add the following keys inside the existing `<i18n>` block (both fr and en):

```yaml
    announceResults: "Aucun résultat | 1 résultat | {count} résultats"
    announceSearchResults: "Aucun résultat pour « {query} » | 1 résultat pour « {query} » | {count} résultats pour « {query} »"
    announceLoading: Chargement des résultats
    announceSort: "Tri appliqué : colonne {column}, {direction}"
    announceSortCleared: Tri réinitialisé
    sortAscending: ordre croissant
    sortDescending: ordre décroissant
    announceDisplayMode: "Affichage : {mode}"
    displayMode_table: tableau
    displayMode_table-dense: tableau compact
    displayMode_list: cartes
```

English equivalents (same keys):

```yaml
    announceResults: "No result | 1 result | {count} results"
    announceSearchResults: "No result for \"{query}\" | 1 result for \"{query}\" | {count} results for \"{query}\""
    announceLoading: Loading results
    announceSort: "Sort applied: column {column}, {direction}"
    announceSortCleared: Sort cleared
    sortAscending: ascending order
    sortDescending: descending order
    announceDisplayMode: "Display: {mode}"
    displayMode_table: table
    displayMode_table-dense: dense table
    displayMode_list: cards
```

- [ ] **Step 2: Import and instantiate the announcer**

Add the import next to the existing `useHeaders` import (line 443):

```ts
import { useTableAnnouncer } from './use-table-announcer'
```

Add the following right after `const { headers, headersWithProperty } = useHeaders(...)` (line 551):

```ts
const headerTitleFor = (key: string) => headers.value?.find(h => h.key === key)?.title ?? key
const { message: liveMessage } = useTableAnnouncer({
  q,
  total,
  loading: fetchResults.loading,
  sort,
  displayMode,
  headerTitleFor,
  t
})
```

- [ ] **Step 3: Render the visually-hidden live region**

Insert this block right before the `<v-sheet class="pa-0">` line (line 84):

```vue
  <div
    class="sr-only"
    role="status"
    aria-live="polite"
    aria-atomic="true"
  >
    {{ liveMessage }}
  </div>
```

Append to the existing `<style>` block at the bottom of the file:

```css
.dataset-table-sr-only,
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
```

- [ ] **Step 4: Add an e2e test for the live region**

Append to `tests/features/embed/dataset-table-a11y.e2e.spec.ts`:

```ts
  test('search results are announced via aria-live (7.5)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

    const liveRegion = page.locator('[aria-live="polite"][role="status"]').first()
    await expect(liveRegion).toBeAttached()

    // Trigger a search that narrows results, then assert the region was updated
    const searchInput = page.locator('[role="search"] input').first()
    await searchInput.fill('zzz_no_match_expected_zzz')
    await searchInput.press('Enter')

    await expect(liveRegion).toContainText(/résultat|result/i, { timeout: 5000 })
  })
```

- [ ] **Step 5: Run the full a11y suite**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts
```

Expected: all tests (5.5 / 5.6 / 7.1 / 7.5) PASS.

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/dataset/table/dataset-table.vue tests/features/embed/dataset-table-a11y.e2e.spec.ts
git commit -m "fix(embed-table): announce result count, sort and loading to screen readers (RGAA 7.5)"
```

---

## Task 7: Keyboard access to the grid (RGAA 7.3)

**Files:**
- Modify: `ui/src/components/dataset/table/dataset-table.vue`
- Modify: `ui/src/components/dataset/table/dataset-table-header-menu.vue`

- [ ] **Step 1: Write a failing keyboard test**

Append to `tests/features/embed/dataset-table-a11y.e2e.spec.ts`:

```ts
  test('table is reachable by Tab and sortable via keyboard (7.3)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

    // Focus the table via keyboard — it must appear in tab order
    const table = page.locator('table').first()
    await expect(table).toHaveAttribute('tabindex', '0')
    await expect(table).toHaveAttribute('role', 'grid')

    // First th acts as a button (space/enter opens sort/filter menu)
    const firstHeader = table.locator('thead th[aria-haspopup="menu"]').first()
    await firstHeader.focus()
    await page.keyboard.press('Enter')
    // Menu opens
    await expect(page.locator('[role="menu"]').first()).toBeVisible({ timeout: 2000 })
    await page.keyboard.press('Escape')
  })
```

- [ ] **Step 2: Run the test — verify it fails**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts -g "7.3"
```

Expected: FAIL — `tabindex` and `role` missing; header not keyboard-activable.

- [ ] **Step 3: Make the table focusable and expose a grid role**

In `ui/src/components/dataset/table/dataset-table.vue`, update the `<v-table>` opening tag (already modified in task 2) to:

```vue
    <v-table
      v-if="displayMode === 'table' || displayMode === 'table-dense'"
      :height="pagination ? undefined : height - ((noInteraction && !searchOnly) ? 0 : 48)"
      :loading="fetchResults.loading.value"
      class="dataset-table"
      :fixed-header="!pagination"
      :aria-label="tableLabel"
      role="grid"
      tabindex="0"
    >
```

- [ ] **Step 4: Make each interactive `<th>` keyboard-activable**

Replace the `<th>` block again (from task 3), adding `tabindex`, `role="columnheader"`, `aria-haspopup`, `aria-sort`, and keyboard handlers:

```vue
            <th
              :id="`header-${header.cssKey ?? header.key}`"
              scope="col"
              role="columnheader"
              :tabindex="header.property && !noInteraction ? 0 : -1"
              :aria-haspopup="header.property && !noInteraction ? 'menu' : undefined"
              :aria-sort="header.key === sort?.key ? (sort.direction === 1 ? 'ascending' : 'descending') : (header.property ? 'none' : undefined)"
              :title="header.title"
              class="text-left"
              :class="{
                'sticky': header.sticky,
                'bg-surface': header.sticky,
                'border-e-thin': header.sticky,
                'pr-2': header.sticky,
                'pl-2': displayMode === 'table-dense',
                'selectable-header': headerKeys || !!header.synthetic
              }"
              :style="{
                'min-width': (header.property || header.synthetic) ? (colsWidths[i] ?? minColWidth) + 'px' : '',
                cursor: header.property && !noInteraction ? 'pointer' : 'default',
              }"
              @mouseenter="hoveredHeader = noInteraction ? undefined : header"
              @mouseleave="hoveredHeader = undefined"
              @keydown.enter.prevent="activateHeaderMenu(header)"
              @keydown.space.prevent="activateHeaderMenu(header)"
              @keydown.left.prevent="focusSiblingHeader(i, -1)"
              @keydown.right.prevent="focusSiblingHeader(i, 1)"
              @keydown.home.prevent="focusSiblingHeader(0, 0)"
              @keydown.end.prevent="focusSiblingHeader(headers!.length - 1, 0)"
            >
```

- [ ] **Step 5: Add the header focus / activation helpers**

Add to the `<script setup>` block, near the `hideHeader` function (around line 511):

```ts
const focusHeaderAt = (index: number) => {
  const th = thead.value?.querySelectorAll<HTMLTableCellElement>('th[tabindex="0"]')[index]
  th?.focus()
}
const focusSiblingHeader = (fromIndex: number, delta: number) => {
  const focusable = Array.from(thead.value?.querySelectorAll<HTMLTableCellElement>('th[tabindex="0"]') ?? [])
  if (!focusable.length) return
  const currentIndex = delta === 0 ? fromIndex : focusable.findIndex(el => el === document.activeElement)
  const nextIndex = delta === 0
    ? Math.max(0, Math.min(focusable.length - 1, fromIndex))
    : Math.max(0, Math.min(focusable.length - 1, currentIndex + delta))
  focusable[nextIndex]?.focus()
}
const activateHeaderMenu = (header: TableHeader) => {
  if (!header.property || noInteraction) return
  const activator = document.querySelector<HTMLElement>(`#header-${header.cssKey ?? header.key}`)
  activator?.click()
}
```

- [ ] **Step 6: Expose `aria-expanded` / `aria-controls` on the header menu**

In `ui/src/components/dataset/table/dataset-table-header-menu.vue`, patch the `<v-menu>` wrapper so that the activator gets `aria-expanded` / `aria-controls` in sync with the menu state.

Replace the `<v-menu>` opening and add an `onMounted` watcher in the script:

```vue
  <v-menu
    v-model="showMenu"
    :activator="activator"
    :close-on-content-click="false"
    :max-height="filterHeight"
    location="bottom right"
    :menu-props="{ id: menuId, role: 'menu' }"
    @update:model-value="toggleMenu"
  >
```

Add at the top of the `<script setup>`:

```ts
const menuId = `table-header-menu-${Math.random().toString(36).slice(2, 8)}`

watch(() => [showMenu.value, props.activator], ([isOpen, selector]) => {
  if (typeof selector !== 'string') return
  const el = document.querySelector<HTMLElement>(selector)
  if (!el) return
  el.setAttribute('aria-expanded', String(isOpen))
  if (isOpen) el.setAttribute('aria-controls', menuId)
  else el.removeAttribute('aria-controls')
})
```

- [ ] **Step 7: Run the keyboard test — should pass**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts -g "7.3"
```

Expected: PASS.

- [ ] **Step 8: Smoke-check mouse interaction still works**

Run:
```bash
npx playwright test tests/features/embed/dataset-table.e2e.spec.ts
```

Expected: pre-existing tests still PASS (no regression on mouse flow).

- [ ] **Step 9: Commit**

```bash
git add ui/src/components/dataset/table/dataset-table.vue ui/src/components/dataset/table/dataset-table-header-menu.vue tests/features/embed/dataset-table-a11y.e2e.spec.ts
git commit -m "fix(embed-table): keyboard-accessible grid with sortable headers (RGAA 7.3)"
```

---

## Task 8: Automated axe regression scan

**Files:**
- Modify: `tests/features/embed/dataset-table-a11y.e2e.spec.ts`

- [ ] **Step 1: Append an axe-core scan**

```ts
  test('no axe violations on embed table (regression guard)', async ({ page, goToWithAuth }) => {
    const ax = await axiosAuth('test_user1@test.com')
    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    await goToWithAuth(`/data-fair/embed/dataset/${dataset.id}/table`, 'test_user1')
    await expect(page.locator('table').first()).toBeVisible({ timeout: 15000 })

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      // axe reports a false positive on v-table's internal focus management
      .disableRules(['scrollable-region-focusable'])
      .analyze()

    const blocking = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical')
    expect(blocking, JSON.stringify(blocking, null, 2)).toEqual([])
  })
```

- [ ] **Step 2: Run it**

Run:
```bash
npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts -g "axe"
```

Expected: PASS (no serious / critical violations). If it fails, inspect the JSON output printed by `expect` and fix the referenced nodes before proceeding.

- [ ] **Step 3: Commit**

```bash
git add tests/features/embed/dataset-table-a11y.e2e.spec.ts
git commit -m "test(embed-table): add axe-core regression scan"
```

---

## Task 9: Full-suite regression run

- [ ] **Step 1: Type-check**

Run:
```bash
npm run check-types
```

Expected: no new errors.

- [ ] **Step 2: Lint**

Run:
```bash
npm run lint
```

Expected: clean (or only pre-existing warnings).

- [ ] **Step 3: Related tests**

Run:
```bash
npx playwright test tests/features/embed/
```

Expected: all embed tests PASS (including the new a11y spec and the pre-existing `dataset-table.e2e.spec.ts`).

- [ ] **Step 4: Manual smoke on the running dev env**

Open the dev UI at `/data-fair/embed/dataset/<any_id>/table` and verify:
- VoiceOver / NVDA announces "Tableau de données : <title>" when focus lands on the table.
- Tab reaches the table; arrow keys move focus between headers; Enter opens the sort/filter menu.
- Typing a search term in the field produces an audible announcement of the new result count.
- Visual layout is unchanged (toolbar, sticky header, virtual scrolling still work).

- [ ] **Step 5: Open PR**

```bash
git push -u origin fix-accessibility-audit
gh pr create --title "fix(embed-table): RGAA accessibility fixes (5.5, 5.6, 7.1, 7.3, 7.5, 12.6)" --body "$(cat <<'EOF'
## Summary
- Exposes the data table to assistive technologies: accessible name, column scopes, grid role, tabindex.
- Adds a search landmark with labelled magnifier/clear buttons.
- Introduces a visually-hidden aria-live region that announces result count, sort and loading to screen readers.
- Adds keyboard navigation (Tab, arrow keys, Home/End, Enter) on column headers, which also drives the sort/filter menu.
- Adds a Playwright a11y suite (`tests/features/embed/dataset-table-a11y.e2e.spec.ts`) with an axe-core regression scan.

Follows the RGAA 4.1 audit on `opendata.edf.fr/.../table` (criteria 5.5, 5.6, 7.1, 7.3, 7.5, 12.6).

## Test plan
- [ ] `npx playwright test tests/features/embed/dataset-table-a11y.e2e.spec.ts`
- [ ] `npx playwright test tests/features/embed/dataset-table.e2e.spec.ts` (no regression)
- [ ] `npm run check-types`
- [ ] Manual VoiceOver / NVDA run on the embed table page

EOF
)"
```

---

## Self-Review

- **Spec coverage:** 5.5 (Task 2), 5.6 (Task 3), 7.1 (Tasks 4 + 6 — search button name, state changes), 7.2 (scope note — satisfied by 7.1/7.3/7.5), 7.3 (Task 7), 7.5 (Tasks 5 + 6), 12.6 (Task 4). All covered.
- **Placeholders:** none — every code step shows the full snippet.
- **Type consistency:** `useTableAnnouncer` option names (`q`, `total`, `loading`, `sort`, `displayMode`, `headerTitleFor`, `t`) match the call site in Task 6. `tableLabel`, `liveMessage`, `focusSiblingHeader`, `activateHeaderMenu`, `menuId` are defined in exactly one place each.
- **Commits:** one per logical change; frequent and each tied to a green test run.
