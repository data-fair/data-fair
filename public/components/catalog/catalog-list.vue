<template>
  <v-row>
    <v-col :style="$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
        <v-subheader class="px-0 pr-12 mb-2">
          {{ $t('description') }}
        </v-subheader>

        <v-row
          v-if="catalogs"
          v-scroll="onScroll"
          class="resourcesList"
        >
          <v-col
            v-for="catalog in catalogs.results"
            :key="catalog.id"
            cols="12"
            md="6"
            lg="4"
          >
            <catalog-card
              :catalog="catalog"
              :show-owner="filters.owner === null"
            />
          </v-col>
        </v-row>
        <search-progress :loading="loading" />

        <v-responsive
          v-if="!hasCatalogs"
          height="auto"
        >
          <v-container class="fill-height">
            <v-row align="center">
              <v-col class="text-center">
                <div
                  v-if="!filtered"
                  class="text-h6"
                >
                  <!--<br>
                  Vous n'avez pas encore ajouté de connecteur vers des catalogues externes.-->
                  <!--<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                    consulter la documentation
                  </nuxt-link> pour en savoir plus.-->
                  <layout-wrap-svg
                    :source="wwwSvg"
                    :color="$vuetify.theme.themes.light.primary"
                  />
                </div>
                <div
                  v-else
                  v-t="'noMatch'"
                  class="text-h6"
                />
              </v-col>
            </v-row>
          </v-container>
        </v-responsive>
      </v-container>

      <layout-navigation-right v-if="$vuetify.breakpoint.lgAndUp">
        <v-list
          v-if="canAdmin"
          dense
          class="list-actions"
        >
          <v-list-item @click="importCatalogSheet = true">
            <v-list-item-icon>
              <v-icon color="primary">
                mdi-plus-circle
              </v-icon>
            </v-list-item-icon>
            <v-list-item-title v-t="'configureCatalog'" />
          </v-list-item>
        </v-list>
        <template v-if="catalogs">
          <v-row class="px-2">
            <v-col class="py-0">
              <search-filters
                :filter-labels="{}"
                :filters="filters"
                :facets="catalogs && catalogs.facets"
                type="catalogs"
                @apply="refresh()"
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
          v-if="canAdmin"
          color="primary"
          fab
          small
          :title="$t('configureCatalog')"
          @click="importCatalogSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div class="text-center">
        <v-bottom-sheet v-model="importCatalogSheet">
          <catalog-import
            v-if="importCatalogSheet"
            :init-catalog="importCatalog"
            @cancel="importCatalogSheet = false"
          />
        </v-bottom-sheet>
      </div>
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  description: Cette page vous permet de gérer vos connexions avec des catalogues externes. Ces connexions permettent de publier à la demande des informations sur les jeux de données et les visualisations que vous créez.
  noMatch: Aucun résultat ne correspond aux critères de recherche
  configureCatalog: Configurer un catalogue
en:
  description: This page lets you manage connections to external catalogs. These connections will let you publish metadata about the datasets and visualizations you create.
  noMatch: No result matches your search
  configureCatalog: Configure a catalog
</i18n>

<script>
const { mapState, mapGetters } = require('vuex')

export default {
  data () {
    return {
      catalogs: null,
      page: 1,
      loading: true,
      filters: {},
      filtered: false,
      importCatalogSheet: !!this.$route.query.import,
      lastParams: null,
      wwwSvg: require('~/assets/svg/World wide web_Two Color.svg?raw')
    }
  },
  computed: {
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    ...mapState(['env']),
    ...mapGetters(['canAdmin']),
    plural () {
      return this.catalogs.count > 1
    },
    size () {
      return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
    },
    hasCatalogs () {
      return !this.catalogs || this.catalogs.count
    },
    importCatalog () {
      return this.$route.query.import
    }
  },
  created () {
    this.filters = { owner: `${this.activeAccount.type}:${this.activeAccount.id}` }
    this.refresh()
  },
  methods: {
    onScroll (e) {
      if (!this.datasets) return
      const se = e.target.scrollingElement
      if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.datasets.results.length < this.datasets.count) {
        this.refresh(true)
      }
    },
    async refresh (append) {
      if (append) this.page += 1
      else this.page = 1
      const params = {
        size: this.size,
        page: this.page,
        select: 'title,description',
        ...this.filters,
        facets: 'owner',
        sort: 'createdAt:-1',
        html: 'true'
      }
      if (JSON.stringify(params) !== JSON.stringify(this.lastParams)) {
        this.lastParams = params
        this.loading = true
        const catalogs = await this.$axios.$get('api/v1/catalogs', { params })
        if (append) catalogs.results.forEach(r => this.catalogs.results.push(r))
        else this.catalogs = catalogs
        this.$store.dispatch('breadcrumbs', [{ text: `${this.catalogs.count} ${this.plural ? 'catalogues configurés' : 'catalogue configuré'}` }])
        this.filtered = this.filters.q !== undefined
        this.loading = false

        // if the page is too large for the user to trigger a scroll we append results immediately
        await this.$nextTick()
        await this.$nextTick()
        const html = document.getElementsByTagName('html')
        if (html[0].scrollHeight === html[0].clientHeight && this.catalogs.results.length < this.catalogs.count) {
          this.refresh(true)
        }
      }
    }
  }
}
</script>
