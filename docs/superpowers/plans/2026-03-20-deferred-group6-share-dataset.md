# Group 6 — Share Dataset Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rewrite the share-dataset page as a full 5-step publication workflow stepper matching legacy behavior.

**Architecture:** Single page component with `v-stepper`. Steps: portal selection → dataset selection → permissions → metadata → publish/request. Uses existing composables and components (dataset-info, permissions) in simplified modes.

**Tech Stack:** Vue 3, Vuetify 4, dataset-store composable, permissions component

**Spec:** `docs/superpowers/specs/2026-03-20-deferred-features-design.md` — Group 6

---

### Task 1: Check Dependencies

**Files:**
- Check: `ui/src/components/dataset/dataset-info.vue` (does it support `simple` prop?)
- Check: permissions component availability in new UI
- Check: dataset-select component availability

- [ ] **Step 1: Check for existing components**

```bash
grep -r "permissions\|dataset-select\|DatasetSelect" ui/src/ --include="*.vue" --include="*.ts" -l
```

Identify:
- Is there a `permissions` component or d-frame wrapper?
- Is there a `dataset-select` autocomplete component?
- Does `dataset-info` support a `simple` or `required` prop?

If any are missing, they need to be created or wrapped.

- [ ] **Step 2: Document findings**

Record which components exist and which need to be created or adapted. This informs the subsequent tasks.

---

### Task 2: Dataset Select Component (if needed)

**Files:**
- Create: `ui/src/components/dataset/dataset-select.vue` (if not existing)

- [ ] **Step 1: Create dataset-select.vue**

Simple autocomplete that searches datasets by owner:

```vue
<template>
  <v-autocomplete
    v-model="selected"
    :items="datasets"
    :loading="searching"
    :label="t('selectDataset')"
    item-title="title"
    item-value="id"
    return-object
    variant="outlined"
    clearable
    @update:search="onSearch"
  />
</template>

<i18n lang="yaml">
fr:
  selectDataset: Rechercher un jeu de données
en:
  selectDataset: Search for a dataset
</i18n>

<script lang="ts" setup>
const props = defineProps<{
  owner?: { type: string, id: string, department?: string }
}>()

const selected = defineModel<any>()

const { t } = useI18n()
const { $fetch } = useNuxtApp()

const datasets = ref<any[]>([])
const searching = ref(false)
let searchTimeout: ReturnType<typeof setTimeout>

const onSearch = (q: string) => {
  clearTimeout(searchTimeout)
  if (!q || q.length < 2) return
  searchTimeout = setTimeout(async () => {
    searching.value = true
    try {
      const params: Record<string, string> = { q, size: '20', select: 'id,title,slug,publicationSites,requestedPublicationSites' }
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
</script>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/dataset/dataset-select.vue
git commit -m "feat: add dataset-select autocomplete component"
```

---

### Task 3: Rewrite Share Dataset Page

**Files:**
- Modify: `ui/src/pages/share-dataset.vue`

**Reference:** Legacy `ui-legacy/public/pages/share-dataset.vue`

- [ ] **Step 1: Read current share-dataset.vue**

Read `ui/src/pages/share-dataset.vue` to see the current placeholder.

- [ ] **Step 2: Rewrite as 5-step stepper**

```vue
<template>
  <v-container>
    <v-stepper
      v-model="currentStep"
      :items="stepItems"
    >
      <!-- Step 1: Portal Selection -->
      <template #item.1>
        <v-alert
          v-if="publicationSites && !publicationSites.length"
          type="warning"
          variant="outlined"
        >
          {{ t('noPublicationSite') }}
        </v-alert>
        <template v-if="publicationSites?.length">
          <p class="text-body-2 mb-4">
            {{ t('selectPortal') }}
          </p>
          <v-list
            variant="outlined"
            rounded
            style="max-width: 500px;"
          >
            <v-list-item
              v-for="(site, i) in publicationSites"
              :key="i"
              :active="publicationSite === site"
              color="primary"
              @click="publicationSite = site; currentStep = 2"
            >
              <v-list-item-title>{{ site.title || site.url || site.id }}</v-list-item-title>
              <v-list-item-subtitle v-if="site.departmentName || site.department">
                {{ site.departmentName || site.department }}
              </v-list-item-subtitle>
            </v-list-item>
          </v-list>
        </template>
        <v-btn
          color="primary"
          class="mt-4"
          :disabled="!publicationSite"
          @click="currentStep = 2"
        >
          {{ t('continue') }}
        </v-btn>
      </template>

      <!-- Step 2: Dataset Selection -->
      <template #item.2>
        <dataset-select
          v-model="selectedDataset"
          :owner="datasetOwner"
          @update:model-value="onDatasetSelect"
        />
        <v-alert
          v-if="alreadyPublished"
          type="warning"
          variant="outlined"
          density="compact"
          class="mt-4"
        >
          {{ t('alreadyPublished') }}
        </v-alert>
        <v-btn
          color="primary"
          class="mt-4"
          :disabled="!selectedDataset || alreadyPublished"
          @click="currentStep = canGetPermissions ? 3 : 4"
        >
          {{ t('continue') }}
        </v-btn>
      </template>

      <!-- Step 3: Permissions -->
      <template #item.3>
        <!-- Use d-frame to embed legacy permissions component, or build native -->
        <p class="text-body-2 mb-4">
          {{ t('permissionsDesc') }}
        </p>
        <!-- TODO: Wire permissions component (d-frame or native) -->
        <v-alert
          v-if="!canSetPermissions"
          type="info"
          variant="outlined"
        >
          {{ t('noCanSetPermissions') }}
        </v-alert>
        <v-btn
          color="primary"
          class="mt-4"
          @click="currentStep = 4"
        >
          {{ t('continue') }}
        </v-btn>
      </template>

      <!-- Step 4: Metadata -->
      <template #item.4>
        <v-form
          v-if="fullDataset && publicationSite"
          ref="metadataFormRef"
          v-model="metadataFormValid"
        >
          <!-- Simplified dataset-info with required fields -->
          <v-text-field
            v-model="fullDataset.title"
            :label="t('title')"
            variant="outlined"
            :rules="[v => !!v || t('required')]"
          />
          <v-textarea
            v-model="fullDataset.description"
            :label="t('description')"
            variant="outlined"
            rows="3"
          />
        </v-form>
        <v-btn
          color="primary"
          class="mt-4"
          :disabled="!metadataFormValid"
          @click="saveMetadata"
        >
          {{ t('continue') }}
        </v-btn>
      </template>

      <!-- Step 5: Action -->
      <template #item.5>
        <template v-if="fullDataset && publicationSite">
          <v-btn
            v-if="canPublishDirectly"
            color="primary"
            class="mt-4"
            @click="publish"
          >
            {{ t('publish') }}
          </v-btn>
          <v-btn
            v-else
            color="primary"
            class="mt-4"
            @click="requestPublication"
          >
            {{ t('requestPublication') }}
          </v-btn>
        </template>
      </template>
    </v-stepper>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  selectPortal: "Choisissez un portail :"
  noPublicationSite: Aucun portail n'est configuré sur ce compte.
  continue: Continuer
  alreadyPublished: Ce jeu de données est déjà publié sur ce portail.
  permissionsDesc: Configurez les permissions de visibilité du jeu de données.
  noCanSetPermissions: Vous n'avez pas la permission de modifier les permissions.
  title: Titre
  description: Description
  required: Requis
  publish: Publier le jeu de données
  requestPublication: Demander la publication de ce jeu de données à un administrateur
  publicationRequested: La publication sera soumise à un administrateur pour validation.
  stepPortal: Portail
  stepDataset: Jeu de données
  stepPermissions: Permissions
  stepMetadata: Métadonnées
  stepAction: Confirmation
en:
  selectPortal: "Select a portal:"
  noPublicationSite: No portal is configured for this account.
  continue: Continue
  alreadyPublished: This dataset is already published on this portal.
  permissionsDesc: Configure the dataset visibility permissions.
  noCanSetPermissions: You don't have permission to modify permissions.
  title: Title
  description: Description
  required: Required
  publish: Publish the dataset
  requestPublication: Submit the publication of this dataset to an admin for approval
  publicationRequested: The publication will be submitted to an admin for validation.
  stepPortal: Portal
  stepDataset: Dataset
  stepPermissions: Permissions
  stepMetadata: Metadata
  stepAction: Confirmation
</i18n>

<script lang="ts" setup>
const { t } = useI18n()
const router = useRouter()
const { $fetch } = useNuxtApp()
const session = useSession()

const currentStep = ref(1)
const publicationSite = ref<any>(null)
const selectedDataset = ref<any>(null)
const fullDataset = ref<any>(null)
const metadataFormRef = ref<any>(null)
const metadataFormValid = ref(false)
const publicationSites = ref<any[] | null>(null)

const stepItems = computed(() => [
  { title: t('stepPortal'), value: 1 },
  { title: t('stepDataset'), value: 2 },
  { title: t('stepPermissions'), value: 3 },
  { title: t('stepMetadata'), value: 4 },
  { title: t('stepAction'), value: 5 }
])

const account = computed(() => session.account.value)

const datasetOwner = computed(() => {
  if (!publicationSite.value) return account.value
  return {
    ...account.value,
    department: publicationSite.value.department || account.value?.department
  }
})

const publicationSiteKey = computed(() => {
  if (!publicationSite.value) return ''
  return `${publicationSite.value.type}:${publicationSite.value.id}`
})

const alreadyPublished = computed(() => {
  return publicationSite.value && selectedDataset.value &&
    selectedDataset.value.publicationSites?.includes(publicationSiteKey.value)
})

const canGetPermissions = computed(() => {
  return fullDataset.value?.userPermissions?.includes('getPermissions')
})

const canSetPermissions = computed(() => {
  return fullDataset.value?.userPermissions?.includes('setPermissions')
})

const canPublishDirectly = computed(() => {
  if (!fullDataset.value || !publicationSite.value) return false
  const canWrite = fullDataset.value.userPermissions?.includes('writePublicationSites')
  const isStaging = publicationSite.value.settings?.staging
  const deptMatch = !account.value?.department || account.value.department === publicationSite.value.department
  return (canWrite || isStaging) && deptMatch
})

// Fetch publication sites on mount
onMounted(async () => {
  if (!account.value) return
  try {
    const ownerType = account.value.type === 'organization' ? 'organization' : 'user'
    const res = await $fetch(`/settings/${ownerType}/${account.value.id}`)
    publicationSites.value = res.publicationSites || []
  } catch {
    publicationSites.value = []
  }
})

const onDatasetSelect = async (dataset: any) => {
  if (dataset) {
    fullDataset.value = await $fetch(`/datasets/${dataset.id}`)
  } else {
    fullDataset.value = null
  }
}

const saveMetadata = async () => {
  if (!fullDataset.value) return
  await $fetch(`/datasets/${fullDataset.value.id}`, {
    method: 'PATCH',
    body: { title: fullDataset.value.title, description: fullDataset.value.description }
  })
  currentStep.value = 5
}

const publish = async () => {
  if (!fullDataset.value) return
  const sites = (fullDataset.value.publicationSites || []).filter((s: string) => s !== publicationSiteKey.value)
  sites.push(publicationSiteKey.value)
  const reqSites = (fullDataset.value.requestedPublicationSites || []).filter((s: string) => s !== publicationSiteKey.value)
  await $fetch(`/datasets/${fullDataset.value.id}`, {
    method: 'PATCH',
    body: { publicationSites: sites, requestedPublicationSites: reqSites }
  })
  redirectAfterPublish()
}

const requestPublication = async () => {
  if (!fullDataset.value) return
  const reqSites = (fullDataset.value.requestedPublicationSites || []).filter((s: string) => s !== publicationSiteKey.value)
  reqSites.push(publicationSiteKey.value)
  await $fetch(`/datasets/${fullDataset.value.id}`, {
    method: 'PATCH',
    body: { requestedPublicationSites: reqSites }
  })
  router.push('/')
}

const redirectAfterPublish = () => {
  if (publicationSite.value?.datasetUrlTemplate && fullDataset.value) {
    window.location.href = publicationSite.value.datasetUrlTemplate
      .replace('{id}', fullDataset.value.id)
      .replace('{slug}', fullDataset.value.slug)
  } else {
    router.push(`/dataset/${fullDataset.value!.id}`)
  }
}
</script>
```

**Note:** The permissions step (step 3) needs the permissions component. Check during implementation if there's a native Vue 3 permissions component or if a d-frame wrapper to the legacy permissions editor is needed. If neither exists, a d-frame wrapper to `/embed/permissions/{datasetId}` may be the pragmatic approach.

- [ ] **Step 3: Test manually**

Run: `npm --prefix ui run dev`
- Navigate to share-dataset page
- Verify portal list loads (requires configured publication sites)
- Select portal → select dataset → verify already-published check
- Complete metadata → publish → verify redirect

- [ ] **Step 4: Commit**

```bash
git add ui/src/pages/share-dataset.vue
git commit -m "feat: rewrite share-dataset page as 5-step publication workflow stepper"
```
