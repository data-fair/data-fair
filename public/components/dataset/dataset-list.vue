<template>
  <v-row>
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <template v-if="$vuetify.breakpoint.mdAndDown">
          <layout-actions-button
            icon="mdi-plus"
          >
            <template #actions>
              <dataset-list-actions />
            </template>
          </layout-actions-button>

          <search-filters
            :filter-labels="{children: $t('childDataset'), owner: $t('owner')}"
            :filters="filters"
            :sorts="sorts"
            type="datasets"
            class="mr-6"
            @apply="filtersInitialized=true; refresh()"
          />
        </template>
        <template v-if="datasets">
          <v-row
            v-if="renderMode === 0"
            v-scroll="onScroll"
            class="resourcesList"
          >
            <v-col
              v-for="dataset in datasets.results"
              :key="dataset.id"
              cols="12"
              md="6"
              lg="4"
            >
              <dataset-card
                :dataset="dataset"
                :show-topics="datasets.facets.topics.length"
                :show-owner="filters.owner === null"
              />
            </v-col>
          </v-row>
          <v-list
            v-if="renderMode === 1"
            v-scroll="onScroll"
            class="mt-2"
          >
            <template v-for="dataset in datasets.results">
              <dataset-list-item
                :key="dataset.id"
                :dataset="dataset"
                :show-topics="datasets.facets.topics.length"
                :show-owner="filters.owner === null"
              />
              <v-divider :key="dataset.id + '-divider'" />
            </template>
          </v-list>
        </template>
        <search-progress :loading="loading" />

        <v-responsive
          v-if="!hasDatasets"
          height="auto"
        >
          <v-container class="fill-height">
            <v-row align="center">
              <v-col class="text-center">
                <div
                  v-if="!filtered"
                  class="text-h6"
                >
                  {{ $t('noDataset') }}
                  <layout-wrap-svg
                    :source="dataSvg"
                    :color="$vuetify.theme.themes.light.primary"
                  />
                </div>
                <div
                  v-else
                  v-t="'noResult'"
                  class="text-h6"
                />
              </v-col>
            </v-row>
          </v-container>
        </v-responsive>
      </v-container>

      <layout-navigation-right v-if="$vuetify.breakpoint.lgAndUp">
        <dataset-list-actions />

        <v-row class="px-2 pt-2">
          <v-col class="py-0">
            <search-filters
              :filter-labels="{children: $t('childDataset'), owner: $t('owner')}"
              :filters="filters"
              :sorts="sorts"
              type="datasets"
              @apply="filtersInitialized=true; refresh()"
            />
            <v-row>
              <dataset-facets
                v-if="datasets"
                :facets="datasets.facets"
                :facets-values="facetsValues"
                :show-shared="filters.shared"
              />
            </v-row>
          </v-col>
        </v-row>

        <v-row class="mr-4">
          <v-spacer />
          <v-btn-toggle
            v-model="renderMode"
            color="primary"
            mandatory
          >
            <v-btn
              small
              icon
            >
              <v-icon small>
                mdi-view-grid
              </v-icon>
            </v-btn>
            <v-btn
              small
              icon
            >
              <v-icon small>
                mdi-format-list-bulleted-square
              </v-icon>
            </v-btn>
          </v-btn-toggle>
        </v-row>
      </layout-navigation-right>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  noDataset: Vous n'avez pas encore ajouté de jeu de données.
  noResult: Aucun résultat ne correspond aux critères de recherche.
  childDataset: Jeu de données agrégé
  sortCreatedAtAsc: création plus ancienne
  sortCreatedAtDesc: création plus récente
  sortUpdatedAtAsc: màj plus ancienne
  sortUpdatedAtDesc: màj plus récente
  sortDataUpdatedAtAsc: données plus ancienne
  sortDataUpdatedAtDesc: données plus récente
  datasets: aucun jeu de données | 1 jeu de données | {count} jeux de données
  owner: Propriétaire
en:
  noDataset: You haven't created a dataset yet.
  noResult: No result matches your search criterias.
  childDataset: Aggregated dataset
  sortCreatedAtAsc: creation older
  sortCreatedAtDesc: creation newer
  sortUpdatedAtAsc: update older
  sortUpdatedAtDesc: update newer
  sortDataUpdatedAtAsc: data older
  sortDataUpdatedAtDesc: data newer
  datasets: no dataset | 1 dataset | {count} datasets
  owner: Owner
</i18n>

<script>
const { mapState, mapGetters } = require('vuex')

export default {
  data: () => ({
    datasets: null,
    page: 1,
    loading: false,
    filters: {},
    filtered: false,
    facetsValues: {
      status: [],
      visibility: [],
      services: [],
      concepts: [],
      topics: [],
      publicationSites: []
    },
    lastParams: null,
    dataSvg: require('~/assets/svg/Data Arranging_Two Color.svg?raw'),
    renderMode: null,
    filtersInitialized: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env']),
    plural () {
      return this.datasets.count > 1
    },
    size () {
      return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
    },
    hasDatasets () {
      return !this.datasets || this.datasets.count
    },
    renderModeKey () {
      return `${this.user.id}:datasets:render-mode`
    },
    sorts () {
      return [
        { value: 'createdAt:-1', text: this.$t('sortCreatedAtDesc') },
        { value: 'createdAt:1', text: this.$t('sortCreatedAtAsc') },
        { value: 'updatedAt:-1', text: this.$t('sortUpdatedAtDesc') },
        { value: 'updatedAt:1', text: this.$t('sortUpdatedAtAsc') },
        { value: 'dataUpdatedAt:-1', text: this.$t('sortDataUpdatedAtDesc') },
        { value: 'dataUpdatedAt:1', text: this.$t('sortDataUpdatedAtAsc') }
      ]
    }
  },
  watch: {
    facetsValues: {
      deep: true,
      handler () {
        this.refresh()
      }
    },
    renderMode (newValue, oldValue) {
      localStorage.setItem(this.renderModeKey, this.renderMode)
      if (oldValue !== null) this.refresh()
    }
  },
  mounted () {
    this.renderMode = Number(localStorage.getItem(this.renderModeKey) || 0)
    if (isNaN(this.renderMode)) this.renderMode = 0
    this.refresh()
  },
  methods: {
    onScroll (e) {
      if (!this.datasets || this.loading) return
      const se = e.target.scrollingElement
      if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.datasets.results.length < this.datasets.count) {
        this.refresh(true)
      }
    },
    async refresh (append) {
      if (!this.filtersInitialized) return
      const fullFilters = { ...this.filters }
      let hasFacetFilter = false
      Object.entries(this.facetsValues).forEach(([facetKey, facetValues]) => {
        const facetFilter = facetValues && facetValues.join(',')
        if (facetFilter) {
          hasFacetFilter = true
          fullFilters[facetKey] = facetFilter
        }
      })
      if (append) this.page += 1
      else this.page = 1
      const params = {
        size: this.size,
        page: this.page,
        select: 'title,description,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt',
        sort: 'createdAt:-1',
        ...fullFilters
      }
      if (!append) params.facets = 'status,visibility,services,concepts,topics,publicationSites,owner'
      if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
        this.lastParams = params
        this.loading = true
        const datasets = await this.$axios.$get('api/v1/datasets', { params })
        if (append) datasets.results.forEach(r => this.datasets.results.push(r))
        else this.datasets = datasets
        this.$store.dispatch('breadcrumbs', [{ text: this.$tc('datasets', datasets.count) }])
        this.filtered = !!this.filters.q || hasFacetFilter
        this.loading = false

        // if the page is too large for the user to trigger a scroll we append results immediately
        await this.$nextTick()
        await this.$nextTick()
        const html = document.getElementsByTagName('html')
        if (html[0].clientHeight >= (html[0].scrollHeight - 200) && this.datasets.results.length < this.datasets.count) {
          this.refresh(true)
        }
      }
    }
  }
}
</script>
