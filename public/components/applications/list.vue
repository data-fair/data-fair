<template>
  <div>
    <h3
      v-if="applications"
      class="display-1"
    >
      {{ applications.count }} configuration{{ plural }} d'application{{ plural }}
    </h3>

    <search-filters
      :filter-labels="{'dataset': 'Jeu de données', 'service': 'Service', 'url': 'Application de base'}"
      :filters="filters"
      :facets="applications && applications.facets"
      type="applications"
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
        <v-container class="pa-0" fluid>
          <v-row v-if="applications" class="resourcesList">
            <v-col
              v-for="application in applications.results"
              :key="application.id"
              cols="12"
              md="6"
              lg="4"
              xl="3"
            >
              <v-card
                height="100%"
                :to="`/application/${application.id}/description`"
                outlined
              >
                <v-card-title>
                  <span>{{ application.title || application.id }}
                    <v-chip
                      v-for="topic of application.topics"
                      :key="topic.id"
                      small
                      outlined
                      :color="topic.color || 'default'"
                      class="ml-3"
                      style="font-weight: bold"
                    >
                      {{ topic.title }}
                    </v-chip>
                  </span>
                </v-card-title>
                <v-divider />
                <v-img
                  :src="`${application.href}/capture`"
                  height="240px"
                />
                <v-divider />
                <v-card-text
                  style="max-height:160px;overflow: hidden; margin-bottom: 40px;"
                  v-html="marked($options.filters.truncate(application.description || '', 200))"
                />

                <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
                  <owner-short :owner="application.owner" />
                  &nbsp;<v-chip
                    small
                    :color="application.visibility === 'public' ? 'primary' : 'accent'"
                    text-color="white"
                  >
                    {{ {public: 'Public', private: 'Privé', protected: 'Protégé'}[application.visibility] }}
                  </v-chip>
                  <template v-if="application.status === 'error'">
                    <v-spacer />
                    <span><v-icon color="red">mdi-alert</v-icon>&nbsp;En erreur</span>
                  </template>
                </v-card-actions>
              </v-card>
            </v-col>
          </v-row>
        </v-container>
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

    <v-row v-if="applications && applications.count && applications.count > size">
      <v-spacer />
      <v-pagination
        v-model="page"
        :length="Math.ceil(applications.count / size)"
        @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
      />
    </v-row>

    <v-responsive
      v-if="!hasApplications"
      height="auto"
    >
      <v-container class="fill-height">
        <v-row align="center">
          <v-col class="text-center">
            <div
              v-if="!filtered"
              class="headline"
            >
              Vous n'avez pas encore configuré d'applications.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
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
  import SearchProgress from '~/components/search/progress.vue'
  import SearchFilters from '~/components/search/filters.vue'
  import ApplicationsFacets from './facets.vue'
  import OwnerShort from '~/components/owners/short.vue'
  const marked = require('marked')
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, ApplicationsFacets, OwnerShort },
    data: () => ({
      applications: null,
      page: 1,
      marked,
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
        return this.applications.count > 1 ? 's' : ''
      },
      size() {
        return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
      },
      hasApplications() {
        return !this.applications || this.applications.count
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
          ...fullFilters,
          facets: 'visibility,base-application,topics',
          sort: 'createdAt:-1',
        }
        if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
          this.lastParams = params
          this.loading = true
          this.applications = await this.$axios.$get('api/v1/applications', { params })
          this.filtered = !!this.filters.q || hasFacetFilter
          this.loading = false
        }
      },
    },
  }
</script>
