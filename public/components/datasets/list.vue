<template>
  <div>
    <search-filters
      :filter-labels="{children: 'Jeu de données agrégé'}"
      :filters="filters"
      :facets="datasets && datasets.facets"
      type="datasets"
      @apply="page = 1; refresh()"
    />
    <search-progress :loading="loading" />

    <v-row>
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

    <v-row v-if="datasets && datasets.count && datasets.count > size">
      <v-spacer />
      <v-pagination
        v-model="page"
        circle
        :length="Math.ceil(datasets.count / size)"
        @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
      />
      <v-spacer />
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
        return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
      },
      hasDatasets() {
        return !this.datasets || this.datasets.count
      },
    },
    watch: {
      facetsValues: {
        deep: true,
        handler() {
          this.page = 1
          this.refresh()
        },
      },
    },
    methods: {
      async refresh() {
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
        const params = {
          size: this.size,
          page: this.page,
          select: 'title,description,status,topics',
          facets: 'status,visibility,services,concepts,topics',
          sort: 'createdAt:-1',
          ...fullFilters,
        }
        if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
          this.lastParams = params
          this.loading = true
          this.datasets = await this.$axios.$get('api/v1/datasets', { params })
          this.$store.dispatch('breadcrumbs', [{ text: `${this.datasets.count} ${this.plural ? 'jeux' : 'jeu'} de données` }])
          this.filtered = !!this.filters.q || hasFacetFilter
          this.loading = false
        }
      },
    },
  }
</script>
