<template>
  <div>
    <search-filters
      :filter-labels="{}"
      :filters="filters"
      :facets="catalogs && catalogs.facets"
      type="catalogs"
      @apply="page = 1; refresh()"
    />
    <search-progress :loading="loading" />

    <v-container class="pa-0" fluid>
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
      </v-row>
    </v-container>

    <v-row v-if="catalogs && catalogs.count > size">
      <v-spacer />
      <v-pagination
        v-model="page"
        circle
        :length="Math.ceil(catalogs.count / size)"
        @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
      />
    </v-row>

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

  const marked = require('marked')
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, CatalogCard },
    data: () => ({
      catalogs: null,
      page: 1,
      marked,
      loading: true,
      filters: {},
      filtered: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      plural() {
        return this.catalogs.count > 1 ? 's' : ''
      },
      size() {
        return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
      },
      hasCatalogs() {
        return !this.catalogs || this.catalogs.count
      },
    },
    methods: {
      async refresh() {
        this.loading = true
        this.catalogs = await this.$axios.$get('api/v1/catalogs', {
          params:
            { size: this.size, page: this.page, select: 'title,description', ...this.filters, facets: 'owner', sort: 'createdAt:-1' },
        })
        this.$store.dispatch('breadcrumbs', [{ text: `${this.catalogs.count} ${this.plural ? 'connecteurs configurés' : 'connecteur configuré'}` }])
        this.filtered = this.filters.q !== undefined
        this.loading = false
      },
    },
  }
</script>
