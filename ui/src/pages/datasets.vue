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
