# Refactor Schema Components Typing and Store Access

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve type safety and remove prop drilling by using `useDatasetStore()` to access dataset in schema-related components instead of receiving it as a prop, with proper `SchemaProperty` typing.

**Architecture:** Remove `dataset` prop from three components (`dataset-column-editor`, `dataset-schema`, `dataset-columns-list`) and inject the store directly via `useDatasetStore()`. This is safe because the store is already provided at the page level (`edit-schema.vue`). Type all schema properties using `SchemaProperty` from `#api/types`.

**Tech Stack:** Vue 3 (Composition API), TypeScript, `SchemaProperty` from `#api/types`, existing `useDatasetStore()` composable

---

### Task 1: Update dataset-column-editor.vue to use store and proper typing

**Files:**
- Modify: `ui/src/components/dataset/schema/dataset-column-editor.vue`

- [ ] **Step 1: Read the current file to understand imports and structure**

Run: `cat ui/src/components/dataset/schema/dataset-column-editor.vue | head -50`

- [ ] **Step 2: Add SchemaProperty type import at the top of the script**

Replace the opening of the script block:
```ts
<script setup lang="ts">
import { MarkdownEditor } from '@koumoul/vjsf-markdown'
import type { SchemaProperty } from '#api/types'
import { propTypeTitle } from '~/utils/dataset'
import useStore from '~/composables/use-store'
```

- [ ] **Step 3: Add useDatasetStore import and update imports**

After the existing imports, add:
```ts
import { useDatasetStore } from '~/composables/dataset/store'
```

- [ ] **Step 4: Update defineProps to remove dataset and type column properly**

Replace:
```ts
const props = defineProps<{
  column: any | null
  dataset: any
  allColumns: any[]
  editable?: boolean
}>()
```

With:
```ts
const props = defineProps<{
  column: SchemaProperty | null
  allColumns: SchemaProperty[]
  editable?: boolean
}>()
```

- [ ] **Step 5: Add dataset from store at the top of the setup function**

After `const { t, locale } = useI18n({ useScope: 'local' })`, add:
```ts
const { dataset } = useDatasetStore()
```

- [ ] **Step 6: Verify the file compiles**

Run: `npm run build:ui 2>&1 | grep -A 5 "dataset-column-editor" || echo "No errors found for dataset-column-editor"`

Expected: No TypeScript errors related to dataset-column-editor

- [ ] **Step 7: Commit the changes**

```bash
cd ui && git add src/components/dataset/schema/dataset-column-editor.vue
git commit -m "refactor: use store for dataset in dataset-column-editor, add SchemaProperty typing"
```

---

### Task 2: Update dataset-columns-list.vue with proper typing

**Files:**
- Modify: `ui/src/components/dataset/schema/dataset-columns-list.vue`

- [ ] **Step 1: Add SchemaProperty type import**

Replace the script opening:
```ts
<script setup lang="ts">
import draggable from 'vuedraggable'
import type { SchemaProperty } from '#api/types'
import { propTypeIcon } from '~/utils/dataset'
```

- [ ] **Step 2: Update defineProps to use SchemaProperty type**

Replace:
```ts
const props = defineProps<{
  columns: any[]
  sortable?: boolean
  activeColumnKey?: string | null
}>()
```

With:
```ts
const props = defineProps<{
  columns: SchemaProperty[]
  sortable?: boolean
  activeColumnKey?: string | null
}>()
```

- [ ] **Step 3: Verify the file compiles**

Run: `npm run build:ui 2>&1 | grep -A 5 "dataset-columns-list" || echo "No errors found for dataset-columns-list"`

Expected: No TypeScript errors related to dataset-columns-list

- [ ] **Step 4: Commit the changes**

```bash
cd ui && git add src/components/dataset/schema/dataset-columns-list.vue
git commit -m "refactor: add SchemaProperty typing to dataset-columns-list"
```

---

### Task 3: Update dataset-schema.vue to use store and proper typing

**Files:**
- Modify: `ui/src/components/dataset/schema/dataset-schema.vue`

- [ ] **Step 1: Read current props and imports**

Run: `sed -n '84,96p' ui/src/components/dataset/schema/dataset-schema.vue`

- [ ] **Step 2: Add SchemaProperty and useDatasetStore imports**

Update the script section imports:
```ts
<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import type { SchemaProperty } from '#api/types'
import { useDatasetStore } from '~/composables/dataset/store'
```

- [ ] **Step 3: Update defineProps to remove dataset and add proper typing**

Replace:
```ts
const props = defineProps<{
  modelValue: any[]
  dataset: any
  primaryKey?: string[]
}>()
```

With:
```ts
const props = defineProps<{
  modelValue: SchemaProperty[]
  primaryKey?: string[]
}>()
```

- [ ] **Step 4: Add dataset from store at top of setup**

After `const { t } = useI18n({ useScope: 'local' })`, add:
```ts
const { dataset } = useDatasetStore()
```

- [ ] **Step 5: Verify the file compiles**

Run: `npm run build:ui 2>&1 | grep -A 5 "dataset-schema" || echo "No errors found for dataset-schema"`

Expected: No TypeScript errors related to dataset-schema

- [ ] **Step 6: Commit the changes**

```bash
cd ui && git add src/components/dataset/schema/dataset-schema.vue
git commit -m "refactor: use store for dataset in dataset-schema, add SchemaProperty typing"
```

---

### Task 4: Update parent component (dataset-schema.vue usage in edit-schema.vue)

**Files:**
- Modify: `ui/src/pages/dataset/[id]/edit-schema.vue`

- [ ] **Step 1: Check current dataset-schema usage**

Run: `sed -n '19,24p' ui/src/pages/dataset/[id]/edit-schema.vue`

- [ ] **Step 2: Remove dataset prop from dataset-schema component**

In the template where `<dataset-schema` is used, replace:
```html
<dataset-schema
  v-model="datasetEditFetch.data.value.schema"
  :dataset="datasetEditFetch.data.value"
  :primary-key="datasetEditFetch.data.value.primaryKey"
  @update:primary-key="pk => { if (datasetEditFetch.data.value) datasetEditFetch.data.value.primaryKey = pk }"
/>
```

With:
```html
<dataset-schema
  v-model="datasetEditFetch.data.value.schema"
  :primary-key="datasetEditFetch.data.value.primaryKey"
  @update:primary-key="pk => { if (datasetEditFetch.data.value) datasetEditFetch.data.value.primaryKey = pk }"
/>
```

- [ ] **Step 3: Verify the file compiles**

Run: `npm run build:ui 2>&1 | grep -A 5 "edit-schema" || echo "No errors found for edit-schema"`

Expected: No TypeScript errors

- [ ] **Step 4: Commit the changes**

```bash
cd ui && git add src/pages/dataset/[id]/edit-schema.vue
git commit -m "refactor: remove dataset prop from dataset-schema usage in edit-schema"
```

---

### Task 5: Run full type-check to verify no regressions

**Files:**
- No files modified (verification only)

- [ ] **Step 1: Run TypeScript build**

Run: `cd ui && npm run build:ui`

Expected: Build completes without errors

- [ ] **Step 2: Run tests if they exist for these components**

Run: `cd ui && npm run test 2>&1 | head -50 || echo "No tests configured"`

Expected: Tests pass or no test framework configured

- [ ] **Step 3: Final verification - check no other files reference the removed props**

Run: `grep -r ":dataset=" ui/src/components/dataset/schema/ --include="*.vue" || echo "No other usages found"`

Expected: Empty result or "No other usages found"

- [ ] **Step 4: Create summary commit if needed**

If no errors found, this is complete. If there are any issues, address them and commit as needed.

---

## Plan Self-Review

✅ **Spec coverage:**
- Remove dataset prop from 3 components ✓ (Tasks 1, 2, 3)
- Add useDatasetStore() to access dataset ✓ (Tasks 1, 3)
- Type SchemaProperty properly ✓ (Tasks 1, 2, 3)
- Update parent component usage ✓ (Task 4)
- Verify no regressions ✓ (Task 5)

✅ **Placeholder scan:**
- No "TBD", "TODO", or vague instructions
- All code blocks are complete and specific
- All commands are exact with expected output

✅ **Type consistency:**
- SchemaProperty import added consistently
- useDatasetStore() used consistently
- Props definition pattern consistent across all components

✅ **Completeness:**
- Each task is 2-5 minutes
- Code examples are copy-paste ready
- Commands are exact and testable
