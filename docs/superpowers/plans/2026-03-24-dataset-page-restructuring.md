# Dataset Page Restructuring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure dataset pages to achieve feature parity with legacy UI — reorganize sections, fix draft mode, add confirmation dialog, clean up actions menu.

**Architecture:** Incremental restructuring of `ui/src/pages/dataset/[id]/index.vue` and related components. Each task modifies one logical area. The main page moves from 7 `layout-section-tabs` sections to 4 (Schema, Consulter la donnée, Partage, Activité) preceded by a flat description+metadata block.

**Tech Stack:** Vue 3, Vuetify 4, TypeScript, Playwright for e2e tests

**Spec:** `docs/superpowers/specs/2026-03-24-dataset-page-restructuring-design.md`

---

## File Structure

**Files to modify:**
- `ui/src/pages/dataset/[id]/index.vue` — Main dataset page (major restructure)
- `ui/src/pages/dataset/[id]/edit-metadata.vue` — Edit metadata page (split tabs, add confirmation dialog)
- `ui/src/pages/dataset/[id]/data.vue` — Remove (replaced by individual routes)
- `ui/src/pages/dataset/[id]/events.vue` — Remove (merged into Activité tab)
- `ui/src/components/dataset/dataset-actions.vue` — Clean up removed items
- `ui/src/components/dataset/dataset-status.vue` — Fix validation + button alignment
- `ui/src/components/dataset/dataset-info.vue` — Split editable/readonly concerns
- `ui/src/components/common/notifications-dialog.vue` — Convert to inline component
- `ui/src/components/common/webhooks-dialog.vue` — Convert to inline component

**Files to create:**
- `ui/src/pages/dataset/[id]/table.vue` — Table visualization route
- `ui/src/pages/dataset/[id]/map.vue` — Map visualization route
- `ui/src/pages/dataset/[id]/files.vue` — Files visualization route
- `ui/src/pages/dataset/[id]/thumbnails.vue` — Thumbnails visualization route
- `ui/src/pages/dataset/[id]/revisions.vue` — Revisions visualization route
- `ui/src/components/dataset/dataset-metadata-view.vue` — Readonly metadata display for main page
- `ui/src/components/dataset/dataset-metadata-form.vue` — Editable metadata form for edit-metadata
- `ui/src/components/dataset/dataset-save-dialog.vue` — Confirmation dialog with AI summary
- `tests/features/ui/dataset-restructuring.e2e.spec.ts` — New e2e tests

**Existing test files that will need healing:**
- `tests/features/ui/dataset-pages.e2e.spec.ts`

---

## Task 1: Add SVG illustrations to layout-section-tabs

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`

This task adds SVG imports and passes them to existing `layout-section-tabs` components. This is a small foundational change.

- [ ] **Step 1: Add SVG imports to index.vue**

At the top of the `<script setup>` section, add SVG imports:

```typescript
import buildingSvg from '~/assets/svg/Team building _Two Color.svg?raw'
import dataSvg from '~/assets/svg/Data storage_Two Color.svg?raw'
import shareSvg from '~/assets/svg/Share_Two Color.svg?raw'
import settingsSvg from '~/assets/svg/Settings_Monochromatic.svg?raw'
```

- [ ] **Step 2: Pass SVGs to existing layout-section-tabs**

Add `:svg` prop to each section:
- Schema section: `:svg="buildingSvg"`
- Share section: `:svg="shareSvg"`
- Activity section: `:svg="settingsSvg" svg-no-margin`

(Data and Applications sections will be restructured in later tasks.)

- [ ] **Step 3: Verify the SVGs render**

Run the dev server and visually check that SVGs appear in section headers on the main dataset page.

- [ ] **Step 4: Run existing e2e tests**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

If tests break, use playwright-healer agent to fix.

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue
git commit -m "feat: add SVG illustrations to dataset page sections"
```

---

## Task 2: Create readonly dataset-metadata-view component

**Files:**
- Create: `ui/src/components/dataset/dataset-metadata-view.vue`
- Modify: `ui/src/pages/dataset/[id]/index.vue`

Replace the separate "Description" and "Métadonnées" `layout-section-tabs` sections with a single flat readonly block at the top of the page.

- [ ] **Step 1: Create dataset-metadata-view.vue**

Create a new component that displays all metadata in readonly mode. Reference:
- Current index.vue lines 21-157 (description + metadata sections)
- Legacy `dataset-info.vue` lines 10-162 (readonly info list with icons)
- Legacy `dataset-info.vue` lines 165-383 (metadata fields displayed readonly)

The component uses `useDatasetStore()` to access the dataset (it lives inside the dataset page context). It displays:
- Title (large text, e.g. `text-h4`)
- Description (rendered HTML via `v-html`)
- Image (right-aligned, responsive, if dataset.image exists)
- Metadata list with icons (v-list):
  - Owner (mdiAccount)
  - License (mdiLicense) — linked if URL available
  - Last metadata update (mdiPencil) — who and when
  - Data last updated — who and when
  - Creation date (mdiPlusCircleOutline) — who and when
  - Record count (mdiCounter) — formatted
  - Keywords as chips
  - Topics as outlined chips
  - Origin, temporal/spatial coverage, frequency, creator (all conditional, only if present)
  - Custom metadata fields (loop over configured fields)

Use a 2-column layout: left column for title/description/metadata-list, right column for image (similar to current description section layout with `v-col cols="12" md="8"` / `v-col cols="12" md="4"`).

```vue
<script setup lang="ts">
import { useDatasetStore } from '~/composables/dataset-store'
// ... icons imports
const { dataset, can } = useDatasetStore()
</script>
```

- [ ] **Step 2: Replace description and metadata sections in index.vue**

In `index.vue`, remove the two `layout-section-tabs` for "description" (id='description') and "metadata" (id='metadata'). Replace with the new component placed before the first `layout-section-tabs`:

```vue
<dataset-metadata-view />
```

Also update the `sections` computed to remove the 'description' and 'metadata' entries.

- [ ] **Step 3: Verify rendering**

Check the main dataset page — the flat metadata block should appear at the top, followed by the remaining tabbed sections.

- [ ] **Step 4: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

Use playwright-healer if tests break (they will — the test checks for "description" and "metadata" sections that no longer exist as separate sections).

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/dataset-metadata-view.vue ui/src/pages/dataset/[id]/index.vue
git commit -m "feat: merge description and metadata into flat readonly block"
```

---

## Task 3: Move Enrichissements into Schema section as tab

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`

- [ ] **Step 1: Add Enrichissements tab to Schema section**

In `index.vue`, find the schema `layout-section-tabs` section. Add a second tab for "Enrichissements" and import `dataset-extensions`:

```vue
<layout-section-tabs
  id="schema"
  :title="t('schema')"
  :tabs="[
    { key: 'schema', title: t('schema'), icon: mdiTableCog },
    { key: 'extensions', title: t('extensions'), icon: mdiPuzzle }
  ]"
  :svg="buildingSvg"
  v-model="schemaTab"
>
  <template #content="{ tab }">
    <v-tabs-window-item value="schema">
      <dataset-schema-view ... />
    </v-tabs-window-item>
    <v-tabs-window-item value="extensions">
      <dataset-extensions />
    </v-tabs-window-item>
  </template>
</layout-section-tabs>
```

Also declare `const schemaTab = ref('schema')` in the script setup.

Note: `dataset-extensions` already gates edit actions behind `can('writeDescriptionBreaking')` permission checks, so it naturally becomes readonly on the main page where the dataset store context provides permissions. No `readonly` prop needed.

- [ ] **Step 2: Remove standalone extensions section if it exists**

If there's a standalone extensions section on the main page, remove it.

- [ ] **Step 3: Update sections computed**

Add 'extensions' to the schema section entry, remove standalone extensions entry if present.

- [ ] **Step 4: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue ui/src/components/dataset/dataset-extensions.vue
git commit -m "feat: move enrichissements into schema section as tab"
```

---

## Task 4: Create individual visualization route pages

**Files:**
- Create: `ui/src/pages/dataset/[id]/table.vue`
- Create: `ui/src/pages/dataset/[id]/map.vue`
- Create: `ui/src/pages/dataset/[id]/files.vue`
- Create: `ui/src/pages/dataset/[id]/thumbnails.vue`
- Create: `ui/src/pages/dataset/[id]/revisions.vue`
- Remove: `ui/src/pages/dataset/[id]/data.vue`

- [ ] **Step 1: Create table.vue**

Reference the current `data.vue` lines 67-71 (dataset-table component) and legacy index.vue lines 180-194 (d-frame table embed). Create a standalone page:

Each new page is a standalone route, so it must set up the dataset store with `provideDatasetStore` (not `useDatasetStore` which is inject-only). Follow the pattern from `data.vue`:

```vue
<template>
  <v-container fluid>
    <dataset-table :height="contentHeight" />
  </v-container>
</template>

<script setup lang="ts">
import { provideDatasetStore } from '~/composables/dataset-store'
import { useDatasetWatch } from '~/composables/dataset-watch'
import { setBreadcrumbs } from '~/utils/breadcrumbs'
const { t } = useI18n()
const route = useRoute()

const store = provideDatasetStore(route.params.id as string, true, true)
useDatasetWatch(store, ['info'])
const { dataset } = store

const { height: windowHeight } = useWindowSize()
const contentHeight = computed(() => windowHeight.value - 120)

watch(dataset, (d) => {
  if (!d) return
  setBreadcrumbs([
    { text: t('datasets'), to: '/datasets' },
    { text: d.title || d.id, to: `/dataset/${d.id}` },
    { text: t('table') }
  ])
}, { immediate: true })
</script>
```

- [ ] **Step 2: Create map.vue, files.vue, thumbnails.vue, revisions.vue**

Follow the same pattern as table.vue but with their respective components (`dataset-map`, `dataset-search-files`, `dataset-thumbnails`, `dataset-history`). Each gets proper breadcrumbs.

- [ ] **Step 3: Replace data.vue with a redirect**

Replace the content of `ui/src/pages/dataset/[id]/data.vue` with a simple redirect to `/table` (to preserve bookmarks):

```vue
<script setup lang="ts">
const route = useRoute()
const router = useRouter()
router.replace(`/dataset/${route.params.id}/table`)
</script>
```

Update any other imports or links pointing to `/data` to point to `/table` instead.

- [ ] **Step 4: Update dataset-actions.vue**

Change the "View data" link from `/dataset/${dataset.id}/data` to `/dataset/${dataset.id}/table`.

- [ ] **Step 5: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

The test that navigates to the data page will need updating.

- [ ] **Step 6: Commit**

```bash
git add ui/src/pages/dataset/[id]/table.vue ui/src/pages/dataset/[id]/map.vue \
  ui/src/pages/dataset/[id]/files.vue ui/src/pages/dataset/[id]/thumbnails.vue \
  ui/src/pages/dataset/[id]/revisions.vue ui/src/components/dataset/dataset-actions.vue
git rm ui/src/pages/dataset/[id]/data.vue
git commit -m "feat: replace /data route with individual /table, /map, /files, /thumbnails, /revisions routes"
```

---

## Task 5: Create "CONSULTER LA DONNEE" section with Applications tab

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`

- [ ] **Step 1: Replace Applications section and add data section**

Remove the standalone "Applications" `layout-section-tabs` section. Create a new "CONSULTER LA DONNEE" section with two tabs:

Tab 1 "Données": Link cards to visualization routes. Each card is a `v-card` with an icon and title, wrapped in a `router-link`:

```vue
<layout-section-tabs
  id="data"
  :title="t('consultData')"
  :tabs="dataTabs"
  :svg="dataSvg"
  v-model="dataTab"
>
  <template #content="{ tab }">
    <v-tabs-window-item value="data">
      <v-row class="pa-4">
        <v-col cols="6" md="4" lg="3">
          <v-card :to="`/dataset/${dataset.id}/table`" variant="outlined">
            <v-card-text class="text-center">
              <v-icon size="48" :icon="mdiTable" />
              <div class="mt-2">{{ t('table') }}</div>
            </v-card-text>
          </v-card>
        </v-col>
        <!-- Similar cards for map (if dataset.bbox && !env.disableRemoteServices), files (if digitalDocument), thumbnails (if image), revisions (if rest.history) -->
      </v-row>
    </v-tabs-window-item>
    <v-tabs-window-item value="applications">
      <!-- Existing applications cards grid, moved from the old applications section -->
    </v-tabs-window-item>
  </template>
</layout-section-tabs>
```

- [ ] **Step 2: Update sections computed**

Remove 'applications' standalone entry. Add 'data' section with condition: `dataset.finalizedAt && !dataset.isMetaOnly && !dataset.draftReason`. Include both 'data' and 'applications' tabs. Also declare `const dataTab = ref('data')` in the script setup.

- [ ] **Step 3: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue
git commit -m "feat: add 'consulter la donnée' section with data links and applications tab"
```

---

## Task 6: Restructure Partage section (add integration, API key tabs)

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`
- Modify: `ui/src/components/common/integration-dialog.vue` (make it work inline, not just as dialog)

- [ ] **Step 1: Add integration as inline tab content**

The current `integration-dialog.vue` is dialog-based. Create an inline rendering mode: extract the content area (mode selector, code textarea, copy button) into a reusable section that can render inside a tab. Either:
- Add a `inline` prop to `integration-dialog.vue` that renders content without the dialog wrapper, OR
- Create a new `integration-content.vue` component with the shared logic

- [ ] **Step 2: Move "Clé d'API en lecture" into Partage tabs**

In `index.vue`, remove the standalone "readApiKey" `layout-section-tabs` section. Add it as a tab in the Partage section.

- [ ] **Step 3: Add "Intégrer dans un site" as a tab in Partage**

Add the inline integration content as a tab in the Partage section.

- [ ] **Step 4: Update tabs array for Partage section**

The Partage section now has 6 tabs:
1. permissions
2. integration
3. readApiKey
4. publicationSites
5. catalogPublications (conditional)
6. relatedDatasets (label: "Voir aussi")

- [ ] **Step 5: Update sections computed**

Remove the standalone 'readApiKey' section entry.

- [ ] **Step 6: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 7: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue ui/src/components/common/integration-dialog.vue
git commit -m "feat: add integration and API key as tabs in Partage section"
```

---

## Task 7: Restructure Activité section (add traçabilité, notifications, webhooks)

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`
- Modify: `ui/src/components/common/notifications-dialog.vue` — extract inline content
- Modify: `ui/src/components/common/webhooks-dialog.vue` — extract inline content
- Remove: `ui/src/pages/dataset/[id]/events.vue`

- [ ] **Step 1: Convert notifications-dialog to support inline rendering**

Similar to integration-dialog: extract the iframe content to render inline in a tab. Reference legacy URL construction:

```javascript
// Notification URL pattern from legacy dataset-actions.vue lines 562-572
const notifUrl = computed(() => {
  // Filter webhooks schema for dataset events (exclude dataset-finalize-end, dataset-dataset-created)
  // Build keys and titles params
  // Return: `${eventsUrl}/embed/subscribe?key=...&title=...&url-template=...&sender=...&register=false`
})
```

Use `d-frame` component (not raw iframe) for consistency with the new UI.

- [ ] **Step 2: Convert webhooks-dialog to support inline rendering**

Same pattern. Reference legacy lines 573-582:

```javascript
// Webhook URL pattern: filter for dataset-data-updated only
// Return: `${eventsUrl}/embed/subscribe-webhooks?key=...&title=...&sender=...`
```

- [ ] **Step 3: Add traçabilité as inline tab**

Move the content from `events.vue` (d-frame embedding traceability) directly into the Activité section as a tab. Reference the actual events.vue implementation (line 31):

```javascript
const traceabilityUrl = computed(() => {
  return `${window.location.origin}/events/embed/traceability?resource=${encodeURIComponent($apiPath + '/datasets/' + dataset.value.id)}`
})
```

**Important:** The URL path is `/events/embed/traceability` (not `/events/embed/events`), and the resource parameter uses `$apiPath + '/datasets/' + dataset.value.id` (not `dataset.value.href`).

- [ ] **Step 4: Update Activité section tabs**

```vue
<layout-section-tabs
  id="activity"
  :title="t('activity')"
  :tabs="activityTabs"
  :svg="settingsSvg"
  svg-no-margin
  v-model="activityTab"
>
  <!-- Tab 1: journal (existing journal-view) -->
  <!-- Tab 2: traceability (d-frame) -->
  <!-- Tab 3: notifications (d-frame, conditional on eventsIntegration) -->
  <!-- Tab 4: webhooks (d-frame, conditional on eventsIntegration + admin) -->
</layout-section-tabs>
```

Also declare `const activityTab = ref('journal')` in the script setup.
```

- [ ] **Step 5: Remove events.vue page**

Delete `ui/src/pages/dataset/[id]/events.vue`.

- [ ] **Step 6: Review notifications and webhooks against legacy for feature parity**

Compare the URL construction and parameters with legacy `dataset-actions.vue` lines 556-582. Ensure:
- Correct event key filtering from `webhooksSchema`
- Proper sender format with department support
- All query parameters match (key, title, url-template, sender, register)

- [ ] **Step 7: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 8: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue ui/src/components/common/notifications-dialog.vue \
  ui/src/components/common/webhooks-dialog.vue
git rm ui/src/pages/dataset/[id]/events.vue
git commit -m "feat: add traçabilité, notifications, webhooks as tabs in Activité section"
```

---

## Task 8: Clean up actions menu

**Files:**
- Modify: `ui/src/components/dataset/dataset-actions.vue`
- Modify: `ui/src/pages/dataset/[id]/edit-metadata.vue`

- [ ] **Step 1: Remove items from main page actions menu**

In `dataset-actions.vue`, remove:
- Integration dialog (lines 125-141)
- Notifications dialog (lines 143-159)
- Webhooks dialog (lines 161-177)
- Events/traceability link (lines 179-190)
- View data link (lines 86-97) — replaced by "Consulter la donnée" section
- REST upload actions (lines 55-69) — "Charger plusieurs lignes" only in edit-data

Also remove the corresponding imports and refs for these components.

- [ ] **Step 2: Remove NAVIGATION section from edit-metadata right sidebar**

In `edit-metadata.vue`, find the NAVIGATION section in the right sidebar (lines 147-170 approximately) that contains "Back to home" and "View data" links. Remove it entirely.

- [ ] **Step 3: Verify breadcrumbs on all sub-pages**

Check that all dataset sub-pages have proper breadcrumbs (`Datasets > {title} > {page name}`):
- `/table`, `/map`, `/files`, `/thumbnails`, `/revisions` (added in Task 4)
- `/edit-metadata` — verify existing breadcrumbs
- `/edit-data` — verify existing breadcrumbs
- `/api-doc` — verify existing breadcrumbs

Add missing breadcrumbs where needed.

- [ ] **Step 4: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/dataset-actions.vue ui/src/pages/dataset/[id]/edit-metadata.vue
git commit -m "feat: clean up actions menu, remove navigation section from edit-metadata"
```

---

## Task 9: Implement draft mode reduced content

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`
- Modify: `ui/src/components/dataset/dataset-actions.vue`

- [ ] **Step 1: Hide sections in draft mode**

In `index.vue`, update the `sections` computed to hide these sections when `dataset.draftReason`:
- "Consulter la donnée" section (data + applications)
- "Partage" section
- "Activité" section

The Schema section must remain visible in draft mode — relax the `d.finalizedAt` guard if present.

```typescript
// In sections computed:
if (d.finalizedAt || d.draftReason) {
  // Show schema section
}
if (d.finalizedAt && !d.draftReason) {
  // Show data, partage, activité sections
}
```

- [ ] **Step 2: Hide "Edit metadata" link in draft mode**

In `dataset-actions.vue`, AND the draft condition with the existing permission check on the edit metadata action link: `v-if="can('writeDescription').value && !dataset.draftReason"`.

- [ ] **Step 3: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue ui/src/components/dataset/dataset-actions.vue
git commit -m "feat: reduce visible content in draft mode"
```

---

## Task 10: Fix "Valider le brouillon"

**Files:**
- Modify: `ui/src/components/dataset/dataset-status.vue`

- [ ] **Step 1: Debug the broken validation flow**

Read `dataset-status.vue` and trace the `validateDraft` method (lines 217-220). It POSTs to the `/draft` endpoint. Check:
- Is the URL correct? (`${dataset.href}/draft`)
- Is the HTTP method correct? (POST vs PATCH)
- Is `useDatasetFetch` or `patchDataset` being called correctly?
- Compare with legacy `dataset-status.vue` which uses `this.$axios.$post(this.resourceUrl + '/draft')`

Fix the identified issue.

- [ ] **Step 2: Right-align the action buttons**

Find the action buttons (Cancel Draft, Validate Draft) around lines 125-145. They are currently centered. Wrap them in a flex container with `justify-end`:

```vue
<div class="d-flex justify-end ga-2 mt-4">
  <v-btn v-if="..." @click="cancelDraft">{{ t('cancelDraft') }}</v-btn>
  <v-btn v-if="..." @click="validateDraft" color="primary">{{ t('validateDraft') }}</v-btn>
</div>
```

- [ ] **Step 3: Test manually**

Create a draft dataset and verify:
- The buttons appear right-aligned
- "Valider le brouillon" successfully validates the draft
- "Annuler le brouillon" successfully cancels

- [ ] **Step 4: Run e2e tests**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 5: Commit**

```bash
git add ui/src/components/dataset/dataset-status.vue
git commit -m "fix: fix draft validation flow and right-align action buttons"
```

---

## Task 11: Split edit-metadata into Informations + Metadata tabs

**Files:**
- Create: `ui/src/components/dataset/dataset-metadata-form.vue`
- Modify: `ui/src/components/dataset/dataset-info.vue`
- Modify: `ui/src/pages/dataset/[id]/edit-metadata.vue`

- [ ] **Step 1: Create dataset-metadata-form.vue**

Extract the editable metadata fields from `dataset-info.vue` into a new simple form component. This includes (referencing dataset-info.vue):
- License select (lines 138-149)
- Topics multi-select (lines 151-163)
- Keywords combobox (lines 165-174)
- Origin text field (lines 176-183)
- Image URL text field (lines 185-192)
- Projection (lines 195-203, conditional)
- Creator (lines 205-214, conditional)
- Frequency (lines 216-225, conditional)
- Spatial (lines 227-235, conditional)
- Temporal date picker (lines 237-265, conditional)
- Modified date picker (lines 267-294, conditional)
- Attachments as image checkbox (lines 296-303, conditional)
- Custom metadata fields (lines 305-317)

Present as a simple form — no icons, just labels and inputs. Use standard Vuetify form layout (stacked fields).

```vue
<script setup lang="ts">
const dataset = defineModel<any>('dataset', { required: true })
// ... fetch licenses, topics, datasetsMetadata config
</script>
```

- [ ] **Step 2: Simplify dataset-info.vue**

Remove the metadata fields that were extracted to `dataset-metadata-form.vue`. Keep only:
- Title text field
- Summary textarea
- Description markdown editor
- Slug field with edit menu

Remove the right column with readonly info (owner, file info, dates, counts) — this is the `v-col` with `class="order-md-2"` that appears first in the template but renders on the right via CSS ordering. This info is now on the main page via `dataset-metadata-view.vue`.

The component becomes a focused "core info" editor.

- [ ] **Step 3: Add Metadata tab to edit-metadata.vue**

In `edit-metadata.vue`, add a new "Metadata" tab to the info section (or as a separate section). Use `dataset-metadata-form`:

```vue
<layout-section-tabs
  id="metadata"
  :title="t('metadata')"
  :tabs="[{ key: 'metadata', title: t('metadata'), icon: mdiInformation }]"
>
  <dataset-metadata-form v-model:dataset="editFetch.data" />
</layout-section-tabs>
```

- [ ] **Step 4: Update diff detection**

Add `metadataHasDiff` computed that checks the metadata fields (license, topics, keywords, origin, image, spatial, temporal, frequency, creator, etc.) for changes. Also update the existing `infoHasDiff` to only check the fields that remain in the Informations tab (title, summary, description, slug). Move `rest` settings diff detection to whichever tab owns those fields.

- [ ] **Step 5: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/dataset/dataset-metadata-form.vue ui/src/components/dataset/dataset-info.vue \
  ui/src/pages/dataset/[id]/edit-metadata.vue
git commit -m "feat: split edit-metadata into informations and metadata tabs"
```

---

## Task 12: Add confirmation dialog with AI summary on save

**Files:**
- Create: `ui/src/components/dataset/dataset-save-dialog.vue`
- Modify: `ui/src/pages/dataset/[id]/edit-metadata.vue`

- [ ] **Step 1: Create dataset-save-dialog.vue**

Create a confirmation dialog component:

```vue
<template>
  <v-dialog v-model="showDialog" max-width="600">
    <v-card>
      <v-card-title>{{ t('confirmSave') }}</v-card-title>
      <v-card-text>
        <p>{{ t('confirmSaveMessage') }}</p>

        <!-- AI Summary section -->
        <v-btn
          v-if="agentsIntegration"
          @click="requestSummary"
          :loading="summaryLoading"
          variant="outlined"
          class="mb-4"
        >
          {{ t('summarizeChanges') }}
        </v-btn>

        <v-alert v-if="summary" type="info" variant="tonal" class="mb-4">
          {{ summary }}
        </v-alert>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn @click="showDialog = false">{{ t('cancel') }}</v-btn>
        <v-btn color="primary" @click="confirmSave">{{ t('save') }}</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>
```

Props:
- `data`: current edited dataset object
- `serverData`: original server dataset object

The `requestSummary` method:
1. Compute stable serialization of both objects (JSON.stringify with sorted keys)
2. Use `diff` npm package (import `{ createPatch } from 'diff'`) to create a text diff
3. POST to agents service `/summary` endpoint with the diff
4. Display returned summary text

- [ ] **Step 2: Install jsdiff dependency if not present**

Check if `diff` (jsdiff) is already a dependency. If not:

```bash
npm install diff -w ui
```

- [ ] **Step 3: Wire up the dialog in edit-metadata.vue**

Replace the direct save button click handler with one that opens the dialog:

```vue
<dataset-save-dialog
  v-model="showSaveDialog"
  :data="editFetch.data"
  :server-data="editFetch.serverData"
  @confirm="editFetch.save.execute()"
/>
```

Change the save button's `@click` from `editFetch.save.execute()` to `showSaveDialog = true`.

- [ ] **Step 4: Add i18n keys**

Add French translations for: confirmSave, confirmSaveMessage, summarizeChanges, save, cancel.

- [ ] **Step 5: Run e2e tests and heal**

Run: `npx playwright test tests/features/ui/dataset-pages.e2e.spec.ts`

- [ ] **Step 6: Commit**

```bash
git add ui/src/components/dataset/dataset-save-dialog.vue ui/src/pages/dataset/[id]/edit-metadata.vue \
  package.json package-lock.json
git commit -m "feat: add confirmation dialog with optional AI summary on metadata save"
```

---

## Task 13: Write new e2e tests

**Files:**
- Create: `tests/features/ui/dataset-restructuring.e2e.spec.ts`

- [ ] **Step 1: Write draft mode test**

```typescript
test('draft mode shows reduced content', async ({ page, goToWithAuth }) => {
  // Create a dataset in draft mode (upload but don't validate)
  // Navigate to dataset page
  // Assert: metadata-view is visible
  // Assert: schema section is visible
  // Assert: "consulter la donnée" section is NOT visible
  // Assert: "partage" section is NOT visible
  // Assert: "activité" section is NOT visible
  // Assert: "Edit metadata" link is NOT in actions menu
})
```

- [ ] **Step 2: Write data visualization routes test**

```typescript
test('data visualization routes load correctly', async ({ page, goToWithAuth }) => {
  // Create and finalize a dataset
  // Navigate to /dataset/{id}/table
  // Assert: page loads, breadcrumbs show "Datasets > {title} > Table"
  // Assert: table component is visible
})
```

- [ ] **Step 3: Write confirmation dialog test**

```typescript
test('save in edit-metadata shows confirmation dialog', async ({ page, goToWithAuth }) => {
  // Navigate to edit-metadata
  // Make a change (e.g., edit title)
  // Click save button
  // Assert: confirmation dialog appears
  // Assert: dialog has Cancel and Save buttons
  // Click Save in dialog
  // Assert: changes are saved (verify via API)
})
```

- [ ] **Step 4: Write Partage section tabs test**

```typescript
test('Partage section has integration and API key tabs', async ({ page, goToWithAuth }) => {
  // Navigate to finalized dataset
  // Scroll to Partage section
  // Assert: "Permissions" tab visible
  // Assert: "Intégrer dans un site" tab visible
  // Assert: "Clé d'API en lecture" tab visible
  // Click "Intégrer dans un site" tab
  // Assert: integration content is visible (mode selector, code area)
})
```

- [ ] **Step 5: Write Activité section tabs test**

```typescript
test('Activité section has journal, traçabilité, notifications tabs', async ({ page, goToWithAuth }) => {
  // Navigate to finalized dataset
  // Scroll to Activité section
  // Assert: "Journal" tab visible
  // Assert: "Traçabilité" tab visible
  // Click "Traçabilité" tab
  // Assert: d-frame is visible
})
```

- [ ] **Step 6: Write actions menu cleanup test**

```typescript
test('actions menu does not contain moved items', async ({ page, goToWithAuth }) => {
  // Navigate to finalized dataset
  // Open actions menu
  // Assert: "Edit metadata" link IS visible
  // Assert: "Integration" link is NOT visible
  // Assert: "Notifications" link is NOT visible
  // Assert: "Webhooks" link is NOT visible
  // Assert: "Events" link is NOT visible
})
```

- [ ] **Step 7: Run all new tests**

Run: `npx playwright test tests/features/ui/dataset-restructuring.e2e.spec.ts`

Fix any failures.

- [ ] **Step 8: Commit**

```bash
git add tests/features/ui/dataset-restructuring.e2e.spec.ts
git commit -m "test: add e2e tests for dataset page restructuring"
```

---

## Task 14: Final e2e test pass and cleanup

**Files:**
- Modify: `tests/features/ui/dataset-pages.e2e.spec.ts` (heal remaining failures)

- [ ] **Step 1: Run full e2e test suite**

Run: `npx playwright test tests/features/ui/`

- [ ] **Step 2: Fix any remaining test failures**

Use playwright-healer agent for any remaining breakage in existing tests.

- [ ] **Step 3: Run lint**

Run: `npm run lint`

Fix any lint errors.

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "fix: heal remaining e2e tests after dataset page restructuring"
```
