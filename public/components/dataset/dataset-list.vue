<template>
  <v-row>
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row v-if="this.$vuetify.breakpoint.lgAndUp">
          <v-btn
            v-if="renderMode !== 'list'"
            fab
            x-small
            fixed
            color="primary"
            style="right:240px;top:52px;z-index:10;"
            @click="setRenderMode('list')"
          >
            <v-icon>mdi-format-list-bulleted-square</v-icon>
          </v-btn>
          <v-btn
            v-if="renderMode !== 'cards'"
            fab
            x-small
            fixed
            color="primary"
            style="right:240px;top:52px;z-index:10;"
            @click="setRenderMode('cards')"
          >
            <v-icon>mdi-cards-variant</v-icon>
          </v-btn>
        </v-row>
        <template v-if="datasets">
          <v-row
            v-if="renderMode === 'cards'"
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
            v-if="renderMode === 'list'"
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

        <v-responsive v-if="!hasDatasets" height="auto">
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

      <layout-navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
        <dataset-list-actions />
        <template v-if="datasets">
          <v-row class="px-2">
            <v-col class="py-0">
              <search-filters
                :filter-labels="{children: $t('childDataset')}"
                :filters="filters"
                :facets="datasets && datasets.facets"
                :sorts="sorts"
                type="datasets"
                @apply="refresh()"
              />
              <dataset-facets
                :facets="datasets.facets"
                :facets-values="facetsValues"
              />
            </v-col>
          </v-row>
        </template>
      </layout-navigation-right>
      <layout-actions-button v-else icon="mdi-plus">
        <template v-slot:actions>
          <dataset-list-actions />
        </template>
      </layout-actions-button>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  noDataset: Vous n'avez pas encore ajouté de jeu de données.
  noResult: Aucun résultat ne correspond aux critères de recherche.
  childDataset: Jeu de données agrégé
  sortCreatedAtAsc: Création plus ancienne
  sortCreatedAtDesc: Création plus récente
  sortUpdatedAtAsc: Màj plus ancienne
  sortUpdatedAtDesc: Màj plus récente
  sortDataUpdatedAtAsc: Données plus ancienne
  sortDataUpdatedAtDesc: Données plus récente
en:
  noDataset: You haven't created a dataset yet.
  noResult: No result matches your search criterias.
  childDataset: Aggregated dataset
  sortCreatedAtAsc: Creation older
  sortCreatedAtDesc: Creation newer
  sortUpdatedAtAsc: Update older
  sortUpdatedAtDesc: Update newer
  sortDataUpdatedAtAsc: Data older
  sortDataUpdatedAtDesc: Data newer
</i18n>

<script>
  const { mapState, mapGetters } = require('vuex')

  export default {
    data: () => ({
      datasets: null,
      page: 1,
      loading: true,
      filters: {},
      filtered: false,
      facetsValues: {
        status: [],
        visibility: [],
        services: [],
        concepts: [],
        topics: [],
        publicationSites: [],
      },
      lastParams: null,
      dataSvg: require('~/assets/svg/Data Arranging_Two Color.svg?raw'),
      renderMode: null,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapGetters('session', ['activeAccount']),
      ...mapState(['env']),
      plural() {
        return this.datasets.count > 1
      },
      size() {
        return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
      },
      hasDatasets() {
        return !this.datasets || this.datasets.count
      },
      renderModeKey() {
        return `${this.user.id}:datasets:render-mode`
      },
      sorts() {
        return [
          { value: 'createdAt:-1', text: this.$t('sortCreatedAtDesc') },
          { value: 'createdAt:1', text: this.$t('sortCreatedAtAsc') },
          { value: 'updatedAt:-1', text: this.$t('sortUpdatedAtDesc') },
          { value: 'updatedAt:1', text: this.$t('sortUpdatedAtAsc') },
          { value: 'dataUpdatedAt:-1', text: this.$t('sortDataUpdatedAtDesc') },
          { value: 'dataUpdatedAt:1', text: this.$t('sortDataUpdatedAtAsc') },
        ]
      },
    },
    watch: {
      facetsValues: {
        deep: true,
        handler() {
          this.refresh()
        },
      },
    },
    mounted() {
      this.filters = { owner: `${this.activeAccount.type}:${this.activeAccount.id}` }
      this.renderMode = localStorage.getItem(this.renderModeKey) || 'cards'
      this.refresh()
    },
    methods: {
      setRenderMode(renderMode) {
        this.renderMode = renderMode
        localStorage.setItem(this.renderModeKey, this.renderMode)
      },
      onScroll(e) {
        if (!this.datasets) return
        const se = e.target.scrollingElement
        if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.datasets.results.length < this.datasets.count) {
          this.refresh(true)
        }
      },
      async refresh(append) {
        const fullFilters = { ...this.filters }
        let hasFacetFilter = false
        Object.entries(this.facetsValues).forEach(([facetKey, facetValues]) => {
          if (this.filters.owner !== null && facetKey === 'owner') return
          /* const facetFilter = Object.entries(facetValues)
            .filter(([facetValue, valueActive]) => valueActive)
            .map(([facetValue]) => facetValue).join(',') */
          const facetFilter = facetValues && facetValues.join(',')
          if (facetFilter) {
            hasFacetFilter = true
            fullFilters[facetKey] = facetFilter
          }
        })
        if (append) this.page += 1
        else this.page = 1
        let facets = 'status,visibility,services,concepts,topics,publicationSites'
        if (this.filters.owner === null) facets += ',owner'
        const params = {
          size: this.size,
          page: this.page,
          select: 'title,description,status,topics,isVirtual,isRest,file,count,finalizedAt',
          facets,
          sort: 'createdAt:-1',
          ...fullFilters,
        }
        if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
          this.lastParams = params
          this.loading = true
          const datasets = await this.$axios.$get('api/v1/datasets', { params })
          if (append) datasets.results.forEach(r => this.datasets.results.push(r))
          else this.datasets = datasets
          this.$store.dispatch('breadcrumbs', [{ text: `${this.datasets.count} ${this.plural ? 'jeux' : 'jeu'} de données` }])
          this.filtered = !!this.filters.q || hasFacetFilter
          this.loading = false

          // if the page is too large for the user to trigger a scroll we append results immediately
          await this.$nextTick()
          await this.$nextTick()
          const html = document.getElementsByTagName('html')
          if (html[0].scrollHeight === html[0].clientHeight && this.datasets.results.length < this.datasets.count) {
            this.refresh(true)
          }
        }
      },
    },
  }
</script>
