# Datasets & Applications List Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the basic datasets and applications list pages with full-featured pages matching the legacy UI: faceted filtering sidebar, infinite scroll, grid/list toggle (datasets), card/list-item components.

**Architecture:** Shared `useCatalogList` composable handles infinite scroll + facet fetching. Each page composes it with domain-specific facet components. Portals pattern: `v-intersect` sentinel, manual `useFetch` with `watch: false`, accumulated `displayedItems` array.

**Tech Stack:** Vue 3, Vuetify 4, `useFetch` from `@data-fair/lib-vue/fetch.js`, `useStringSearchParam`/`useStringsArraySearchParam` from `@data-fair/lib-vue/reactive-search-params.js`, `usePermissions` composable.

**Spec:** `docs/superpowers/specs/2026-03-20-datasets-applications-list-design.md`

---

### Task 1: Create `useCatalogList` composable

**Files:**
- Create: `ui/src/composables/use-catalog-list.ts`

- [ ] **Step 1: Create the composable**

```ts
import type { Ref, ComputedRef } from 'vue'

type FacetValue = { count: number, value: string, [key: string]: any }
type CatalogResponse<T> = { count: number, results: T[], facets?: Record<string, FacetValue[]> }

interface UseCatalogListOptions<T> {
  fetchUrl: ComputedRef<string>
  query: ComputedRef<Record<string, any>>
  facetsFields: string
  pageSize?: number
}

export function useCatalogList<T> (options: UseCatalogListOptions<T>) {
  const { fetchUrl, query, facetsFields, pageSize = 20 } = options

  const displayedItems = ref<T[]>([]) as Ref<T[]>
  const currentPage = ref(1)
  const totalCount = ref(0)
  const facets = ref<Record<string, FacetValue[]>>({}) as Ref<Record<string, FacetValue[]>>
  const loading = ref(false)
  let resetVersion = 0

  const hasMore = computed(() => displayedItems.value.length < totalCount.value)

  // Build full query with pagination, facets only on page 1
  const fullQuery = computed(() => {
    const q: Record<string, any> = {
      ...query.value,
      size: pageSize,
      page: currentPage.value,
    }
    if (currentPage.value === 1) {
      q.facets = facetsFields
    }
    return q
  })

  const catalogFetch = useFetch<CatalogResponse<T>>(fetchUrl, { query: fullQuery, watch: false, immediate: false })

  const reset = async () => {
    const version = ++resetVersion
    currentPage.value = 1
    await catalogFetch.refresh()
    if (version !== resetVersion) return // stale reset, discard
    if (catalogFetch.data.value) {
      displayedItems.value = [...catalogFetch.data.value.results]
      totalCount.value = catalogFetch.data.value.count
      if (catalogFetch.data.value.facets) {
        facets.value = catalogFetch.data.value.facets
      }
    }
  }

  const loadMore = async () => {
    if (loading.value || !hasMore.value) return
    loading.value = true
    const version = resetVersion
    currentPage.value++
    await catalogFetch.refresh()
    if (version !== resetVersion) { loading.value = false; return }
    if (catalogFetch.data.value) {
      displayedItems.value.push(...catalogFetch.data.value.results)
      totalCount.value = catalogFetch.data.value.count
    }
    loading.value = false
  }

  // Watch query changes (excluding page) to reset
  watch(query, () => { reset() })

  // Initial load
  onMounted(() => { reset() })

  return {
    displayedItems,
    loading: computed(() => catalogFetch.loading.value || loading.value),
    totalCount,
    hasMore,
    facets,
    loadMore,
    reset,
    initialized: catalogFetch.initialized,
    error: catalogFetch.error,
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ui && npx vue-tsc --noEmit --pretty 2>&1 | grep use-catalog-list || echo "No errors in use-catalog-list"`

- [ ] **Step 3: Commit**

```bash
git add ui/src/composables/use-catalog-list.ts
git commit -m "feat: add useCatalogList composable for infinite scroll + facets"
```

---

### Task 2: Create `dataset-card.vue`

**Files:**
- Create: `ui/src/components/dataset/dataset-card.vue`
- Reference: `ui-legacy/public/components/dataset/dataset-card.vue`

- [ ] **Step 1: Create the dataset card component**

```vue
<template>
  <v-card
    :to="`/dataset/${dataset.id}`"
    class="w-100 h-100 d-flex flex-column"
  >
    <v-card-title class="text-body-1 font-weight-bold text-truncate">
      {{ dataset.title || dataset.id }}
    </v-card-title>
    <v-card-text class="flex-grow-1">
      <!-- Type badges -->
      <div class="d-flex flex-wrap ga-1 mb-2">
        <v-chip
          v-if="dataset.isVirtual"
          size="x-small"
          color="primary"
          variant="tonal"
        >
          {{ t('virtual') }}
        </v-chip>
        <v-chip
          v-if="dataset.isRest"
          size="x-small"
          color="primary"
          variant="tonal"
        >
          {{ t('editable') }}
        </v-chip>
        <v-chip
          v-if="dataset.isMetaOnly"
          size="x-small"
          color="primary"
          variant="tonal"
        >
          {{ t('metaOnly') }}
        </v-chip>
        <v-chip
          v-if="dataset.status === 'draft'"
          size="x-small"
          color="warning"
          variant="tonal"
        >
          {{ t('draft') }}
        </v-chip>
        <v-chip
          v-if="dataset.status === 'error'"
          size="x-small"
          color="error"
          variant="tonal"
        >
          {{ t('error') }}
        </v-chip>
      </div>

      <!-- File info -->
      <div
        v-if="fileInfo"
        class="text-body-2 text-medium-emphasis mb-1"
      >
        {{ fileInfo }}
      </div>

      <!-- Record count -->
      <div
        v-if="dataset.count != null"
        class="text-body-2 text-medium-emphasis mb-1"
      >
        {{ t('records', { count: dataset.count.toLocaleString() }) }}
      </div>

      <!-- Topics -->
      <div
        v-if="showTopics && dataset.topics?.length"
        class="d-flex flex-wrap ga-1 mt-1"
      >
        <v-chip
          v-for="topic in dataset.topics"
          :key="topic.id"
          size="x-small"
          :style="topic.color ? { backgroundColor: topic.color, color: '#fff' } : {}"
          variant="flat"
        >
          {{ topic.title }}
        </v-chip>
      </div>
    </v-card-text>

    <v-card-subtitle class="text-caption pb-3">
      <span v-if="showOwner && dataset.owner">
        {{ ownerName }} ·
      </span>
      <span v-if="dataset.updatedAt">
        {{ t('updatedAt', { date: formatDate(dataset.updatedAt) }) }}
      </span>
    </v-card-subtitle>
  </v-card>
</template>

<script lang="ts" setup>
const { t, locale } = useI18n()

const props = withDefaults(defineProps<{
  dataset: any
  showTopics?: boolean
  showOwner?: boolean
}>(), {
  showTopics: true,
  showOwner: false,
})

const fileInfo = computed(() => {
  const file = props.dataset.originalFile || props.dataset.file ||
    props.dataset.draft?.originalFile || props.dataset.draft?.file
  if (!file) return null
  let info = file.name
  if (file.size) {
    info += ` (${formatBytes(file.size)})`
  }
  return info
})

const ownerName = computed(() => {
  const o = props.dataset.owner
  if (!o) return ''
  return o.departmentName || o.name || o.id
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}

// formatBytes is auto-imported from @data-fair/lib-vue
</script>

<i18n lang="yaml">
fr:
  virtual: Virtuel
  editable: Éditable
  metaOnly: Métadonnées
  draft: Brouillon
  error: Erreur
  records: "{count} enregistrement | {count} enregistrements"
  updatedAt: Mis à jour le {date}
en:
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft
  error: Error
  records: "{count} record | {count} records"
  updatedAt: Updated on {date}
</i18n>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/dataset/dataset-card.vue
git commit -m "feat: add dataset-card component for list grid view"
```

---

### Task 3: Create `dataset-list-item.vue`

**Files:**
- Create: `ui/src/components/dataset/dataset-list-item.vue`
- Reference: `ui-legacy/public/components/dataset/dataset-list-item.vue`, `dataset-list-item-title.vue`, `dataset-list-item-subtitle.vue`

- [ ] **Step 1: Create the dataset list item component**

```vue
<template>
  <v-list-item
    :to="`/dataset/${dataset.id}`"
    lines="two"
  >
    <v-list-item-title>
      {{ dataset.title || dataset.id }}
      <v-chip
        v-if="dataset.status === 'error'"
        size="x-small"
        color="error"
        variant="tonal"
        class="ml-1"
      >
        {{ t('error') }}
      </v-chip>
    </v-list-item-title>

    <v-list-item-subtitle>
      <span v-if="showOwner && dataset.owner">{{ ownerName }} · </span>
      <span v-if="dataset.isVirtual">{{ t('virtual') }} · </span>
      <span v-if="dataset.isRest">{{ t('editable') }} · </span>
      <span v-if="dataset.isMetaOnly">{{ t('metaOnly') }} · </span>
      <span v-if="dataset.status === 'draft'">{{ t('draft') }} · </span>
      <span v-if="fileInfo">{{ fileInfo }} · </span>
      <span v-if="dataset.count != null">{{ dataset.count.toLocaleString() }} {{ t('lines') }} · </span>
      <span v-if="dataset.updatedAt">{{ formatDate(dataset.updatedAt) }}</span>
    </v-list-item-subtitle>

    <template
      v-if="showTopics && dataset.topics?.length"
      #append
    >
      <div class="d-flex ga-1">
        <v-chip
          v-for="topic in dataset.topics"
          :key="topic.id"
          size="x-small"
          :style="topic.color ? { backgroundColor: topic.color, color: '#fff' } : {}"
          variant="flat"
        >
          {{ topic.title }}
        </v-chip>
      </div>
    </template>
  </v-list-item>
</template>

<script lang="ts" setup>
const { t, locale } = useI18n()

const props = withDefaults(defineProps<{
  dataset: any
  showTopics?: boolean
  showOwner?: boolean
}>(), {
  showTopics: true,
  showOwner: false,
})

const fileInfo = computed(() => {
  const file = props.dataset.originalFile || props.dataset.file ||
    props.dataset.draft?.originalFile || props.dataset.draft?.file
  if (!file) return null
  let info = file.name
  if (file.size) {
    info += ` (${formatBytes(file.size)})`
  }
  return info
})

const ownerName = computed(() => {
  const o = props.dataset.owner
  if (!o) return ''
  return o.departmentName || o.name || o.id
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  virtual: Virtuel
  editable: Éditable
  metaOnly: Métadonnées
  draft: Brouillon
  error: Erreur
  lines: lignes
en:
  virtual: Virtual
  editable: Editable
  metaOnly: Metadata only
  draft: Draft
  error: Error
  lines: lines
</i18n>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/dataset/dataset-list-item.vue
git commit -m "feat: add dataset-list-item component for list view"
```

---

### Task 4: Create `dataset-facets.vue`

**Files:**
- Create: `ui/src/components/dataset/dataset-facets.vue`
- Reference: `ui-legacy/public/components/dataset/dataset-facets.vue`

- [ ] **Step 1: Create the dataset facets component**

The component receives `facets` (from API response) and `v-model` bindings for each filter. It renders `v-select` or `v-autocomplete` per facet with count badges.

```vue
<template>
  <div class="d-flex flex-column ga-3">
    <!-- Owner -->
    <v-autocomplete
      v-if="ownerItems.length > 1"
      v-model="owner"
      :items="ownerItems"
      :label="t('owner')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Status -->
    <v-select
      v-if="statusItems.length"
      v-model="status"
      :items="statusItems"
      :label="t('status')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Draft status -->
    <v-select
      v-if="draftStatusItems.length"
      v-model="draftStatus"
      :items="draftStatusItems"
      :label="t('draftStatus')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Visibility -->
    <v-select
      v-if="visibilityItems.length"
      v-model="visibility"
      :items="visibilityItems"
      :label="t('visibility')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Topics -->
    <v-select
      v-if="topicsItems.length"
      v-model="topics"
      :items="topicsItems"
      :label="t('topics')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Publication sites -->
    <v-select
      v-if="publicationSitesItems.length"
      v-model="publicationSites"
      :items="publicationSitesItems"
      :label="t('publicationSites')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Requested publication sites -->
    <v-select
      v-if="requestedPublicationSitesItems.length"
      v-model="requestedPublicationSites"
      :items="requestedPublicationSitesItems"
      :label="t('requestedPublicationSites')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Services -->
    <v-select
      v-if="servicesItems.length"
      v-model="services"
      :items="servicesItems"
      :label="t('services')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Concepts -->
    <v-select
      v-if="conceptsItems.length"
      v-model="concepts"
      :items="conceptsItems"
      :label="t('concepts')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
  </div>
</template>

<script lang="ts" setup>
const { t } = useI18n()

const props = defineProps<{
  facets: Record<string, { count: number, value: string, [key: string]: any }[]>
}>()

const owner = defineModel<string[]>('owner', { default: () => [] })
const status = defineModel<string[]>('status', { default: () => [] })
const draftStatus = defineModel<string[]>('draftStatus', { default: () => [] })
const visibility = defineModel<string[]>('visibility', { default: () => [] })
const topics = defineModel<string[]>('topics', { default: () => [] })
const publicationSites = defineModel<string[]>('publicationSites', { default: () => [] })
const requestedPublicationSites = defineModel<string[]>('requestedPublicationSites', { default: () => [] })
const services = defineModel<string[]>('services', { default: () => [] })
const concepts = defineModel<string[]>('concepts', { default: () => [] })

const facetToItems = (key: string, labelFn?: (v: any) => string) => {
  return computed(() => {
    const values = props.facets[key]
    if (!values?.length) return []
    return values.map(f => ({
      title: (labelFn ? labelFn(f) : f.value) + ` (${f.count})`,
      value: f.value,
    }))
  })
}

const ownerItems = facetToItems('owner', (f) => f.departmentName || f.name || f.value)
const statusItems = facetToItems('status', (f) => t('statusValues.' + f.value))
const draftStatusItems = facetToItems('draftStatus', (f) => t('draftStatusValues.' + f.value))
const visibilityItems = facetToItems('visibility', (f) => t('visibilityValues.' + f.value))
const topicsItems = facetToItems('topics', (f) => f.title || f.value)
const publicationSitesItems = facetToItems('publicationSites', (f) => f.title || f.value)
const requestedPublicationSitesItems = facetToItems('requestedPublicationSites', (f) => f.title || f.value)
const servicesItems = facetToItems('services')
const conceptsItems = facetToItems('concepts', (f) => f.title || f.value)
</script>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  status: Statut
  draftStatus: Statut du brouillon
  visibility: Visibilité
  topics: Thématiques
  publicationSites: Sites de publication
  requestedPublicationSites: Publications demandées
  services: Services
  concepts: Concepts
  statusValues:
    finalized: Finalisé
    error: Erreur
    draft: Brouillon
    indexed: Indexé
    loaded: Chargé
    analyzed: Analysé
    schematized: Schématisé
  draftStatusValues:
    waiting: En attente
    validationNeeded: Validation nécessaire
  visibilityValues:
    public: Public
    private: Privé
    protected: Protégé
en:
  owner: Owner
  status: Status
  draftStatus: Draft status
  visibility: Visibility
  topics: Topics
  publicationSites: Publication sites
  requestedPublicationSites: Requested publications
  services: Services
  concepts: Concepts
  statusValues:
    finalized: Finalized
    error: Error
    draft: Draft
    indexed: Indexed
    loaded: Loaded
    analyzed: Analyzed
    schematized: Schematized
  draftStatusValues:
    waiting: Waiting
    validationNeeded: Validation needed
  visibilityValues:
    public: Public
    private: Private
    protected: Protected
</i18n>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/dataset/dataset-facets.vue
git commit -m "feat: add dataset-facets component for sidebar filtering"
```

---

### Task 5: Create `application-card.vue`

**Files:**
- Create: `ui/src/components/application/application-card.vue`

- [ ] **Step 1: Create the application card component**

```vue
<template>
  <v-card
    :to="`/application/${application.id}`"
    class="w-100 h-100 d-flex flex-column"
  >
    <v-card-title class="text-body-1 font-weight-bold text-truncate">
      {{ application.title || application.id }}
    </v-card-title>
    <v-card-text class="flex-grow-1">
      <p
        v-if="application.description"
        class="text-body-2 text-medium-emphasis mb-2"
        style="display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;"
      >
        {{ application.description }}
      </p>
      <div class="d-flex flex-wrap ga-1">
        <v-chip
          v-if="application.status"
          size="x-small"
          :color="statusColor"
          variant="tonal"
        >
          {{ t('status.' + application.status) }}
        </v-chip>
      </div>

      <!-- Topics -->
      <div
        v-if="showTopics && application.topics?.length"
        class="d-flex flex-wrap ga-1 mt-2"
      >
        <v-chip
          v-for="topic in application.topics"
          :key="topic.id"
          size="x-small"
          :style="topic.color ? { backgroundColor: topic.color, color: '#fff' } : {}"
          variant="flat"
        >
          {{ topic.title }}
        </v-chip>
      </div>
    </v-card-text>

    <v-card-subtitle class="text-caption pb-3">
      <span v-if="showOwner && application.owner">
        {{ ownerName }} ·
      </span>
      <span v-if="application.updatedAt">
        {{ t('updatedAt', { date: formatDate(application.updatedAt) }) }}
      </span>
    </v-card-subtitle>
  </v-card>
</template>

<script lang="ts" setup>
const { t, locale } = useI18n()

const props = withDefaults(defineProps<{
  application: any
  showTopics?: boolean
  showOwner?: boolean
}>(), {
  showTopics: true,
  showOwner: false,
})

const statusColor = computed(() => {
  const colors: Record<string, string> = {
    running: 'success',
    error: 'error',
    stopped: 'warning',
    configured: 'info',
  }
  return colors[props.application.status] ?? 'default'
})

const ownerName = computed(() => {
  const o = props.application.owner
  if (!o) return ''
  return o.departmentName || o.name || o.id
})

const formatDate = (dateStr: string) => {
  return new Date(dateStr).toLocaleDateString(locale.value)
}
</script>

<i18n lang="yaml">
fr:
  updatedAt: Mis à jour le {date}
  status:
    running: En cours
    error: Erreur
    stopped: Arrêté
    configured: Configuré
en:
  updatedAt: Updated on {date}
  status:
    running: Running
    error: Error
    stopped: Stopped
    configured: Configured
</i18n>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/application/application-card.vue
git commit -m "feat: add application-card component for list grid view"
```

---

### Task 6: Create `application-facets.vue`

**Files:**
- Create: `ui/src/components/application/application-facets.vue`
- Reference: `ui-legacy/public/components/application/application-facets.vue`

- [ ] **Step 1: Create the application facets component**

```vue
<template>
  <div class="d-flex flex-column ga-3">
    <!-- Owner -->
    <v-autocomplete
      v-if="ownerItems.length > 1"
      v-model="owner"
      :items="ownerItems"
      :label="t('owner')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Base application -->
    <v-select
      v-if="baseApplicationItems.length"
      v-model="baseApplication"
      :items="baseApplicationItems"
      :label="t('baseApplication')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Visibility -->
    <v-select
      v-if="visibilityItems.length"
      v-model="visibility"
      :items="visibilityItems"
      :label="t('visibility')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Topics -->
    <v-select
      v-if="topicsItems.length"
      v-model="topics"
      :items="topicsItems"
      :label="t('topics')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Publication sites -->
    <v-select
      v-if="publicationSitesItems.length"
      v-model="publicationSites"
      :items="publicationSitesItems"
      :label="t('publicationSites')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />

    <!-- Requested publication sites -->
    <v-select
      v-if="requestedPublicationSitesItems.length"
      v-model="requestedPublicationSites"
      :items="requestedPublicationSitesItems"
      :label="t('requestedPublicationSites')"
      density="compact"
      variant="outlined"
      hide-details
      clearable
      multiple
    />
  </div>
</template>

<script lang="ts" setup>
const { t } = useI18n()

const props = defineProps<{
  facets: Record<string, { count: number, value: string, [key: string]: any }[]>
}>()

const owner = defineModel<string[]>('owner', { default: () => [] })
const baseApplication = defineModel<string[]>('baseApplication', { default: () => [] })
const visibility = defineModel<string[]>('visibility', { default: () => [] })
const topics = defineModel<string[]>('topics', { default: () => [] })
const publicationSites = defineModel<string[]>('publicationSites', { default: () => [] })
const requestedPublicationSites = defineModel<string[]>('requestedPublicationSites', { default: () => [] })

const facetToItems = (key: string, labelFn?: (v: any) => string) => {
  return computed(() => {
    const values = props.facets[key]
    if (!values?.length) return []
    return values.map(f => ({
      title: (labelFn ? labelFn(f) : f.value) + ` (${f.count})`,
      value: f.value,
    }))
  })
}

const ownerItems = facetToItems('owner', (f) => f.departmentName || f.name || f.value)
const baseApplicationItems = facetToItems('base-application', (f) => f.title || f.value)
const visibilityItems = facetToItems('visibility', (f) => t('visibilityValues.' + f.value))
const topicsItems = facetToItems('topics', (f) => f.title || f.value)
const publicationSitesItems = facetToItems('publicationSites', (f) => f.title || f.value)
const requestedPublicationSitesItems = facetToItems('requestedPublicationSites', (f) => f.title || f.value)
</script>

<i18n lang="yaml">
fr:
  owner: Propriétaire
  baseApplication: Type d'application
  visibility: Visibilité
  topics: Thématiques
  publicationSites: Sites de publication
  requestedPublicationSites: Publications demandées
  visibilityValues:
    public: Public
    private: Privé
    protected: Protégé
en:
  owner: Owner
  baseApplication: Application type
  visibility: Visibility
  topics: Topics
  publicationSites: Publication sites
  requestedPublicationSites: Requested publications
  visibilityValues:
    public: Public
    private: Private
    protected: Protected
</i18n>
```

- [ ] **Step 2: Commit**

```bash
git add ui/src/components/application/application-facets.vue
git commit -m "feat: add application-facets component for sidebar filtering"
```

---

### Task 7: Rewrite `datasets.vue` page

**Files:**
- Modify: `ui/src/pages/datasets.vue`

- [ ] **Step 1: Rewrite the datasets list page**

Replace the entire page with sidebar layout, infinite scroll, facets, grid/list toggle.

```vue
<template>
  <v-container fluid>
    <v-row>
      <!-- Sidebar: facets (desktop only) -->
      <v-col
        v-if="$vuetify.display.mdAndUp"
        style="max-width: 256px; min-width: 256px;"
        class="pr-4"
      >
        <dataset-facets
          :facets="catalog.facets.value"
          v-model:owner="facetOwner"
          v-model:status="facetStatus"
          v-model:draft-status="facetDraftStatus"
          v-model:visibility="facetVisibility"
          v-model:topics="facetTopics"
          v-model:publication-sites="facetPublicationSites"
          v-model:requested-publication-sites="facetRequestedPublicationSites"
          v-model:services="facetServices"
          v-model:concepts="facetConcepts"
        />
      </v-col>

      <!-- Main content -->
      <v-col>
        <!-- Toolbar -->
        <v-row
          align="center"
          class="mb-4"
        >
          <v-col
            cols="12"
            sm="5"
            md="4"
          >
            <v-text-field
              v-model="searchInput"
              :label="t('search')"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
            md="3"
          >
            <v-select
              v-model="sort"
              :label="t('sort')"
              :items="sortItems"
              hide-details
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-spacer />
          <!-- Filter button (mobile) -->
          <v-col
            v-if="$vuetify.display.smAndDown"
            cols="auto"
          >
            <v-btn
              icon="mdi-filter-variant"
              variant="text"
              @click="showFilters = true"
            />
          </v-col>
          <!-- View toggle -->
          <v-col cols="auto">
            <v-btn-toggle
              v-model="viewMode"
              density="compact"
              mandatory
            >
              <v-btn
                value="grid"
                icon="mdi-view-grid"
              />
              <v-btn
                value="list"
                icon="mdi-view-list"
              />
            </v-btn-toggle>
          </v-col>
          <v-col
            v-if="canContribDep"
            cols="auto"
          >
            <v-btn
              color="primary"
              prepend-icon="mdi-plus"
              to="/new-dataset"
            >
              {{ t('newDataset') }}
            </v-btn>
          </v-col>
        </v-row>

        <!-- Results count -->
        <div
          v-if="catalog.totalCount.value > 0"
          class="text-body-2 text-medium-emphasis mb-3"
        >
          {{ t('resultsCount', { count: catalog.totalCount.value }) }}
        </div>

        <!-- Skeleton loader (initial load) -->
        <v-row
          v-if="catalog.loading.value && !catalog.initialized.value"
          class="d-flex align-stretch"
        >
          <v-col
            v-for="i in 12"
            :key="i"
            cols="12"
            sm="6"
            md="4"
            class="d-flex"
          >
            <v-skeleton-loader
              class="w-100"
              height="200"
              type="article"
            />
          </v-col>
        </v-row>

        <!-- Empty state -->
        <v-row
          v-else-if="catalog.initialized.value && !catalog.totalCount.value"
          justify="center"
          class="mt-6"
        >
          <v-col
            cols="auto"
            class="text-center"
          >
            <div class="text-h6">
              {{ q ? t('noResult') : t('noDataset') }}
            </div>
          </v-col>
        </v-row>

        <!-- Grid view -->
        <template v-else-if="viewMode === 'grid'">
          <v-row class="d-flex align-stretch">
            <v-col
              v-for="dataset in catalog.displayedItems.value"
              :key="dataset.id"
              cols="12"
              sm="6"
              md="4"
              class="d-flex"
            >
              <dataset-card
                :dataset="dataset"
                :show-owner="showOwner"
              />
            </v-col>
          </v-row>
        </template>

        <!-- List view -->
        <v-list
          v-else
          lines="two"
        >
          <dataset-list-item
            v-for="dataset in catalog.displayedItems.value"
            :key="dataset.id"
            :dataset="dataset"
            :show-owner="showOwner"
          />
        </v-list>

        <!-- Loading spinner -->
        <div
          v-if="catalog.loading.value && catalog.initialized.value"
          class="d-flex justify-center my-4"
        >
          <v-progress-circular
            indeterminate
            color="primary"
          />
        </div>

        <!-- Infinite scroll sentinel -->
        <div
          v-if="catalog.hasMore.value && !catalog.loading.value"
          v-intersect:quiet="(isIntersecting: boolean) => isIntersecting && catalog.loadMore()"
        />
      </v-col>
    </v-row>

    <!-- Mobile filters dialog -->
    <v-dialog
      v-model="showFilters"
      max-width="400"
    >
      <v-card>
        <v-card-title>{{ t('filters') }}</v-card-title>
        <v-card-text>
          <dataset-facets
            :facets="catalog.facets.value"
            v-model:owner="facetOwner"
            v-model:status="facetStatus"
            v-model:draft-status="facetDraftStatus"
            v-model:visibility="facetVisibility"
            v-model:topics="facetTopics"
            v-model:publication-sites="facetPublicationSites"
            v-model:requested-publication-sites="facetRequestedPublicationSites"
            v-model:services="facetServices"
            v-model:concepts="facetConcepts"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showFilters = false">
            {{ t('close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
// useCatalogList is auto-imported from composables/use-catalog-list.ts

const { t, locale } = useI18n()
const session = useSession()
const account = session.account
const { canContribDep } = usePermissions()

// Search with debounce
const q = useStringSearchParam('q')
const searchInput = ref(q.value || '')
let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { q.value = val || '' }, 300)
})
watch(q, (val) => { if (val !== searchInput.value) searchInput.value = val || '' })

const sort = useStringSearchParam('sort', 'createdAt:-1')
const viewMode = ref(localStorage.getItem('df-datasets-view') || 'grid')
watch(viewMode, (v) => { localStorage.setItem('df-datasets-view', v) })

const showFilters = ref(false)

// Facet filter URL params
const facetOwner = useStringsArraySearchParam('owner')
const facetStatus = useStringsArraySearchParam('status')
const facetDraftStatus = useStringsArraySearchParam('draftStatus')
const facetVisibility = useStringsArraySearchParam('visibility')
const facetTopics = useStringsArraySearchParam('topics')
const facetPublicationSites = useStringsArraySearchParam('publicationSites')
const facetRequestedPublicationSites = useStringsArraySearchParam('requestedPublicationSites')
const facetServices = useStringsArraySearchParam('services')
const facetConcepts = useStringsArraySearchParam('concepts')

// Owner scoping: default to current account unless facet overrides
const ownerParam = computed(() => {
  if (facetOwner.value?.length) return facetOwner.value.join(',')
  const a = account.value
  if (!a) return undefined
  let o = a.type + ':' + a.id
  if (a.department) o += ':' + a.department
  return o
})

const showOwner = computed(() => !!facetOwner.value?.length)

const datasetsQuery = computed(() => {
  const params: Record<string, any> = {
    select: 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,draft.file,draft.originalFile,count,finalizedAt,updatedAt,visibility,owner,draftReason',
    sort: sort.value,
  }
  if (q.value) params.q = q.value
  if (ownerParam.value) params.owner = ownerParam.value
  if (facetStatus.value?.length) params.status = facetStatus.value.join(',')
  if (facetDraftStatus.value?.length) params.draftStatus = facetDraftStatus.value.join(',')
  if (facetVisibility.value?.length) params.visibility = facetVisibility.value.join(',')
  if (facetTopics.value?.length) params.topics = facetTopics.value.join(',')
  if (facetPublicationSites.value?.length) params.publicationSites = facetPublicationSites.value.join(',')
  if (facetRequestedPublicationSites.value?.length) params.requestedPublicationSites = facetRequestedPublicationSites.value.join(',')
  if (facetServices.value?.length) params.services = facetServices.value.join(',')
  if (facetConcepts.value?.length) params.concepts = facetConcepts.value.join(',')
  return params
})

const catalog = useCatalogList<any>({
  fetchUrl: computed(() => $apiPath + '/datasets'),
  query: datasetsQuery,
  facetsFields: 'status,visibility,topics,publicationSites,requestedPublicationSites,services,concepts,owner,draftStatus',
})

const sortItems = computed(() => [
  { title: t('sortCreatedAtDesc'), value: 'createdAt:-1' },
  { title: t('sortCreatedAtAsc'), value: 'createdAt:1' },
  { title: t('sortUpdatedAtDesc'), value: 'updatedAt:-1' },
  { title: t('sortUpdatedAtAsc'), value: 'updatedAt:1' },
  { title: t('sortDataUpdatedAtDesc'), value: 'dataUpdatedAt:-1' },
  { title: t('sortDataUpdatedAtAsc'), value: 'dataUpdatedAt:1' },
  { title: t('sortTitleAsc'), value: 'title:1' },
  { title: t('sortTitleDesc'), value: 'title:-1' },
])
</script>

<i18n lang="yaml">
fr:
  search: Rechercher
  sort: Trier par
  filters: Filtres
  close: Fermer
  newDataset: Nouveau jeu de données
  noDataset: Vous n'avez pas encore créé de jeu de données.
  noResult: Aucun résultat ne correspond à la recherche.
  resultsCount: "{count} jeux de données"
  sortCreatedAtDesc: Création (plus récent)
  sortCreatedAtAsc: Création (plus ancien)
  sortUpdatedAtDesc: Mise à jour (plus récente)
  sortUpdatedAtAsc: Mise à jour (plus ancienne)
  sortDataUpdatedAtDesc: Données mises à jour (plus récentes)
  sortDataUpdatedAtAsc: Données mises à jour (plus anciennes)
  sortTitleAsc: Titre (A → Z)
  sortTitleDesc: Titre (Z → A)
en:
  search: Search
  sort: Sort by
  filters: Filters
  close: Close
  newDataset: New dataset
  noDataset: You haven't created a dataset yet.
  noResult: No result matches the search.
  resultsCount: "{count} datasets"
  sortCreatedAtDesc: Creation (newest)
  sortCreatedAtAsc: Creation (oldest)
  sortUpdatedAtDesc: Update (newest)
  sortUpdatedAtAsc: Update (oldest)
  sortDataUpdatedAtDesc: Data update (newest)
  sortDataUpdatedAtAsc: Data update (oldest)
  sortTitleAsc: Title (A → Z)
  sortTitleDesc: Title (Z → A)
</i18n>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ui && npx vue-tsc --noEmit --pretty 2>&1 | grep -E "datasets|catalog-list|dataset-card|dataset-list-item|dataset-facets" || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/datasets.vue
git commit -m "feat: rewrite datasets list with sidebar facets, infinite scroll, grid/list toggle"
```

---

### Task 8: Rewrite `applications.vue` page

**Files:**
- Modify: `ui/src/pages/applications.vue`

- [ ] **Step 1: Rewrite the applications list page**

Same pattern as datasets but grid only, different facets, different API params.

```vue
<template>
  <v-container fluid>
    <v-row>
      <!-- Sidebar: facets (desktop only) -->
      <v-col
        v-if="$vuetify.display.mdAndUp"
        style="max-width: 256px; min-width: 256px;"
        class="pr-4"
      >
        <application-facets
          :facets="catalog.facets.value"
          v-model:owner="facetOwner"
          v-model:base-application="facetBaseApplication"
          v-model:visibility="facetVisibility"
          v-model:topics="facetTopics"
          v-model:publication-sites="facetPublicationSites"
          v-model:requested-publication-sites="facetRequestedPublicationSites"
        />
      </v-col>

      <!-- Main content -->
      <v-col>
        <!-- Toolbar -->
        <v-row
          align="center"
          class="mb-4"
        >
          <v-col
            cols="12"
            sm="5"
            md="4"
          >
            <v-text-field
              v-model="searchInput"
              :label="t('search')"
              prepend-inner-icon="mdi-magnify"
              clearable
              hide-details
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-col
            cols="12"
            sm="4"
            md="3"
          >
            <v-select
              v-model="sort"
              :label="t('sort')"
              :items="sortItems"
              hide-details
              density="compact"
              variant="outlined"
            />
          </v-col>
          <v-spacer />
          <!-- Filter button (mobile) -->
          <v-col
            v-if="$vuetify.display.smAndDown"
            cols="auto"
          >
            <v-btn
              icon="mdi-filter-variant"
              variant="text"
              @click="showFilters = true"
            />
          </v-col>
          <v-col
            v-if="canContribDep"
            cols="auto"
          >
            <v-btn
              color="primary"
              prepend-icon="mdi-plus"
              to="/new-application"
            >
              {{ t('newApplication') }}
            </v-btn>
          </v-col>
        </v-row>

        <!-- Results count -->
        <div
          v-if="catalog.totalCount.value > 0"
          class="text-body-2 text-medium-emphasis mb-3"
        >
          {{ t('resultsCount', { count: catalog.totalCount.value }) }}
        </div>

        <!-- Skeleton loader -->
        <v-row
          v-if="catalog.loading.value && !catalog.initialized.value"
          class="d-flex align-stretch"
        >
          <v-col
            v-for="i in 12"
            :key="i"
            cols="12"
            sm="6"
            md="4"
            class="d-flex"
          >
            <v-skeleton-loader
              class="w-100"
              height="200"
              type="article"
            />
          </v-col>
        </v-row>

        <!-- Empty state -->
        <v-row
          v-else-if="catalog.initialized.value && !catalog.totalCount.value"
          justify="center"
          class="mt-6"
        >
          <v-col
            cols="auto"
            class="text-center"
          >
            <div class="text-h6">
              {{ q ? t('noResult') : t('noApplication') }}
            </div>
          </v-col>
        </v-row>

        <!-- Grid view -->
        <template v-else>
          <v-row class="d-flex align-stretch">
            <v-col
              v-for="application in catalog.displayedItems.value"
              :key="application.id"
              cols="12"
              sm="6"
              md="4"
              class="d-flex"
            >
              <application-card
                :application="application"
                :show-owner="showOwner"
              />
            </v-col>
          </v-row>
        </template>

        <!-- Loading spinner -->
        <div
          v-if="catalog.loading.value && catalog.initialized.value"
          class="d-flex justify-center my-4"
        >
          <v-progress-circular
            indeterminate
            color="primary"
          />
        </div>

        <!-- Infinite scroll sentinel -->
        <div
          v-if="catalog.hasMore.value && !catalog.loading.value"
          v-intersect:quiet="(isIntersecting: boolean) => isIntersecting && catalog.loadMore()"
        />
      </v-col>
    </v-row>

    <!-- Mobile filters dialog -->
    <v-dialog
      v-model="showFilters"
      max-width="400"
    >
      <v-card>
        <v-card-title>{{ t('filters') }}</v-card-title>
        <v-card-text>
          <application-facets
            :facets="catalog.facets.value"
            v-model:owner="facetOwner"
            v-model:base-application="facetBaseApplication"
            v-model:visibility="facetVisibility"
            v-model:topics="facetTopics"
            v-model:publication-sites="facetPublicationSites"
            v-model:requested-publication-sites="facetRequestedPublicationSites"
          />
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn @click="showFilters = false">
            {{ t('close') }}
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-container>
</template>

<script lang="ts" setup>
// useCatalogList is auto-imported from composables/use-catalog-list.ts

const { t } = useI18n()
const session = useSession()
const account = session.account
const { canContribDep } = usePermissions()

// Search with debounce
const q = useStringSearchParam('q')
const searchInput = ref(q.value || '')
let searchTimeout: ReturnType<typeof setTimeout> | undefined
watch(searchInput, (val) => {
  clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => { q.value = val || '' }, 300)
})
watch(q, (val) => { if (val !== searchInput.value) searchInput.value = val || '' })

const sort = useStringSearchParam('sort', 'createdAt:-1')
const showFilters = ref(false)

// Facet filter URL params
const facetOwner = useStringsArraySearchParam('owner')
const facetBaseApplication = useStringsArraySearchParam('base-application')
const facetVisibility = useStringsArraySearchParam('visibility')
const facetTopics = useStringsArraySearchParam('topics')
const facetPublicationSites = useStringsArraySearchParam('publicationSites')
const facetRequestedPublicationSites = useStringsArraySearchParam('requestedPublicationSites')

const ownerParam = computed(() => {
  if (facetOwner.value?.length) return facetOwner.value.join(',')
  const a = account.value
  if (!a) return undefined
  let o = a.type + ':' + a.id
  if (a.department) o += ':' + a.department
  return o
})

const showOwner = computed(() => !!facetOwner.value?.length)

const applicationsQuery = computed(() => {
  const params: Record<string, any> = {
    select: 'title,description,status,updatedAt,publicationSites,topics,visibility,owner,url',
    sort: sort.value,
  }
  if (q.value) params.q = q.value
  if (ownerParam.value) params.owner = ownerParam.value
  if (facetBaseApplication.value?.length) params['base-application'] = facetBaseApplication.value.join(',')
  if (facetVisibility.value?.length) params.visibility = facetVisibility.value.join(',')
  if (facetTopics.value?.length) params.topics = facetTopics.value.join(',')
  if (facetPublicationSites.value?.length) params.publicationSites = facetPublicationSites.value.join(',')
  if (facetRequestedPublicationSites.value?.length) params.requestedPublicationSites = facetRequestedPublicationSites.value.join(',')
  return params
})

const catalog = useCatalogList<any>({
  fetchUrl: computed(() => $apiPath + '/applications'),
  query: applicationsQuery,
  facetsFields: 'visibility,topics,publicationSites,requestedPublicationSites,base-application,owner',
})

const sortItems = computed(() => [
  { title: t('sortCreatedAtDesc'), value: 'createdAt:-1' },
  { title: t('sortCreatedAtAsc'), value: 'createdAt:1' },
  { title: t('sortUpdatedAtDesc'), value: 'updatedAt:-1' },
  { title: t('sortUpdatedAtAsc'), value: 'updatedAt:1' },
  { title: t('sortTitleAsc'), value: 'title:1' },
  { title: t('sortTitleDesc'), value: 'title:-1' },
])
</script>

<i18n lang="yaml">
fr:
  search: Rechercher
  sort: Trier par
  filters: Filtres
  close: Fermer
  newApplication: Nouvelle application
  noApplication: Vous n'avez pas encore configuré d'application.
  noResult: Aucun résultat ne correspond à la recherche.
  resultsCount: "{count} applications"
  sortCreatedAtDesc: Création (plus récent)
  sortCreatedAtAsc: Création (plus ancien)
  sortUpdatedAtDesc: Mise à jour (plus récente)
  sortUpdatedAtAsc: Mise à jour (plus ancienne)
  sortTitleAsc: Titre (A → Z)
  sortTitleDesc: Titre (Z → A)
en:
  search: Search
  sort: Sort by
  filters: Filters
  close: Close
  newApplication: New application
  noApplication: You haven't configured any application yet.
  noResult: No result matches the search.
  resultsCount: "{count} applications"
  sortCreatedAtDesc: Creation (newest)
  sortCreatedAtAsc: Creation (oldest)
  sortUpdatedAtDesc: Update (newest)
  sortUpdatedAtAsc: Update (oldest)
  sortTitleAsc: Title (A → Z)
  sortTitleDesc: Title (Z → A)
</i18n>
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd ui && npx vue-tsc --noEmit --pretty 2>&1 | grep -E "applications|catalog-list|application-card|application-facets" || echo "No errors"`

- [ ] **Step 3: Commit**

```bash
git add ui/src/pages/applications.vue
git commit -m "feat: rewrite applications list with sidebar facets and infinite scroll"
```

---

### Task 9: E2E tests

**Files:**
- Create: `tests/features/ui/datasets-list.e2e.spec.ts`
- Create: `tests/features/ui/applications-list.e2e.spec.ts`
- Reference: `tests/features/ui/home-nav.e2e.spec.ts` for test setup patterns

- [ ] **Step 1: Check the existing e2e test setup for reference**

Read `tests/features/ui/home-nav.e2e.spec.ts` to understand test setup, API mocking, and navigation patterns used in the project.

- [ ] **Step 2: Write datasets list e2e tests**

Tests should cover:
- Page loads and displays dataset cards
- Search filters results
- Sort changes order
- Grid/list view toggle works
- Infinite scroll loads more items (if enough data)
- Facet filter updates results
- Empty state shown when no results
- "New dataset" button visible for contributors

- [ ] **Step 3: Write applications list e2e tests**

Tests should cover:
- Page loads and displays application cards
- Search filters results
- Sort changes order
- Facet filter updates results
- Empty state shown when no results
- "New application" button visible for contributors

- [ ] **Step 4: Run all e2e tests**

Run: `npx playwright test tests/features/ui/ --reporter=list`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add tests/features/ui/datasets-list.e2e.spec.ts tests/features/ui/applications-list.e2e.spec.ts
git commit -m "test: add e2e tests for datasets and applications list pages"
```

---

### Task 10: Final verification and cleanup

- [ ] **Step 1: Run full TypeScript check**

Run: `cd ui && npx vue-tsc --noEmit --pretty`
Expected: No new errors

- [ ] **Step 2: Run linter**

Run: `npm run lint`
Expected: No new errors (only existing v-html warnings)

- [ ] **Step 3: Run all e2e tests**

Run: `npx playwright test tests/features/ui/ --reporter=list`
Expected: All tests pass

- [ ] **Step 4: Commit any final fixes if needed**
