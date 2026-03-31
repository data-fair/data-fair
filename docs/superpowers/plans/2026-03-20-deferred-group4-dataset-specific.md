# Group 4 — Dataset-Specific Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the new-dataset creation page with all 4 dataset types (file, REST, virtual, metadata-only), add init-from and conflict detection sub-components, add read API key section, and wire revisions into home page.

**Architecture:** The new-dataset page is a `v-stepper` with dynamic steps based on selected type. Sub-components `dataset-init-from.vue` and `dataset-conflicts.vue` are reusable. Read API key uses VJSF v4 form. Revisions is just wiring existing component.

**Tech Stack:** Vue 3, Vuetify 4, VJSF v4 (`@koumoul/vjsf`), `@data-fair/lib-vuetify` (owner-pick)

**Spec:** `docs/superpowers/specs/2026-03-20-deferred-features-design.md` — Group 4

---

### Task 1: Dataset Init-From Component

**Files:**
- Create: `ui/src/components/dataset/dataset-init-from.vue`

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-init-from.vue`

- [ ] **Step 1: Create dataset-init-from.vue**

Component allowing user to select an existing dataset as template and choose which parts to copy.

```vue
<template>
  <div>
    <p class="text-body-2 mb-4">
      {{ t('initFromDesc') }}
    </p>

    <v-autocomplete
      v-model="selectedDataset"
      :items="datasets"
      :loading="searching"
      :label="t('selectDataset')"
      item-title="title"
      item-value="id"
      return-object
      variant="outlined"
      density="compact"
      clearable
      @update:search="onSearch"
    />

    <template v-if="selectedDataset">
      <p class="text-body-2 mt-4 mb-2">
        {{ t('selectParts') }}
      </p>
      <v-checkbox
        v-model="parts"
        value="schema"
        :label="t('partSchema')"
        density="compact"
        hide-details
        :disabled="parts.includes('data')"
      />
      <v-checkbox
        v-if="selectedDataset.status === 'finalized'"
        v-model="parts"
        value="data"
        :label="t('partData')"
        density="compact"
        hide-details
        @update:model-value="onDataToggle"
      />
      <v-checkbox
        v-model="parts"
        value="description"
        :label="t('partDescription')"
        density="compact"
        hide-details
      />
      <v-checkbox
        v-model="parts"
        value="metadataAttachments"
        :label="t('partAttachments')"
        density="compact"
        hide-details
      />
      <v-checkbox
        v-if="selectedDataset.extensions?.length"
        v-model="parts"
        value="extensions"
        :label="t('partExtensions')"
        density="compact"
        hide-details
      />
    </template>
  </div>
</template>

<i18n lang="yaml">
fr:
  initFromDesc: Vous pouvez initialiser ce jeu de données à partir d'un jeu de données existant.
  selectDataset: Rechercher un jeu de données
  selectParts: Éléments à copier
  partSchema: Schéma (colonnes)
  partData: Données
  partDescription: Description
  partAttachments: Pièces jointes
  partExtensions: Extensions
en:
  initFromDesc: You can initialize this dataset from an existing dataset.
  selectDataset: Search for a dataset
  selectParts: Parts to copy
  partSchema: Schema (columns)
  partData: Data
  partDescription: Description
  partAttachments: Attachments
  partExtensions: Extensions
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  owner?: { type: string, id: string, department?: string }
}>()

const model = defineModel<{ dataset: string, parts: string[] } | null>()

const { t } = useI18n()
const { $fetch } = useNuxtApp()

const selectedDataset = ref<any>(null)
const datasets = ref<any[]>([])
const searching = ref(false)
const parts = ref<string[]>(['schema'])

let searchTimeout: ReturnType<typeof setTimeout>

const onSearch = (q: string) => {
  clearTimeout(searchTimeout)
  if (!q || q.length < 2) return
  searchTimeout = setTimeout(async () => {
    searching.value = true
    try {
      const params: Record<string, string> = {
        q,
        size: '20',
        select: 'id,title,status,extensions,schema'
      }
      if (props.owner) {
        params.owner = `${props.owner.type}:${props.owner.id}`
        if (props.owner.department) params.owner += ':' + props.owner.department
      }
      const res = await $fetch('/datasets', { params })
      datasets.value = res.results
    } finally {
      searching.value = false
    }
  }, 300)
}

const onDataToggle = () => {
  // if data is selected, schema must be included
  if (parts.value.includes('data') && !parts.value.includes('schema')) {
    parts.value.push('schema')
  }
}

watch([selectedDataset, parts], () => {
  if (selectedDataset.value) {
    model.value = { dataset: selectedDataset.value.id, parts: parts.value }
  } else {
    model.value = null
  }
}, { deep: true })
</script>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/dataset/dataset-init-from.vue
git commit -m "feat: add dataset-init-from component for template initialization"
```

---

### Task 2: Dataset Conflicts Component

**Files:**
- Create: `ui/src/components/dataset/dataset-conflicts.vue`

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-conflicts.vue`

- [ ] **Step 1: Create dataset-conflicts.vue**

```vue
<template>
  <div v-if="conflicts.length">
    <v-alert
      type="warning"
      variant="outlined"
      class="mb-4"
    >
      <p>{{ t('conflictsWarning') }}</p>
      <v-list
        density="compact"
        bg-color="transparent"
      >
        <v-list-item
          v-for="c in conflicts"
          :key="c.id"
          :to="`/dataset/${c.id}`"
          target="_blank"
        >
          <v-list-item-title>{{ c.title }}</v-list-item-title>
        </v-list-item>
      </v-list>
      <v-checkbox
        v-model="acknowledged"
        :label="t('acknowledgeConflicts')"
        density="compact"
        hide-details
      />
    </v-alert>
  </div>
</template>

<i18n lang="yaml">
fr:
  conflictsWarning: Des jeux de données existants pourraient entrer en conflit avec celui-ci.
  acknowledgeConflicts: Je comprends et souhaite continuer malgré les conflits
en:
  conflictsWarning: Existing datasets may conflict with this one.
  acknowledgeConflicts: I understand and wish to continue despite conflicts
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  title?: string
  filename?: string
  owner?: { type: string, id: string, department?: string }
}>()

const ok = defineModel<boolean>({ default: true })

const { t } = useI18n()
const { $fetch } = useNuxtApp()

const conflicts = ref<Array<{ id: string, title: string }>>([])
const acknowledged = ref(false)

watch(acknowledged, (val) => {
  ok.value = conflicts.value.length === 0 || val
})

watch(() => [props.title, props.filename, props.owner], async () => {
  conflicts.value = []
  acknowledged.value = false
  ok.value = true

  if (!props.owner) return

  const ownerStr = `${props.owner.type}:${props.owner.id}${props.owner.department ? ':' + props.owner.department : ''}`

  const checks: Promise<any>[] = []
  if (props.title) {
    checks.push($fetch('/datasets', { params: { title: props.title, owner: ownerStr, select: 'id,title', size: '5' } }))
  }
  if (props.filename) {
    checks.push($fetch('/datasets', { params: { filename: props.filename, owner: ownerStr, select: 'id,title', size: '5' } }))
  }

  const results = await Promise.all(checks)
  const seen = new Set<string>()
  for (const res of results) {
    for (const d of res.results || []) {
      if (!seen.has(d.id)) {
        seen.add(d.id)
        conflicts.value.push(d)
      }
    }
  }

  ok.value = conflicts.value.length === 0
}, { immediate: true, deep: true })
</script>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/dataset/dataset-conflicts.vue
git commit -m "feat: add dataset-conflicts component for duplicate detection"
```

---

### Task 3: New Dataset Page Rewrite

**Files:**
- Modify: `ui/src/pages/new-dataset.vue`

**Reference:** Legacy `ui-legacy/public/pages/new-dataset.vue` (1050 lines)

- [ ] **Step 1: Read current new-dataset.vue**

Read `ui/src/pages/new-dataset.vue` to understand the current simplified implementation.

- [ ] **Step 2: Rewrite new-dataset.vue as full stepper**

This is a large rewrite. The page becomes a `v-stepper` with:
- Step 1: Type selection (4 cards)
- Step 2: Init from (optional, skippable) — uses `dataset-init-from.vue`
- Steps 3+: Type-specific parameters
- Final step: Owner selection + conflict detection + create

Key structure:

```vue
<template>
  <v-container>
    <v-stepper
      v-model="currentStep"
      :items="stepItems"
    >
      <!-- Step 1: Type Selection -->
      <template #item.1>
        <v-row class="my-4">
          <v-col
            v-for="type in datasetTypes"
            :key="type.value"
            cols="12"
            sm="6"
            md="3"
          >
            <v-card
              :color="datasetType === type.value ? 'primary' : undefined"
              :variant="datasetType === type.value ? 'elevated' : 'outlined'"
              class="text-center pa-4"
              style="cursor: pointer;"
              @click="datasetType = type.value; currentStep = 2"
            >
              <v-icon
                size="48"
                class="mb-2"
              >
                {{ type.icon }}
              </v-icon>
              <div class="text-h6">
                {{ type.title }}
              </div>
              <div class="text-body-2 text-medium-emphasis">
                {{ type.desc }}
              </div>
            </v-card>
          </v-col>
        </v-row>
      </template>

      <!-- Step 2: Init From (optional) -->
      <template #item.2>
        <dataset-init-from
          v-model="initFrom"
          :owner="owner"
        />
        <v-btn
          variant="text"
          class="mt-4"
          @click="currentStep = 3"
        >
          {{ t('skip') }}
        </v-btn>
      </template>

      <!-- Step 3: Type-specific parameters -->
      <template #item.3>
        <!-- FILE type -->
        <template v-if="datasetType === 'file'">
          <v-file-input
            v-model="file"
            :label="t('selectFile')"
            variant="outlined"
            prepend-icon="mdi-file-upload"
            show-size
          />
          <v-file-input
            v-model="attachmentsFile"
            :label="t('attachmentsZip')"
            variant="outlined"
            prepend-icon="mdi-attachment"
            accept=".zip"
            clearable
          />
          <v-expansion-panels class="mt-2">
            <v-expansion-panel :title="t('advancedOptions')">
              <v-expansion-panel-text>
                <v-select
                  v-if="showEncodingSelect"
                  v-model="encoding"
                  :items="encodingOptions"
                  :label="t('encoding')"
                  variant="outlined"
                  density="compact"
                  clearable
                />
                <v-select
                  v-model="escapeKeyAlgorithm"
                  :items="escapeKeyOptions"
                  :label="t('escapeKey')"
                  variant="outlined"
                  density="compact"
                  clearable
                />
              </v-expansion-panel-text>
            </v-expansion-panel>
          </v-expansion-panels>
        </template>

        <!-- REST type -->
        <template v-if="datasetType === 'rest'">
          <v-text-field
            v-model="title"
            :label="t('title')"
            variant="outlined"
          />
          <v-checkbox
            v-model="restHistory"
            :label="t('restHistory')"
            density="compact"
            hide-details
          />
          <v-checkbox
            v-model="restAttachments"
            :label="t('restAttachments')"
            density="compact"
            hide-details
          />
        </template>

        <!-- VIRTUAL type -->
        <template v-if="datasetType === 'virtual'">
          <v-text-field
            v-model="title"
            :label="t('title')"
            variant="outlined"
            class="mb-4"
          />
          <p class="text-body-2 mb-2">
            {{ t('selectChildren') }}
          </p>
          <v-autocomplete
            v-model="virtualChildren"
            :items="childDatasets"
            :loading="searchingChildren"
            :label="t('childDatasets')"
            item-title="title"
            item-value="id"
            return-object
            multiple
            chips
            closable-chips
            variant="outlined"
            @update:search="onChildSearch"
          />
        </template>

        <!-- META-ONLY type -->
        <template v-if="datasetType === 'metaOnly'">
          <v-text-field
            v-model="title"
            :label="t('title')"
            variant="outlined"
          />
        </template>
      </template>

      <!-- Step 4: Action (owner + conflicts + create) -->
      <template #item.4>
        <owner-pick
          v-model="owner"
          hide-single
        />

        <dataset-conflicts
          v-if="title || file?.[0]?.name"
          v-model="conflictsOk"
          :title="title || file?.[0]?.name"
          :filename="file?.[0]?.name"
          :owner="owner"
          class="mt-4"
        />

        <v-progress-linear
          v-if="creating"
          :model-value="uploadProgress"
          color="primary"
          height="20"
          class="mt-4"
        >
          {{ Math.round(uploadProgress) }}%
        </v-progress-linear>

        <v-alert
          v-if="createError"
          type="error"
          variant="outlined"
          class="mt-4"
        >
          {{ createError }}
        </v-alert>

        <v-btn
          color="primary"
          class="mt-4"
          :loading="creating"
          :disabled="!canCreate"
          @click="create"
        >
          {{ t('create') }}
        </v-btn>
      </template>
    </v-stepper>
  </v-container>
</template>
```

The `<script>` section manages all reactive state for each type and the create logic:
- File: FormData with `dataset`, `attachments`, `body`, `dataset_encoding`, `dataset_normalizeOptions`, `draft=true` for large files
- REST: JSON `{ isRest: true, title, rest: { history, storeUpdatedBy }, attachments }`
- Virtual: JSON `{ isVirtual: true, title, virtual: { children: [...] } }`
- MetaOnly: JSON `{ isMetaOnly: true, title }`

All POST to `POST /api/v1/datasets`.

Include full i18n block with fr/en for all labels.

- [ ] **Step 3: Test manually**

Run: `npm --prefix ui run dev`
- Navigate to new dataset page
- Test each type selection → verify correct form appears
- Test file creation flow end-to-end
- Test REST creation
- Test init-from with an existing dataset
- Test conflict detection with duplicate title

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/new-dataset.vue
git commit -m "feat: rewrite new-dataset page with all 4 types, init-from, and conflict detection"
```

---

### Task 4: Read API Key Component

**Files:**
- Create: `ui/src/components/dataset/dataset-read-api-key.vue`
- Modify: `ui/src/pages/dataset/[id]/index.vue`

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-read-api-key.vue`

- [ ] **Step 1: Check legacy read-api-key schema source**

```bash
grep -r "readApiKey\|read-api-key\|read_api_key" ui-legacy/public/ --include="*.vue" -l
grep -r "readApiKey" api/src/ --include="*.ts" --include="*.js" -l
```

Determine how the VJSF schema is obtained and what the API endpoint returns.

- [ ] **Step 2: Create dataset-read-api-key.vue**

```vue
<template>
  <v-card
    v-if="dataset"
    variant="outlined"
  >
    <v-card-title>{{ t('readApiKey') }}</v-card-title>
    <v-card-text>
      <lazy-v-jsf
        v-if="schema"
        v-model="config"
        :schema="schema"
        @change="save"
      />
      <template v-if="apiKey">
        <v-divider class="my-4" />
        <p class="text-body-2">
          <strong>{{ t('currentKey') }}:</strong> {{ apiKey.key }}
        </p>
        <p
          v-if="apiKey.expiresAt"
          class="text-body-2"
        >
          <strong>{{ t('expiresAt') }}:</strong> {{ formatDate(apiKey.expiresAt) }}
        </p>
        <p class="text-body-2 text-medium-emphasis">
          {{ t('exampleUrl') }}: <code>{{ exampleUrl }}</code>
        </p>
      </template>
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  readApiKey: Clé d'API en lecture
  currentKey: Clé actuelle
  expiresAt: Expire le
  exampleUrl: Exemple d'URL
en:
  readApiKey: Read API key
  currentKey: Current key
  expiresAt: Expires at
  exampleUrl: Example URL
</i18n>

<script lang="ts" setup>
import useDatasetStore from '~/composables/dataset-store'

const { t } = useI18n()
const { dataset, resourceUrl } = useDatasetStore()
const { $fetch } = useNuxtApp()

const config = ref<any>({})
const apiKey = ref<any>(null)
const schema = ref<any>(null)

// Fetch schema and current key on mount
onMounted(async () => {
  try {
    // Fetch the readApiKey config schema from the dataset's schema endpoint
    // or use a hardcoded schema based on legacy patterns
    schema.value = {
      type: 'object',
      properties: {
        active: { type: 'boolean', title: t('readApiKey') + ' active' },
        interval: {
          type: 'string',
          title: 'Interval',
          enum: ['1 hour', '1 day', '1 week', '1 month'],
          default: '1 day'
        }
      }
    }

    const res = await $fetch(`${resourceUrl.value}/read-api-key`)
    if (res) {
      apiKey.value = res
      config.value = { active: res.active, interval: res.interval }
    }
  } catch (e) {
    // read-api-key may not exist yet — that's OK
  }
})

const save = async () => {
  await $fetch(`${resourceUrl.value}/read-api-key`, {
    method: 'PATCH',
    body: config.value
  })
  // Refresh key
  apiKey.value = await $fetch(`${resourceUrl.value}/read-api-key`)
}

const exampleUrl = computed(() => {
  if (!apiKey.value?.key || !resourceUrl.value) return ''
  return `${window.location.origin}${resourceUrl.value}/lines?apiKey=${apiKey.value.key}`
})

const formatDate = (date: string) => new Date(date).toLocaleDateString()
</script>
```

**Note:** The schema above is a placeholder. During implementation, check the actual readApiKey schema from the API. The legacy code imports it from `api/types/dataset/schema` — in the new architecture, either import from `#api/types` alias or hardcode the minimal schema.

- [ ] **Step 3: Wire into dataset home page**

Add to `ui/src/pages/dataset/[id]/index.vue` as a new section, gated by `can('getReadApiKey')`:

```vue
<dataset-read-api-key v-if="can('getReadApiKey').value" />
```

Add the section after existing sections (e.g., after permissions/publication-sites section).

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/dataset/dataset-read-api-key.vue ui/src/pages/dataset/[id]/index.vue
git commit -m "feat: add read API key section to dataset home page"
```

---

### Task 5: Wire Revisions into Home Page

**Files:**
- Modify: `ui/src/pages/dataset/[id]/index.vue`

- [ ] **Step 1: Check existing dataset-edit-history.vue**

Read `ui/src/components/dataset/dataset-edit-history.vue` to understand its API.

- [ ] **Step 2: Add to home page**

Add as a section for REST datasets with history enabled:

```vue
<dataset-edit-history v-if="dataset.isRest && dataset.rest?.history" />
```

Place it in the appropriate section of the layout (near the bottom, before journal/activity).

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/dataset/[id]/index.vue
git commit -m "feat: wire dataset edit history into home page for REST datasets"
```
