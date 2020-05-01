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

    <v-container
      class="pa-0"
      fluid
      grid-list-lg
    >
      <v-row
        v-if="catalogs"

        class="resourcesList"
      >
        <v-col
          v-for="catalog in catalogs.results"
          :key="catalog.id"
          sm="12"
          md="6"
          lg="4"
          xl="3"
        >
          <v-card height="100%">
            <v-card-title
              primary-title
              style="height:25%"
            >
              <nuxt-link :to="`/catalog/${catalog.id}/description`">
                {{ catalog.title || catalog.id }}
              </nuxt-link>
            </v-card-title>
            <v-card-text
              style="height:50%;min-height:80px"
              v-html="marked($options.filters.truncate(catalog.description || '', 200))"
            />
            <v-card-actions style="height:25%">
              <span v-if="catalog.owner.type === 'user'">&nbsp;<v-icon>mdi-account</v-icon>{{ catalog.owner.name }}</span>
              <span v-if="catalog.owner.type === 'organization'">&nbsp;<v-icon>mdi-account-group</v-icon>{{ catalog.owner.name }}<span v-if="catalog.owner.role"> ({{ catalog.owner.role }})</span></span>
              &nbsp;<v-chip
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

    <v-row
      v-if="catalogs && catalogs.count"
    >
      <v-spacer /><v-pagination
        v-model="page"
        :length="Math.ceil(catalogs.count / size)"
        @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
      />
    </v-row>

    <v-responsive
      v-if="!hasCatalogs"
      height="auto"
    >
      <v-container class="fill-height">
        <v-row align="center">
          <v-col class="text-center">
            <div
              v-if="!filtered"
              class="headline"
            >
              Vous n'avez pas encore ajouté de catalogues externes.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                consulter la documentation
              </nuxt-link> pour en savoir plus.
            </div>
            <div
              v-else
              class="headline"
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
  import SearchProgress from './search/progress.vue'
  import SearchFilters from './search/filters.vue'
  const marked = require('marked')
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters },
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
        return !this.catalogs || (this.user && this.catalogs.facets.owner.filter(f => (f.value.type === 'user' && f.value.id === this.user.id) || ((f.value.type === 'organization' && (this.user.organizations || []).map(o => o.id).includes(f.value.id)))).length)
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
