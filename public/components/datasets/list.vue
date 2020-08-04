<template>
  <div>
    <search-filters
      :filter-labels="{children: 'Jeu de données agrégé'}"
      :filters="filters"
      :facets="datasets && datasets.facets"
      type="datasets"
      @apply="refresh()"
    />

    <v-row v-scroll="onScroll">
      <v-col
        cols="12"
        sm="6"
        md="8"
        lg="10"
        xl="10"
      >
        <v-row v-if="datasets" class="resourcesList">
          <v-col
            v-for="dataset in datasets.results"
            :key="dataset.id"
            cols="12"
            md="6"
            lg="4"
            xl="3"
          >
            <dataset-card :dataset="dataset" />
          </v-col>
        </v-row>
        <search-progress :loading="loading" />
      </v-col>

      <v-col
        v-if="datasets && !$vuetify.breakpoint.xsOnly"
        class="py-0 pl-2"
        sm="6"
        md="4"
        lg="2"
        xl="2"
      >
        <datasets-facets
          :facets="datasets.facets"
          :facets-values="facetsValues"
        />
      </v-col>
    </v-row>

    <v-responsive v-if="!hasDatasets" height="auto">
      <v-container class="fill-height">
        <v-row align="center">
          <v-col class="text-center">
            <div
              v-if="!filtered"
              class="text-h6"
            >
              Vous n'avez pas encore ajouté de jeu de données.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                consulter la documentation
              </nuxt-link> pour en savoir plus.
            </div>
            <div
              v-else
              class="text-h6"
            >
              Aucun résultat ne correspond aux critères de recherche
            </div>
          </v-col>
        </v-row>
      </v-container>
    </v-responsive>
  </div>
</template>

<script>
  import SearchProgress from '~/components/search/progress.vue'
  import SearchFilters from '~/components/search/filters.vue'
  import DatasetsFacets from '~/components/datasets/facets.vue'
  import DatasetCard from '~/components/datasets/card.vue'
  const { mapState, mapGetters } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, DatasetsFacets, DatasetCard },
    data: () => ({
      datasets: null,
      page: 1,
      loading: true,
      filters: {},
      filtered: false,
      facetsValues: {
        status: {},
        visibility: {},
        services: {},
        concepts: {},
        topics: {},
      },
      lastParams: null,
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
    },
    watch: {
      facetsValues: {
        deep: true,
        handler() {
          this.refresh()
        },
      },
    },
    methods: {
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
          const facetFilter = Object.entries(facetValues)
            .filter(([facetValue, valueActive]) => valueActive)
            .map(([facetValue]) => facetValue).join(',')
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
          select: 'title,description,status,topics,isVirtual,isRest,file,count',
          facets: 'status,visibility,services,concepts,topics',
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
        }
      },
    },
  }
</script>
