<template>
  <div>
    <search-filters
      :filter-labels="{'dataset': 'Jeu de données', 'service': 'Service', 'url': 'Application'}"
      :filters="filters"
      :facets="applications && applications.facets"
      type="applications"
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
        <v-row v-if="applications" class="resourcesList">
          <v-col
            v-for="application in applications.results"
            :key="application.id"
            cols="12"
            md="6"
            lg="4"
            xl="3"
          >
            <application-card :application="application" :show-topics="applications.facets.topics.length" />
          </v-col>
        </v-row>
        <search-progress :loading="loading" />
      </v-col>
      <v-col
        v-if="applications && !$vuetify.breakpoint.xsOnly"
        class="pl-2"
        sm="6"
        md="4"
        lg="2"
        xl="2"
      >
        <applications-facets :facets="applications.facets" :facets-values="facetsValues" />
      </v-col>
    </v-row>

    <v-responsive v-if="!hasApplications" height="auto">
      <v-container class="fill-height">
        <v-row align="center">
          <v-col class="text-center">
            <div
              v-if="!filtered"
              class="text-h6"
            >
              Vous n'avez pas encore configuré de visualisation.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
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
  import ApplicationsFacets from '~/components/applications/facets.vue'
  import ApplicationCard from '~/components/applications/card.vue'
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, ApplicationsFacets, ApplicationCard },
    data: () => ({
      applications: null,
      page: 1,
      loading: true,
      filters: {},
      filtered: false,
      facetsValues: {
        visibility: {},
        'base-application': {},
        topics: {},
      },
      lastParams: null,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      plural() {
        return this.applications.count > 1
      },
      size() {
        return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
      },
      hasApplications() {
        return !this.applications || this.applications.count
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
        if (!this.applications) return
        const se = e.target.scrollingElement
        if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.applications.results.length < this.applications.count) {
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
          select: 'title,description,status,topics,errorMessage',
          ...fullFilters,
          facets: 'visibility,base-application,topics',
          sort: 'createdAt:-1',
        }
        if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
          this.lastParams = params
          this.loading = true
          const applications = await this.$axios.$get('api/v1/applications', { params })
          if (append) applications.results.forEach(r => this.applications.results.push(r))
          else this.applications = applications
          this.$store.dispatch('breadcrumbs', [{ text: `${this.applications.count} visualisation${this.plural ? 's' : ''}` }])
          this.filtered = !!this.filters.q || hasFacetFilter
          this.loading = false
        }
      },
    },
  }
</script>
