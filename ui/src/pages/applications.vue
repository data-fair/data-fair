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
          v-model:owner="facetOwner"
          v-model:base-application="facetBaseApplication"
          v-model:visibility="facetVisibility"
          v-model:topics="facetTopics"
          v-model:publication-sites="facetPublicationSites"
          v-model:requested-publication-sites="facetRequestedPublicationSites"
          :facets="catalog.facets.value"
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
            v-model:owner="facetOwner"
            v-model:base-application="facetBaseApplication"
            v-model:visibility="facetVisibility"
            v-model:topics="facetTopics"
            v-model:publication-sites="facetPublicationSites"
            v-model:requested-publication-sites="facetRequestedPublicationSites"
            :facets="catalog.facets.value"
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
import type { Application } from '#api/types'

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

const catalog = useCatalogList<Application>({
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
