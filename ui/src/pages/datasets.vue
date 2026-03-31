<template>
  <v-container data-iframe-height>
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
        xxl="3"
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
    <div
      v-else-if="catalog.initialized.value && !catalog.totalCount.value"
      class="d-flex flex-column align-center justify-center mt-6"
    >
      <template v-if="q">
        <div class="text-title-medium">
          {{ t('noResult') }}
        </div>
      </template>
      <template v-else>
        <v-icon
          size="64"
          color="grey"
          class="mb-4"
        >
          {{ mdiDatabaseOff }}
        </v-icon>
        <div class="text-title-medium">
          {{ t('noDataset') }}
        </div>
        <v-btn
          v-if="canContribDep"
          color="primary"
          :prepend-icon="mdiPlus"
          to="/new-dataset"
          class="mt-4"
        >
          {{ t('createDataset') }}
        </v-btn>
      </template>
    </div>

    <!-- Content: results count + grid/list -->
    <template v-else>
      <!-- Grid view -->
      <v-row
        v-if="viewMode === 'grid'"
        class="d-flex align-stretch"
      >
        <v-col
          v-for="dataset in catalog.displayedItems.value"
          :key="dataset.id"
          cols="12"
          sm="6"
          md="4"
          xxl="3"
          class="d-flex"
        >
          <dataset-card
            :dataset="dataset"
            :show-owner="showOwner"
          />
        </v-col>
      </v-row>

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
    </template>

    <!-- Loading spinner (infinite scroll) -->
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

    <!-- Right navigation: actions, search, sort, facets, view toggle -->
    <df-navigation-right v-if="catalog.initialized.value">
      <!-- New dataset action -->
      <v-list-item
        v-if="canContribDep"
        to="/new-dataset"
        link
      >
        <template #prepend>
          <v-icon
            color="primary"
            :icon="mdiPlusCircle"
          />
        </template>
        {{ t('createDataset') }}
      </v-list-item>

      <!-- Search field -->
      <df-search-field
        v-model="searchInput"
        class="mt-4"
      />

      <!-- Sort select -->
      <v-select
        v-model="sort"
        :label="t('sort')"
        :items="sortItems"
        class="mt-4 mx-4"
        :rounded="false"
      />

      <!-- Facets -->
      <dataset-facets
        v-model:owner="facetOwner"
        v-model:status="facetStatus"
        v-model:draft-status="facetDraftStatus"
        v-model:visibility="facetVisibility"
        v-model:topics="facetTopics"
        v-model:publication-sites="facetPublicationSites"
        v-model:requested-publication-sites="facetRequestedPublicationSites"
        v-model:services="facetServices"
        v-model:concepts="facetConcepts"
        :facets="catalog.facets.value"
        class="mt-4 mx-4"
      />

      <!-- View toggle (below filters) -->
      <div class="d-flex justify-end mx-4 mt-4">
        <v-btn-toggle
          v-model="viewMode"
          density="compact"
          mandatory
        >
          <v-btn
            value="grid"
            :icon="mdiViewGrid"
          />
          <v-btn
            value="list"
            :icon="mdiViewList"
          />
        </v-btn-toggle>
      </div>
    </df-navigation-right>
  </v-container>
</template>

<script lang="ts" setup>
import type { Dataset } from '#api/types'
import { useDisplay } from 'vuetify'
import { mdiDatabaseOff, mdiPlus, mdiPlusCircle, mdiViewGrid, mdiViewList } from '@mdi/js'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import dfSearchField from '@data-fair/lib-vuetify/search-field.vue'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
const { name: breakpointName } = useDisplay()
const session = useSession()
const account = session.account
const { canContribDep } = usePermissions()
const breadcrumbs = useBreadcrumbs()

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

// View mode persisted per user
const viewModeKey = computed(() => {
  const a = account.value
  return a ? `${a.type}:${a.id}:datasets:render-mode` : 'df-datasets-view'
})
const viewMode = ref(localStorage.getItem(viewModeKey.value) || 'grid')
watch(viewMode, (v) => { localStorage.setItem(viewModeKey.value, v) })

// Responsive page size matching legacy breakpoints
const pageSize = computed(() => ({ xs: 12, sm: 12, md: 12, lg: 15, xl: 24, xxl: 24 }[breakpointName.value] || 12))

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

const catalog = useCatalogList<Dataset>({
  fetchUrl: computed(() => $apiPath + '/datasets'),
  query: datasetsQuery,
  facetsFields: 'status,visibility,topics,publicationSites,requestedPublicationSites,services,concepts,owner,draftStatus',
  pageSize,
})

// Breadcrumb updates
watch(() => catalog.totalCount.value, (count) => {
  breadcrumbs.receive({ breadcrumbs: [{ text: t('datasets', { count }) }] })
}, { immediate: true })

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
  sort: Trier par
  createDataset: Créer un jeu de données
  noDataset: Vous n'avez pas encore créé de jeu de données.
  noResult: Aucun résultat ne correspond à la recherche.
  sortCreatedAtDesc: Création (plus récent)
  sortCreatedAtAsc: Création (plus ancien)
  sortUpdatedAtDesc: Mise à jour (plus récente)
  sortUpdatedAtAsc: Mise à jour (plus ancienne)
  sortDataUpdatedAtDesc: Données mises à jour (plus récentes)
  sortDataUpdatedAtAsc: Données mises à jour (plus anciennes)
  sortTitleAsc: Titre (A → Z)
  sortTitleDesc: Titre (Z → A)
  datasets: "{count} jeux de données"
en:
  sort: Sort by
  createDataset: Create a dataset
  noDataset: You haven't created a dataset yet.
  noResult: No result matches the search.
  sortCreatedAtDesc: Creation (newest)
  sortCreatedAtAsc: Creation (oldest)
  sortUpdatedAtDesc: Update (newest)
  sortUpdatedAtAsc: Update (oldest)
  sortDataUpdatedAtDesc: Data update (newest)
  sortDataUpdatedAtAsc: Data update (oldest)
  sortTitleAsc: Title (A → Z)
  sortTitleDesc: Title (Z → A)
  datasets: "{count} datasets"
</i18n>
