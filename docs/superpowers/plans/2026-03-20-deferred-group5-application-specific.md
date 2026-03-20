# Group 5 — Application-Specific Features Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add application capture/screenshot dialog, attachments management, and version upgrade notifications.

**Architecture:** Three independent features wired into the application detail page and actions panel. Capture uses server-side rendering via `/capture` endpoint. Attachments are managed via metadata-attachments API. Version upgrades compare current base app URL against available versions.

**Tech Stack:** Vue 3, Vuetify 4, `d-frame` (sync-state preview), native blob download

**Spec:** `docs/superpowers/specs/2026-03-20-deferred-features-design.md` — Group 5

---

### Task 1: Verify d-frame sync-state support

**Files:**
- Check: `node_modules/@data-fair/frame/`

- [ ] **Step 1: Check d-frame for sync-state**

```bash
grep -r "sync-state\|syncState\|state-change" node_modules/@data-fair/frame/ --include="*.js" --include="*.ts" -l
```

If `d-frame` supports `state-change-events` attribute and emits state change events, we can use it for the capture preview. If not, we need `@koumoul/v-iframe` as a fallback.

- [ ] **Step 2: Decision**

Based on findings:
- If d-frame has state-change support → use `<d-frame state-change-events @state-change="...">`
- If not → `npm --prefix ui install @koumoul/v-iframe` and import for capture only

- [ ] **Step 3: Commit dependency if needed**

```bash
git add ui/package.json ui/package-lock.json
git commit -m "chore: add v-iframe dependency for capture state sync"
```

---

### Task 2: Application Capture Dialog

**Files:**
- Create: `ui/src/components/application/application-capture-dialog.vue`
- Modify: `ui/src/components/application/application-actions.vue`

**Reference:** Legacy `ui-legacy/public/components/application/application-capture-dialog.vue`

- [ ] **Step 1: Create application-capture-dialog.vue**

```vue
<template>
  <v-dialog
    v-model="dialog"
    :max-width="syncState ? 900 : 500"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-toolbar
        density="compact"
        flat
      >
        <v-toolbar-title>{{ t('capture') }}</v-toolbar-title>
        <v-spacer />
        <v-btn
          icon="mdi-close"
          variant="text"
          @click="dialog = false"
        />
      </v-toolbar>
      <v-card-text
        v-if="dialog"
        class="pb-0 pt-2"
      >
        <p class="text-body-2 mb-4">
          {{ t('captureMsg') }}
        </p>
        <v-row dense>
          <v-col>
            <v-text-field
              v-model.number="width"
              :label="t('width')"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
          <v-col>
            <v-text-field
              v-model.number="height"
              :label="t('height')"
              type="number"
              variant="outlined"
              density="compact"
              hide-details
            />
          </v-col>
        </v-row>

        <!-- State sync preview (if base app supports it) -->
        <template v-if="syncState">
          <p class="text-body-2 mt-4 mb-2">
            {{ t('setState') }}
          </p>
          <d-frame
            :src="applicationLink"
            state-change-events
            height="400px"
            style="width: 100%; border: 1px solid #ccc;"
            @state-change="onStateChange"
          />
        </template>
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          color="primary"
          :loading="downloading"
          :prepend-icon="'mdi-camera'"
          :title="t('downloadCapture')"
          @click="download"
        >
          {{ t('downloadCapture') }}
        </v-btn>
        <v-spacer />
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  capture: Capture d'écran
  captureMsg: Une image statique au format PNG va être créée à partir de cette application.
  downloadCapture: Télécharger la capture
  setState: Naviguez pour choisir l'état de l'application dans la capture
  width: Largeur
  height: Hauteur
en:
  capture: Screenshot
  captureMsg: A static image with PNG format will be created based on this application.
  downloadCapture: Download screenshot
  setState: Navigate to choose the state of the application in the screenshot
  width: Width
  height: Height
</i18n>

<script lang="ts" setup>
import useApplicationStore from '~/composables/application-store'
import '@data-fair/frame/lib/d-frame.js'

const { t } = useI18n()
const { application, applicationLink, prodBaseApp } = useApplicationStore()
const { $fetch } = useNuxtApp()

const dialog = ref(false)
const width = ref(800)
const height = ref(450)
const stateSrc = ref<string | null>(null)
const downloading = ref(false)

const syncState = computed(() => {
  return prodBaseApp.value?.meta?.['df:sync-state'] &&
    prodBaseApp.value.meta['df:sync-state'] !== 'false'
})

watch(dialog, (val) => {
  if (val) {
    width.value = Number(prodBaseApp.value?.meta?.['df:capture-width'] || 800)
    height.value = Number(prodBaseApp.value?.meta?.['df:capture-height'] || 450)
    stateSrc.value = null
  }
})

const onStateChange = (e: CustomEvent) => {
  // d-frame emits state-change with detail containing the new URL
  if (e.detail?.[1]) {
    stateSrc.value = e.detail[1]
  }
}

const captureUrl = computed(() => {
  if (!application.value) return ''
  const url = new URL(application.value.href + '/capture')
  url.searchParams.set('width', String(width.value))
  url.searchParams.set('height', String(height.value))
  url.searchParams.set('updatedAt', application.value.fullUpdatedAt || '')

  if (stateSrc.value) {
    try {
      const stateUrl = new URL(stateSrc.value)
      for (const [key, val] of stateUrl.searchParams.entries()) {
        url.searchParams.set('app_' + key, val)
      }
    } catch (e) {
      // invalid URL — skip state params
    }
  }

  return url.href
})

const download = async () => {
  downloading.value = true
  try {
    const res = await fetch(captureUrl.value, { credentials: 'include' })
    const blob = await res.blob()
    const contentType = res.headers.get('content-type') || 'image/png'
    const ext = contentType.split('/').pop() || 'png'

    // Native blob download — no js-file-download dependency needed
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `${application.value!.id}.${ext}`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(a.href)
  } finally {
    downloading.value = false
  }
}
</script>
```

**Note:** Uses native blob download instead of `js-file-download` to avoid adding a dependency (per P3 in spec).

- [ ] **Step 2: Wire into application-actions.vue**

Add after integration dialog:

```vue
<application-capture-dialog>
  <template #activator="{ props: activatorProps }">
    <v-list-item v-bind="activatorProps">
      <template #prepend>
        <v-icon color="primary">mdi-camera</v-icon>
      </template>
      <v-list-item-title>{{ t('capture') }}</v-list-item-title>
    </v-list-item>
  </template>
</application-capture-dialog>
```

Add i18n: `capture: Capture d'écran` / `Screenshot`

- [ ] **Step 3: Test manually**

Run: `npm --prefix ui run dev`
- Navigate to application detail → actions → "Screenshot"
- Open dialog → verify width/height inputs, sync state preview (if supported)
- Click download → verify PNG saves

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/application/application-capture-dialog.vue ui/src/components/application/application-actions.vue
git commit -m "feat: add application capture/screenshot dialog"
```

---

### Task 3: Application Attachments

**Files:**
- Create: `ui/src/components/application/application-attachments.vue`
- Create: `ui/src/components/application/application-attachment-dialog.vue`
- Modify: `ui/src/pages/application/[id]/index.vue`

**Reference:** Legacy `ui-legacy/public/components/application/application-attachments.vue` and `application-attachment-dialog.vue`

- [ ] **Step 1: Create application-attachment-dialog.vue**

Upload dialog for a single attachment:

```vue
<template>
  <v-dialog
    v-model="dialog"
    max-width="500"
  >
    <template #activator="{ props: activatorProps }">
      <slot
        name="activator"
        :props="activatorProps"
      />
    </template>
    <v-card>
      <v-card-title>{{ t('uploadAttachment') }}</v-card-title>
      <v-card-text>
        <v-text-field
          v-model="name"
          :label="t('name')"
          variant="outlined"
          class="mb-2"
        />
        <v-alert
          v-if="duplicateName"
          type="warning"
          variant="outlined"
          density="compact"
          class="mb-2"
        >
          {{ t('duplicateWarning') }}
        </v-alert>
        <v-file-input
          v-model="file"
          :label="t('selectFile')"
          variant="outlined"
          show-size
        />
        <v-progress-linear
          v-if="uploading"
          :model-value="uploadProgress"
          color="primary"
          height="20"
        />
      </v-card-text>
      <v-card-actions>
        <v-spacer />
        <v-btn
          variant="text"
          @click="dialog = false"
        >
          {{ t('cancel') }}
        </v-btn>
        <v-btn
          color="primary"
          :loading="uploading"
          :disabled="!name || !file?.length"
          @click="upload"
        >
          {{ t('upload') }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<i18n lang="yaml">
fr:
  uploadAttachment: Ajouter une pièce jointe
  name: Nom
  selectFile: Sélectionner un fichier
  duplicateWarning: Une pièce jointe avec ce nom existe déjà, elle sera remplacée.
  cancel: Annuler
  upload: Envoyer
en:
  uploadAttachment: Add attachment
  name: Name
  selectFile: Select file
  duplicateWarning: An attachment with this name already exists, it will be replaced.
  cancel: Cancel
  upload: Upload
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  applicationId: string
  existingNames: string[]
}>()

const emit = defineEmits<{ uploaded: [] }>()

const { t } = useI18n()
const { $fetch } = useNuxtApp()

const dialog = ref(false)
const name = ref('')
const file = ref<File[] | null>(null)
const uploading = ref(false)
const uploadProgress = ref(0)

const duplicateName = computed(() => props.existingNames.includes(name.value))

watch(dialog, (val) => {
  if (val) {
    name.value = ''
    file.value = null
    uploadProgress.value = 0
  }
})

const upload = async () => {
  if (!file.value?.length || !name.value) return
  uploading.value = true
  try {
    const formData = new FormData()
    formData.append('attachment', file.value[0])
    formData.append('name', name.value)

    await $fetch(`/applications/${props.applicationId}/metadata-attachments`, {
      method: 'POST',
      body: formData,
      onUploadProgress: (e: ProgressEvent) => {
        if (e.total) uploadProgress.value = (e.loaded / e.total) * 100
      }
    })

    dialog.value = false
    emit('uploaded')
  } finally {
    uploading.value = false
  }
}
</script>
```

- [ ] **Step 2: Create application-attachments.vue**

List view with actions:

```vue
<template>
  <v-card variant="outlined">
    <v-card-title>
      {{ t('attachments') }}
      <application-attachment-dialog
        :application-id="applicationId"
        :existing-names="attachmentNames"
        @uploaded="fetchAttachments"
      >
        <template #activator="{ props: activatorProps }">
          <v-btn
            v-bind="activatorProps"
            icon="mdi-plus"
            variant="text"
            size="small"
          />
        </template>
      </application-attachment-dialog>
    </v-card-title>
    <v-list
      v-if="attachments.length"
      density="compact"
    >
      <v-list-item
        v-for="att in attachments"
        :key="att.name"
      >
        <v-list-item-title>{{ att.name }}</v-list-item-title>
        <v-list-item-subtitle>{{ att.size ? formatBytes(att.size) : '' }}</v-list-item-subtitle>
        <template #append>
          <v-btn
            icon="mdi-download"
            variant="text"
            size="small"
            :href="att.url"
            target="_blank"
          />
          <v-btn
            icon="mdi-image"
            variant="text"
            size="small"
            :title="t('setThumbnail')"
            @click="setThumbnail(att.name)"
          />
          <v-btn
            icon="mdi-delete"
            variant="text"
            size="small"
            color="warning"
            @click="deleteAttachment(att.name)"
          />
        </template>
      </v-list-item>
    </v-list>
    <v-card-text v-else>
      {{ t('noAttachments') }}
    </v-card-text>
  </v-card>
</template>

<i18n lang="yaml">
fr:
  attachments: Pièces jointes
  setThumbnail: Définir comme vignette
  noAttachments: Aucune pièce jointe
en:
  attachments: Attachments
  setThumbnail: Set as thumbnail
  noAttachments: No attachments
</i18n>

<script lang="ts" setup>
import { formatBytes } from '~/utils/format'

const props = defineProps<{
  applicationId: string
}>()

const { t } = useI18n()
const { $fetch } = useNuxtApp()

const attachments = ref<Array<{ name: string, size?: number, url: string }>>([])

const attachmentNames = computed(() => attachments.value.map(a => a.name))

const fetchAttachments = async () => {
  const app = await $fetch(`/applications/${props.applicationId}`)
  attachments.value = (app.attachments || []).map((att: any) => ({
    name: att.name,
    size: att.size,
    url: `/api/v1/applications/${props.applicationId}/metadata-attachments/${encodeURIComponent(att.name)}`
  }))
}

const deleteAttachment = async (name: string) => {
  await $fetch(`/applications/${props.applicationId}/metadata-attachments/${encodeURIComponent(name)}`, {
    method: 'DELETE'
  })
  await fetchAttachments()
}

const setThumbnail = async (name: string) => {
  await $fetch(`/applications/${props.applicationId}`, {
    method: 'PATCH',
    body: { image: `/api/v1/applications/${props.applicationId}/metadata-attachments/${encodeURIComponent(name)}` }
  })
}

onMounted(fetchAttachments)
</script>
```

**Note:** `formatBytes` utility may need to be checked/created at `ui/src/utils/format.ts`. Check if it already exists.

- [ ] **Step 3: Wire into application detail page**

Add to `ui/src/pages/application/[id]/index.vue` as a new section:

```vue
<application-attachments :application-id="application.id" />
```

- [ ] **Step 4: Commit**

```bash
git add ui/src/components/application/application-attachment-dialog.vue ui/src/components/application/application-attachments.vue ui/src/pages/application/[id]/index.vue
git commit -m "feat: add application attachments management (list, upload, delete, thumbnail)"
```

---

### Task 4: Version Upgrade Notifications

**Files:**
- Create or modify: `ui/src/composables/application-versions.ts` (check if exists)
- Modify: `ui/src/pages/application/[id]/index.vue`

**Reference:** Legacy application version handling

- [ ] **Step 1: Check existing application-versions composable**

```bash
find ui/src -name "*version*" -o -name "*upgrade*"
grep -r "availableVersions\|baseAppVersion\|upgrade" ui/src/ --include="*.ts" --include="*.vue" -l
```

- [ ] **Step 2: Create or extend application-versions composable**

If it doesn't exist, create `ui/src/composables/use-application-versions.ts`:

```typescript
import useApplicationStore from './application-store'

export default function useApplicationVersions () {
  const { application, prodBaseApp } = useApplicationStore()
  const { $fetch } = useNuxtApp()

  const availableVersions = ref<Array<{ url: string, version: string, description?: string }>>([])

  const hasUpgrade = computed(() => {
    if (!application.value?.url || !availableVersions.value.length) return false
    return availableVersions.value.some(v => v.url !== application.value!.url)
  })

  const latestVersion = computed(() => {
    return availableVersions.value[0] || null
  })

  const fetchVersions = async () => {
    if (!prodBaseApp.value?.id) return
    try {
      const res = await $fetch(`/base-applications/${prodBaseApp.value.id}/versions`)
      availableVersions.value = res || []
    } catch {
      // base app may not have versions endpoint
    }
  }

  const upgrade = async (versionUrl: string) => {
    if (!application.value) return
    await $fetch(`/applications/${application.value.id}`, {
      method: 'PATCH',
      body: { url: versionUrl }
    })
  }

  return { availableVersions, hasUpgrade, latestVersion, fetchVersions, upgrade }
}
```

- [ ] **Step 3: Add upgrade banner to application detail page**

In `ui/src/pages/application/[id]/index.vue`, add near the top of the page:

```vue
<v-alert
  v-if="hasUpgrade"
  type="info"
  variant="outlined"
  class="mb-4"
>
  {{ t('upgradeAvailable') }}
  <v-btn
    color="primary"
    variant="text"
    size="small"
    class="ml-2"
    @click="showUpgradeDialog = true"
  >
    {{ t('upgrade') }}
  </v-btn>
</v-alert>

<v-dialog v-model="showUpgradeDialog" max-width="500">
  <v-card>
    <v-card-title>{{ t('upgradeTitle') }}</v-card-title>
    <v-card-text>
      <v-alert type="warning" variant="outlined" class="mb-4">
        {{ t('upgradeWarning') }}
      </v-alert>
      <p v-if="latestVersion">{{ t('upgradeTo', { version: latestVersion.version }) }}</p>
    </v-card-text>
    <v-card-actions>
      <v-spacer />
      <v-btn variant="text" @click="showUpgradeDialog = false">{{ t('cancel') }}</v-btn>
      <v-btn color="primary" @click="doUpgrade">{{ t('confirm') }}</v-btn>
    </v-card-actions>
  </v-card>
</v-dialog>
```

Add i18n entries for upgrade strings in fr/en.

- [ ] **Step 4: Commit**

```bash
git add ui/src/composables/use-application-versions.ts ui/src/pages/application/[id]/index.vue
git commit -m "feat: add version upgrade notifications for applications"
```
