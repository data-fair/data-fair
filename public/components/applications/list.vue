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
              sm="12"
              md="6"
              lg="4"
              xl="3"
            >
              <v-card height="100%" :to="`/application/${application.id}/description`">
                <v-card-title>
                  {{ application.title || application.id }}
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
                  <span v-if="application.owner.type === 'user'"><v-icon>mdi-account</v-icon>&nbsp;{{ application.owner.name }}</span>
                  <span v-if="application.owner.type === 'organization'"><v-icon>mdi-account-group</v-icon>&nbsp;{{ application.owner.name }}<span v-if="application.owner.role"> ({{ application.owner.role }})</span></span>
                  &nbsp;<v-chip
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
  const marked = require('marked')
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, ApplicationsFacets },
    data: () => ({
      applications: null,
      page: 1,
      marked,
      loading: true,
      filters: {},
      filtered: false,
      facetsValues: {
        owner: {},
        visibility: {},
        'base-application': {},
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
        return !this.applications || (this.user && this.applications.facets.owner.filter(f => (f.value.type === 'user' && f.value.id === this.user.id) || ((f.value.type === 'organization' && (this.user.organizations || []).map(o => o.id).includes(f.value.id)))).length)
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
    created() {
      if (!this.user) return
      if (this.user.organization) this.$set(this.facetsValues.owner, `organization:${this.user.organization.id}`, true)
      else this.$set(this.facetsValues.owner, `user:${this.user.id}`, true)
    },
    methods: {
      async refresh() {
        const fullFilters = { ...this.filters }
        Object.entries(this.facetsValues).forEach(([facetKey, facetValues]) => {
          const facetFilter = Object.entries(facetValues)
            .filter(([facetValue, valueActive]) => valueActive)
            .map(([facetValue]) => facetValue).join(',')
          if (facetFilter) fullFilters[facetKey] = facetFilter
        })
        const params = {
          size: this.size,
          page: this.page,
          select: 'title,description,status',
          ...fullFilters,
          facets: 'owner,visibility,base-application',
          sort: 'createdAt:-1',
        }
        if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
          this.lastParams = params
          this.loading = true
          this.applications = await this.$axios.$get('api/v1/applications', { params })
          this.filtered = this.filters.q !== undefined
          this.loading = false
        }
      },
    },
  }
</script>
