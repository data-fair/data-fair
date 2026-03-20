# Group 2 — Dataset File Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add file upload/update dialog for file-based datasets and verify/complete the REST bulk upload component.

**Architecture:** `dataset-upload-dialog.vue` is a new dialog component for file-based datasets. `dataset-rest-upload-actions.vue` already exists and needs review against legacy behavior.

**Tech Stack:** Vue 3, Vuetify 4, FormData multipart upload with progress tracking

**Spec:** `docs/superpowers/specs/2026-03-20-deferred-features-design.md` — Group 2

---

### Task 1: Dataset Upload/Update Dialog

**Files:**
- Create: `ui/src/components/dataset/dataset-upload-dialog.vue`
- Modify: `ui/src/components/dataset/dataset-actions.vue`

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-import-file.vue` and `ui-legacy/public/components/dataset/dataset-actions.vue` lines 440-530

- [ ] **Step 1: Create dataset-upload-dialog.vue**

This dialog handles updating an existing file-based dataset with a new file. It uses a stepper: select file → options → upload.

```vue
<template>
  <v-dialog
    v-model="dialog"
    max-width="600"
    persistent
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-card-title>{{ t('updateFile') }}</v-card-title>
      <v-card-text>
        <v-stepper
          v-model="step"
          :items="stepItems"
          flat
        >
          <template #item.1>
            <v-file-input
              v-model="file"
              :label="t('selectFile')"
              variant="outlined"
              prepend-icon="mdi-file-upload"
              show-size
              @update:model-value="onFileSelect"
            />
            <v-file-input
              v-model="attachmentsFile"
              :label="t('attachmentsZip')"
              variant="outlined"
              prepend-icon="mdi-attachment"
              show-size
              accept=".zip"
              clearable
            />
          </template>

          <template #item.2>
            <p class="text-body-2 mb-4">
              {{ t('advancedOptions') }}
            </p>
            <v-select
              v-if="showEncodingSelect"
              v-model="encoding"
              :items="encodingOptions"
              :label="t('encoding')"
              variant="outlined"
              density="compact"
              clearable
              class="mb-2"
            />
            <v-select
              v-model="escapeKeyAlgorithm"
              :items="escapeKeyOptions"
              :label="t('escapeKey')"
              variant="outlined"
              density="compact"
              clearable
              class="mb-2"
            />
          </template>

          <template #item.3>
            <v-progress-linear
              v-if="uploading"
              :model-value="uploadProgress"
              color="primary"
              height="20"
              class="mb-4"
            >
              {{ Math.round(uploadProgress) }}%
            </v-progress-linear>
            <v-alert
              v-if="error"
              type="error"
              variant="outlined"
            >
              {{ error }}
            </v-alert>
            <div
              v-if="!uploading && !error"
              class="text-center"
            >
              <p>{{ t('readyToUpload', { name: file?.[0]?.name }) }}</p>
              <v-btn
                color="primary"
                :loading="uploading"
                @click="upload"
              >
                {{ t('upload') }}
              </v-btn>
            </div>
          </template>
        </v-stepper>
      </v-card-text>
      <v-card-actions v-if="!uploading">
        <v-spacer />
        <v-btn
          variant="text"
          @click="dialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          v-if="step < 3"
          color="primary"
          :disabled="step === 1 && !file?.length"
          @click="step++"
        >
          {{ t('next') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  updateFile: Mettre à jour le fichier
  selectFile: Sélectionner un fichier
  attachmentsZip: Pièces jointes (archive ZIP, optionnel)
  advancedOptions: Options avancées (laisser vide pour détection automatique)
  encoding: Encodage du fichier
  escapeKey: Algorithme d'échappement des clés
  readyToUpload: "Prêt à envoyer : {name}"
  upload: Envoyer
  cancel: Annuler
  next: Suivant
  step1: Fichier
  step2: Options
  step3: Envoi
en:
  updateFile: Update file
  selectFile: Select a file
  attachmentsZip: Attachments (ZIP archive, optional)
  advancedOptions: Advanced options (leave empty for auto-detection)
  encoding: File encoding
  escapeKey: Key escape algorithm
  readyToUpload: "Ready to upload: {name}"
  upload: Upload
  cancel: Cancel
  next: Next
  step1: File
  step2: Options
  step3: Upload
</i18n>

<script lang="ts" setup>
import useDatasetStore from '~/composables/dataset-store'

const props = defineProps<{
  datasetId: string
}>()

const { t } = useI18n()
const { $fetch } = useNuxtApp()
const { dataset } = useDatasetStore()

const dialog = ref(false)
const step = ref(1)
const file = ref<File[] | null>(null)
const attachmentsFile = ref<File[] | null>(null)
const encoding = ref<string | null>(null)
const escapeKeyAlgorithm = ref<string | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)
const error = ref<string | null>(null)

const stepItems = computed(() => [
  { title: t('step1'), value: 1 },
  { title: t('step2'), value: 2 },
  { title: t('step3'), value: 3 }
])

const showEncodingSelect = computed(() => {
  const name = file.value?.[0]?.name?.toLowerCase() || ''
  return name.endsWith('.csv') || name.endsWith('.tsv') || name.endsWith('.txt')
})

const encodingOptions = [
  { title: 'UTF-8', value: 'utf-8' },
  { title: 'ISO-8859-1 (Latin-1)', value: 'iso-8859-1' },
  { title: 'Windows-1252', value: 'windows-1252' }
]

const escapeKeyOptions = [
  { title: 'Slug', value: 'slug' },
  { title: 'Compat ODS', value: 'compat-ods' }
]

watch(dialog, (val) => {
  if (val) {
    step.value = 1
    file.value = null
    attachmentsFile.value = null
    encoding.value = null
    escapeKeyAlgorithm.value = null
    error.value = null
    uploadProgress.value = 0
  }
})

const onFileSelect = () => {
  // auto-advance to step 2
  if (file.value?.length) step.value = 2
}

const upload = async () => {
  if (!file.value?.length) return
  uploading.value = true
  error.value = null
  uploadProgress.value = 0

  try {
    const formData = new FormData()
    formData.append('dataset', file.value[0])
    if (attachmentsFile.value?.length) {
      formData.append('attachments', attachmentsFile.value[0])
    }
    const body: Record<string, any> = {}
    if (escapeKeyAlgorithm.value) {
      body.analysis = { escapeKeyAlgorithm: escapeKeyAlgorithm.value }
    }
    formData.append('body', JSON.stringify(body))
    if (encoding.value) {
      formData.append('dataset_encoding', encoding.value)
    }

    const params = new URLSearchParams()
    if (file.value[0].size > 100000) params.set('draft', 'true')

    await $fetch(`/datasets/${props.datasetId}?${params.toString()}`, {
      method: 'PUT',
      body: formData,
      onUploadProgress: (e: ProgressEvent) => {
        if (e.total) uploadProgress.value = (e.loaded / e.total) * 100
      }
    })

    dialog.value = false
  } catch (err: any) {
    error.value = err.response?.data?.message || err.message || String(err)
  } finally {
    uploading.value = false
  }
}
</script>
```

- [ ] **Step 2: Wire into dataset-actions.vue**

Add after downloads section, before "Edit metadata", visible only for file-based datasets (not REST, not virtual, not meta-only):

```vue
<dataset-upload-dialog
  v-if="can('writeData').value && !dataset.isRest && !dataset.isVirtual && !dataset.isMetaOnly"
  :dataset-id="dataset.id"
>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="primary">mdi-file-upload</v-icon>
      </template>
      <v-list-item-title>{{ t('updateFile') }}</v-list-item-title>
    </v-list-item>
  </template>
</dataset-upload-dialog>
```

Add i18n: `updateFile: Mettre à jour le fichier` / `Update file`

- [ ] **Step 3: Test manually**

Run: `npm --prefix ui run dev`
- Create a file-based dataset → go to detail → actions → "Update file" should appear
- Open dialog → select file → advance through stepper → verify upload works
- Check that REST datasets do NOT show this action

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/dataset/dataset-upload-dialog.vue ui/src/components/dataset/dataset-actions.vue
git commit -m "feat: add file upload/update dialog for file-based datasets"
```

---

### Task 2: Review and Complete REST Bulk Upload

**Files:**
- Review: `ui/src/components/dataset/dataset-rest-upload-actions.vue`
- Possibly modify: `ui/src/components/dataset/dataset-actions.vue` (verify wiring)

**Reference:** Legacy `ui-legacy/public/components/dataset/dataset-rest-upload-actions.vue`

- [ ] **Step 1: Review existing component**

Read `ui/src/components/dataset/dataset-rest-upload-actions.vue` and compare with legacy. Check:
- Does it have separator selection for CSV?
- Does it have "drop all lines" checkbox?
- Does it display results summary (nbOk, nbCreated, nbModified, nbDeleted, nbErrors, nbWarnings)?
- Does it have error line numbers display?
- Does it have attachments zip support?

- [ ] **Step 2: Fix any missing features**

Based on the review, add any missing features. The new component already has the core pattern (dialog, file input, upload, results). Fill gaps if found.

- [ ] **Step 3: Verify wiring in dataset-actions.vue**

Check that `dataset-rest-upload-actions` is wired into `dataset-actions.vue` for REST datasets. If not, add:

```vue
<dataset-rest-upload-actions
  v-if="dataset.isRest && can('createLine').value"
  :dataset-id="dataset.id"
>
  <template #activator="{ props: activatorProps, title }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="primary">mdi-file-upload</v-icon>
      </template>
      <v-list-item-title>{{ title }}</v-list-item-title>
    </v-list-item>
  </template>
</dataset-rest-upload-actions>
```

- [ ] **Step 4: Test manually**

Run: `npm --prefix ui run dev`
- Navigate to a REST dataset → actions → verify bulk upload action appears
- Open dialog → select CSV → verify separator picker appears
- Upload → verify results display

- [ ] **Step 5: Commit (if changes made)**

```bash
git add ui/src/components/dataset/dataset-rest-upload-actions.vue ui/src/components/dataset/dataset-actions.vue
git commit -m "feat: complete REST bulk upload dialog and wire into actions"
```
