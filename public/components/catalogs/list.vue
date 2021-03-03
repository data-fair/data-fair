<template>
  <v-row>
    <v-col :style="this.$vuetify.breakpoint.lgAndUp ? 'padding-right:256px;' : ''">
      <v-container class="py-0">
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
            <catalog-card :catalog="catalog" />
          </v-col>
        </v-row>
        <search-progress :loading="loading" />

        <v-responsive v-if="!hasCatalogs" height="auto">
          <v-container class="fill-height">
            <v-row align="center">
              <v-col class="text-center">
                <div v-if="!filtered" class="text-h6">
                  {{ $t('pages.catalogs.description') }}
                  <!--<br>
                  Vous n'avez pas encore ajouté de connecteur vers des catalogues externes.-->
                  <!--<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">
                    consulter la documentation
                  </nuxt-link> pour en savoir plus.-->
                  <wrap-svg
                    :source="wwwSvg"
                    :color="$vuetify.theme.themes.light.primary"
                  />
                </div>
                <div v-else class="text-h6">
                  Aucun résultat ne correspond aux critères de recherche
                </div>
              </v-col>
            </v-row>
          </v-container>
        </v-responsive>
      </v-container>

      <navigation-right v-if="this.$vuetify.breakpoint.lgAndUp">
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
            <v-list-item-title>Configurer un catalogue</v-list-item-title>
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
      </navigation-right>

      <div v-else class="actions-buttons">
        <v-btn
          v-if="canAdmin"
          color="primary"
          fab
          small
          title="Configurer un catalogue"
          @click="importCatalogSheet = true"
        >
          <v-icon>mdi-plus</v-icon>
        </v-btn>
      </div>

      <div class="text-center">
        <v-bottom-sheet v-model="importCatalogSheet">
          <import-catalog
            v-if="importCatalogSheet"
            :init-catalog="importCatalog"
            @cancel="importCatalogSheet = false"
          />
        </v-bottom-sheet>
      </div>
    </v-col>
  </v-row>
</template>

<script>
  import ImportCatalog from '~/components/catalogs/import.vue'
  import SearchProgress from '~/components/search/progress.vue'
  import SearchFilters from '~/components/search/filters.vue'
  import CatalogCard from '~/components/catalogs/card.vue'
  import NavigationRight from '~/components/layout/navigation-right'
  import WrapSvg from '~/components/layout/svg.vue'

  const { mapState, mapGetters } = require('vuex')

  const wwwSvg = require('~/assets/svg/World wide web_Two Color.svg?raw')

  export default {
    components: { ImportCatalog, SearchProgress, SearchFilters, CatalogCard, NavigationRight, WrapSvg },
    data() {
      return {
        catalogs: null,
        page: 1,
        loading: true,
        filters: {},
        filtered: false,
        importCatalogSheet: !!this.$route.query.import,
        wwwSvg,
      }
    },
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      ...mapGetters(['canAdmin']),
      plural() {
        return this.catalogs.count > 1
      },
      size() {
        return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
      },
      hasCatalogs() {
        return !this.catalogs || this.catalogs.count
      },
      importCatalog() {
        return this.$route.query.import
      },
    },
    created() {
      this.refresh()
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
        this.$store.dispatch('breadcrumbs', [{ text: `${this.catalogs.count} ${this.plural ? 'catalogues configurés' : 'catalogue configuré'}` }])
        this.filtered = this.filters.q !== undefined
        this.loading = false
      },
    },
  }
</script>
