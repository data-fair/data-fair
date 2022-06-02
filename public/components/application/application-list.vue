<template>
  <v-row>
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-row
          v-if="applications"
          v-scroll="onScroll"
          class="resourcesList"
        >
          <v-col
            v-for="application in applications.results"
            :key="application.id"
            cols="12"
            md="6"
            lg="4"
          >
            <application-card
              :application="application"
              :show-topics="applications.facets.topics.length"
              :show-owner="filters.owner === null"
            />
          </v-col>
        </v-row>
        <search-progress :loading="loading" />

        <v-responsive
          v-if="!hasApplications"
          height="auto"
        >
          <v-container class="fill-height">
            <v-row align="center">
              <v-col class="text-center">
                <div
                  v-if="!filtered"
                  class="text-h6"
                >
                  {{ $t('noApp') }}
                  <!--<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                    consulter la documentation
                  </nuxt-link> pour en savoir plus.-->
                  <layout-wrap-svg
                    :source="graphicSvg"
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

      <layout-navigation-right v-if="$vuetify.breakpoint.lgAndUp">
        <v-list
          v-if="canContribDep"
          dense
          class="list-actions"
        >
          <v-list-item :to="{path: '/new-application'}">
            <v-list-item-icon>
              <v-icon color="primary">
                mdi-plus-circle
              </v-icon>
            </v-list-item-icon>
            <v-list-item-title v-t="'configureApp'" />
          </v-list-item>
        </v-list>
        <template v-if="applications">
          <v-row class="px-2">
            <v-col class="py-0">
              <search-filters
                :filter-labels="{'dataset': $t('dataset'), 'service': $t('service'), 'url': $t('baseApp')}"
                :filters="filters"
                :facets="applications && applications.facets"
                :sorts="sorts"
                type="applications"
                @apply="refresh()"
              />
              <application-facets
                :facets="applications.facets"
                :facets-values="facetsValues"
              />
            </v-col>
          </v-row>
        </template>
      </layout-navigation-right>
      <div
        v-else
        class="actions-buttons"
      >
        <v-btn
          v-if="canContribDep"
          color="primary"
          fab
          small
          :title="$t('configureApp')"
          to="/new-application"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  noApp: Vous n'avez pas encore configuré de visualisation.
  noResult: Aucun résultat ne correspond aux critères de recherche
  configureApp: Configurer une visualisation
  dataset: Jeu de données
  service: Service
  baseApp: Application
  applicationsCount: "aucune visulisation | 1 visualisation | {count} visualisations"
  sortCreatedAtAsc: création plus ancienne
  sortCreatedAtDesc: création plus récente
  sortUpdatedAtAsc: màj plus ancienne
  sortUpdatedAtDesc: màj plus récente
en:
  noApp: You haven't configured any visualization yet.
  noResult: No result matches your search criterias.
  configureApp: Configure a visualization
  dataset: Dataset
  service: Service
  baseApp: Application
  applicationsCount: "no visualization | 1 visualization | {count} visualizations"
  sortCreatedAtAsc: creation older
  sortCreatedAtDesc: creation newer
  sortUpdatedAtAsc: update older
  sortUpdatedAtDesc: update newer
</i18n>

<script>
const { mapState, mapGetters } = require('vuex')

export default {
  data: () => ({
    applications: null,
    page: 1,
    loading: true,
    filters: {},
    filtered: false,
    facetsValues: {
      visibility: [],
      'base-application': [],
      topics: [],
      publicationSites: []
    },
    lastParams: null,
    graphicSvg: require('~/assets/svg/Graphics and charts_Monochromatic.svg?raw')
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env']),
    ...mapGetters(['canContribDep']),
    plural () {
      return this.applications.count > 1
    },
    size () {
      return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
    },
    hasApplications () {
      return !this.applications || this.applications.count
    },
    sorts () {
      return [
        { value: 'createdAt:-1', text: this.$t('sortCreatedAtDesc') },
        { value: 'createdAt:1', text: this.$t('sortCreatedAtAsc') },
        { value: 'updatedAt:-1', text: this.$t('sortUpdatedAtDesc') },
        { value: 'updatedAt:1', text: this.$t('sortUpdatedAtAsc') }
      ]
    }
  },
  watch: {
    facetsValues: {
      deep: true,
      handler () {
        this.refresh()
      }
    }
  },
  mounted () {
    this.filters = { owner: `${this.activeAccount.type}:${this.activeAccount.id}` }
    this.refresh()
  },
  methods: {
    onScroll (e) {
      if (!this.applications) return
      const se = e.target.scrollingElement
      if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.applications.results.length < this.applications.count) {
        this.refresh(true)
      }
    },
    async refresh (append) {
      const fullFilters = { ...this.filters }
      let hasFacetFilter = false
      Object.entries(this.facetsValues).forEach(([facetKey, facetValues]) => {
        if (this.filters.owner !== null && facetKey === 'owner') return
        const facetFilter = facetValues && facetValues.join(',')
        if (facetFilter) {
          hasFacetFilter = true
          fullFilters[facetKey] = facetFilter
        }
      })
      if (append) this.page += 1
      else this.page = 1
      let facets = 'visibility,base-application,topics,publicationSites'
      if (this.filters.owner === null) facets += ',owner'
      const params = {
        size: this.size,
        page: this.page,
        select: 'title,description,status,topics,errorMessage',
        sort: 'createdAt:-1',
        ...fullFilters,
        facets
      }
      if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
        this.lastParams = params
        this.loading = true
        const applications = await this.$axios.$get('api/v1/applications', { params })
        if (append) applications.results.forEach(r => this.applications.results.push(r))
        else this.applications = applications
        this.$store.dispatch('breadcrumbs', [{ text: this.$tc('applicationsCount', this.applications.count) }])
        this.filtered = !!this.filters.q || hasFacetFilter
        this.loading = false

        // if the page is too large for the user to trigger a scroll we append results immediately
        await this.$nextTick()
        await this.$nextTick()
        const html = document.getElementsByTagName('html')
        if (html[0].scrollHeight === html[0].clientHeight && this.applications.results.length < this.applications.count) {
          this.refresh(true)
        }
      }
    }
  }
}
</script>
