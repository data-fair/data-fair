<template>
  <div>
    <search-filters
      :filter-labels="{}"
      :filters="filters"
      :facets="catalogs && catalogs.facets"
      type="catalogs"
      @apply="refresh()"
    />

    <v-container
      v-scroll="onScroll"
      class="pa-0"
      fluid
    >
      <v-row v-if="catalogs" class="resourcesList">
        <v-col
          v-for="catalog in catalogs.results"
          :key="catalog.id"
          cols="12"
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <catalog-card :catalog="catalog" />
        </v-col>
        <search-progress :loading="loading" />
      </v-row>
    </v-container>

    <v-responsive v-if="!hasCatalogs" height="auto">
      <v-container class="fill-height">
        <v-row align="center">
          <v-col class="text-center">
            <div v-if="!filtered" class="text-h6">
              Vous n'avez pas encore ajouté de connecteur vers des catalogues externes.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                consulter la documentation
              </nuxt-link> pour en savoir plus.
            </div>
            <div v-else class="text-h6">
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
  import CatalogCard from '~/components/catalogs/card.vue'

  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, CatalogCard },
    data: () => ({
      catalogs: null,
      page: 1,
      loading: true,
      filters: {},
      filtered: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      plural() {
        return this.catalogs.count > 1
      },
      size() {
        return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
      },
      hasCatalogs() {
        return !this.catalogs || this.catalogs.count
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
        this.loading = true
        if (append) this.page += 1
        else this.page = 1
        const catalogs = await this.$axios.$get('api/v1/catalogs', {
          params:
            { size: this.size, page: this.page, select: 'title,description', ...this.filters, facets: 'owner', sort: 'createdAt:-1' },
        })
        if (append) catalogs.results.forEach(r => this.catalogs.results.push(r))
        else this.catalogs = catalogs
        this.$store.dispatch('breadcrumbs', [{ text: `${this.catalogs.count} ${this.plural ? 'connecteurs configurés' : 'connecteur configuré'}` }])
        this.filtered = this.filters.q !== undefined
        this.loading = false
      },
    },
  }
</script>
