<template>
  <v-container data-iframe-height>
    <!-- Skeleton loader (initial load) -->
    <v-row
      v-if="!catalog.initialized.value"
      class="d-flex align-stretch"
    >
      <v-col
        v-for="i in 12"
        :key="i"
        cols="12"
        sm="6"
        md="4"
      >
        <v-skeleton-loader
          class="w-100"
          height="200"
          type="article"
        />
      </v-col>
    </v-row>

    <!-- Empty state -->
    <layout-empty-state
      v-else-if="catalog.initialized.value && !catalog.totalCount.value"
      :has-search="!!q"
      :icon="mdiImageMultiple"
      :no-data-text="t('noApplication')"
      :btn-text="t('newApplication')"
      btn-to="/new-application"
    />

    <!-- Content: grid/list -->
    <template v-else>
      <!-- Grid view -->
      <v-row
        v-if="viewMode === 'grid'"
        class="d-flex align-stretch"
      >
        <v-col
          v-for="application in catalog.displayedItems.value"
          :key="application.id"
          cols="12"
          sm="6"
          md="4"
        >
          <application-card :application="application" />
        </v-col>
        <template v-if="catalog.loading.value && catalog.initialized.value">
          <v-col
            v-for="i in 12"
            :key="`skeleton-${i}`"
            cols="12"
            sm="6"
            md="4"
          >
            <v-skeleton-loader
              class="w-100"
              height="200"
              type="article"
            />
          </v-col>
        </template>
      </v-row>

      <!-- List view -->
      <v-list
        v-else
        lines="two"
      >
        <application-list-item
          v-for="application in catalog.displayedItems.value"
          :key="application.id"
          :application="application"
        />
        <template v-if="catalog.loading.value && catalog.initialized.value">
          <v-skeleton-loader
            v-for="i in 12"
            :key="`skeleton-${i}`"
            type="list-item-two-line"
          />
        </template>
      </v-list>
    </template>

    <!-- Infinite scroll sentinel -->
    <div
      v-if="catalog.hasMore.value && !catalog.loading.value"
      v-intersect="(isIntersecting: boolean) => isIntersecting && catalog.loadMore()"
    />

    <!-- Right navigation: actions, search, sort, facets, view toggle -->
    <df-navigation-right v-if="catalog.initialized.value">
      <!-- New application action -->
      <v-list-item
        v-if="canContribDep"
        to="/new-application"
        link
      >
        <template #prepend>
          <v-icon
            color="primary"
            :icon="mdiPlusCircle"
          />
        </template>
        {{ t('newApplication') }}
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
        :clearable="false"
        class="mt-4 mx-4"
        rounded="md"
      />

      <!-- Super admin toggle -->
      <v-switch
        v-if="session.state.user?.adminMode"
        v-model="showAllToggle"
        color="admin"
        class="mt-4 mx-4 text-admin"
        :label="t('showAll')"
        hide-details
      />

      <!-- Facets -->
      <application-facets
        v-model:owner="facetOwner"
        v-model:base-application="facetBaseApplication"
        v-model:visibility="facetVisibility"
        v-model:topics="facetTopics"
        v-model:publication-sites="facetPublicationSites"
        v-model:requested-publication-sites="facetRequestedPublicationSites"
        :facets="catalog.facets.value"
        :show-all="showAll === 'true'"
        :account="account"
        class="mt-4 mx-4"
      />

      <!-- View toggle -->
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

<script setup lang="ts">
import type { Application } from '#api/types'
import { mdiImageMultiple, mdiPlusCircle, mdiViewGrid, mdiViewList } from '@mdi/js'
import dfNavigationRight from '@data-fair/lib-vuetify/navigation-right.vue'
import dfSearchField from '@data-fair/lib-vuetify/search-field.vue'
import { useBreadcrumbs } from '~/composables/layout/use-breadcrumbs'

const { t } = useI18n()
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
  return a ? `${a.type}:${a.id}:applications:render-mode` : 'df-applications-view'
})
const viewMode = ref(localStorage.getItem(viewModeKey.value) || 'grid')
watch(viewMode, (v) => { localStorage.setItem(viewModeKey.value, v) })

// Facet filter URL params
const facetOwner = useStringsArraySearchParam('owner')
const facetBaseApplication = useStringsArraySearchParam('base-application')
const facetVisibility = useStringsArraySearchParam('visibility')
const facetTopics = useStringsArraySearchParam('topics')
const facetPublicationSites = useStringsArraySearchParam('publicationSites')
const facetRequestedPublicationSites = useStringsArraySearchParam('requestedPublicationSites')

// Include shared applications for a given owner
const shared = useStringSearchParam('shared')

// Super admin: show all applications toggle
const showAll = useStringSearchParam('showAll')
const showAllToggle = computed({
  get: () => showAll.value === 'true',
  set: (v: boolean) => { showAll.value = v ? 'true' : '' }
})

// Owner scoping: default to current account unless facet overrides
const ownerParam = computed(() => {
  if (facetOwner.value?.length) return facetOwner.value.join(',')
  if (showAll.value === 'true') return undefined
  const a = account.value
  if (!a) return undefined
  let o = a.type + ':' + a.id
  if (a.department) o += ':' + a.department
  return o
})

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
  if (shared.value) params.shared = shared.value
  return params
})

const catalog = useCatalogList<Application>({
  fetchUrl: computed(() => $apiPath + '/applications'),
  query: applicationsQuery,
  facetsFields: 'visibility,topics,publicationSites,requestedPublicationSites,base-application,owner',
})

// Breadcrumb updates
watch(() => catalog.totalCount.value, (count) => {
  breadcrumbs.receive({ breadcrumbs: [{ text: t('applications', { count }) }] })
}, { immediate: true })

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
  showAll: Voir toutes les applications
  sort: Trier par
  newApplication: Créer une nouvelle application
  noApplication: Vous n'avez pas encore configuré d'application.
  applications: "{count} applications"
  sortCreatedAtDesc: Création (plus récent)
  sortCreatedAtAsc: Création (plus ancien)
  sortUpdatedAtDesc: Mise à jour (plus récente)
  sortUpdatedAtAsc: Mise à jour (plus ancienne)
  sortTitleAsc: Titre (A → Z)
  sortTitleDesc: Titre (Z → A)
en:
  showAll: Show all applications
  sort: Sort by
  newApplication: Create a new application
  noApplication: You haven't configured any application yet.
  applications: "{count} applications"
  sortCreatedAtDesc: Creation (newest)
  sortCreatedAtAsc: Creation (oldest)
  sortUpdatedAtDesc: Update (newest)
  sortUpdatedAtAsc: Update (oldest)
  sortTitleAsc: Title (A → Z)
  sortTitleDesc: Title (Z → A)
</i18n>
