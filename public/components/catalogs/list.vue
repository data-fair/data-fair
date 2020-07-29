<template>
  <div>
    <h3
      v-if="catalogs"
      class="display-1"
    >
      {{ catalogs.count }} catalogue{{ plural }} configuré{{ plural }}
    </h3>

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
          <v-card
            height="100%"
            :to="`/catalog/${catalog.id}/description`"
            outlined
          >
            <v-card-title>
              {{ catalog.title || catalog.id }}
            </v-card-title>
            <v-card-text
              style="min-height:60px;max-height:160px;overflow:hidden;margin-bottom:40px;"
              v-html="marked($options.filters.truncate(catalog.description || '', 200))"
            />
            <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
              <owner-short :owner="catalog.owner" />
              &nbsp;<v-chip
                small
                :color="catalog.public ? 'primary' : 'accent'"
                text-color="white"
              >
                {{ catalog.public ? 'Public' : 'Privé' }}
              </v-chip>
            </v-card-actions>
          </v-card>
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
            <div v-if="!filtered" class="headline">
              Vous n'avez pas encore ajouté de connecteur vers des catalogues externes.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                consulter la documentation
              </nuxt-link> pour en savoir plus.
            </div>
            <div v-else class="headline">
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
  import OwnerShort from '~/components/owners/short.vue'
  const marked = require('marked')
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, OwnerShort },
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
        this.filtered = this.filters.q !== undefined
        this.loading = false
      },
    },
  }
</script>
