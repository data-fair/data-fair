<template lang="html">
  <v-container
    fluid
    class="pa-0 embed-table"
  >
    <tutorial-alert
      id="dataset-table"
      style="position:absolute;top: 60px;z-index:1;left: 50%;transform: translate(-50%, 0);min-width: 360px;"
    >
      {{ $t('tutorialFilter') }}
    </tutorial-alert>
    <v-app-bar
      :elevate-on-scroll="displayMode === 'list'"
      app
      dense
      :flat="displayMode === 'table'"
      :color="$vuetify.theme.dark ? 'black' : 'white'"
      :extension-height="extensionHeight"
    >
      <v-toolbar-title style="white-space:normal;">
        <dataset-nb-results
          :total="data.total"
          :limit="0"
        />
      </v-toolbar-title>
      <v-text-field
        v-model="query"
        placeholder="Rechercher"
        append-icon="mdi-magnify"
        style="min-width:120px; max-width:250px;"
        outlined
        dense
        rounded
        hide-details
        class="mx-2"
        clearable
        @input="qMode === 'complete' && refresh(true)"
        @keyup.enter.native="refresh(true)"
        @click:append="refresh(true)"
        @click:clear="$nextTick(() => {$nextTick(() => refresh(true))})"
      />
      {{ virtualScrollHorizontal }}
      <v-spacer />
      <dataset-select-cols
        v-model="selectedCols"
        :headers="headers"
      />
      <dataset-download-results
        :params="downloadParams"
        :total="data.total"
      />
      <template #extension>
        <v-col class="pa-0">
          <v-row
            v-if="filters.length"
            class="ma-0 align-center"
            style="height:32px;"
          >
            <dataset-filters
              v-model="filters"
            />
          </v-row>

          <!-- list mode header -->
          <template v-if="displayMode === 'list'">
            <v-row class="ma-0 px-2">
              <v-slide-group show-arrows>
                <v-slide-item
                  v-for="(header, i) in selectedHeaders"
                  :key="`list-header-${i}`"
                >
                  <dataset-table-header
                    :header="header"
                    :filters="filters"
                    :filter-height="filterHeight"
                    :pagination="pagination"
                    @sort="orderBy(header)"
                    @filter="f => addFilter(header.value, f)"
                  />
                </v-slide-item>
              </v-slide-group>
            </v-row>
          </template>
        </v-col>
      </template>
    </v-app-bar>

    <!-- table mode data-table -->
    <template v-if="displayMode === 'table'">
      <!-- fake table only here to have a fiex position header that follow the scroll on the actual table -->
      <v-row class="header-data-table v-data-table ma-0">
        <div
          class="v-data-table__wrapper"
          :class="{'elevation-4': scrollTop > 4}"
          style="overflow-x: hidden;"
        >
          <table>
            <thead class="v-data-table-header">
              <tr>
                <template v-for="(header, i) in selectedHeaders">
                  <dataset-table-header
                    :id="`visible-header-${i}`"
                    :key="`visible-header-${i}`"
                    :header="header"
                    :filters="filters"
                    :filter-height="filterHeight"
                    :pagination="pagination"
                    @sort="orderBy(header)"
                    @filter="f => addFilter(header.value, f)"
                  />
                </template>
              </tr>
            </thead>
          </table>
        </div>
      </v-row>

      <!-- actual data-table the header is hidden, the visible header is in the app bar-->
      <v-data-table
        class="real-data-table"
        :headers="selectedHeaders"
        :server-items-length="data.total"
        :options.sync="pagination"
        hide-default-header
        hide-default-footer
        :height="tableHeight"
      >
        <template #body>
          <tbody
            v-if="data.results && data.results.length && totalHeaderWidth"
            :style="{height: tableHeight - 100 + 'px'}"
          >
            <tr :key="`top-padding-${virtualScrollVertical.topPadding}`">
              <td :style="'height:'+virtualScrollVertical.topPadding+'px'" />
            </tr>
            <tr
              v-for="i in virtualScrollVertical.nbRendered"
              :key="i -1 + virtualScrollVertical.index"
            >
              <td
                v-if="virtualScrollHorizontal.leftPadding"
                :key="`left-padding-${virtualScrollHorizontal.leftPadding}`"
                :style="{height: lineHeight + 'px', width: virtualScrollHorizontal.leftPadding + 'px', 'max-width': virtualScrollHorizontal.leftPadding + 'px', 'min-width': virtualScrollHorizontal.leftPadding + 'px'}"
              />
              <template v-for="h in virtualScrollHorizontal.nbRendered">
                <dataset-table-cell
                  :key="h - 1 + virtualScrollHorizontal.index"
                  :item="data.results[i -1 + virtualScrollVertical.index]"
                  :line-height="lineHeight"
                  :header="selectedHeaders[h - 1 + virtualScrollHorizontal.index]"
                  :filters="filters"
                  :truncate="truncate"
                  :style="{width: headerWidths[selectedHeaders[h - 1 + virtualScrollHorizontal.index].value] + 'px', 'min-width': headerWidths[selectedHeaders[h - 1 + virtualScrollHorizontal.index].value] + 'px', 'max-width': headerWidths[selectedHeaders[h - 1 + virtualScrollHorizontal.index].value] + 'px'}"
                  @filter="f => addFilter(selectedHeaders[h - 1 + virtualScrollHorizontal.index].value, f)"
                />
              </template>
              <td
                v-if="virtualScrollHorizontal.rightPadding"
                :key="`right-padding-${virtualScrollHorizontal.rightPadding}`"
                :style="{height: lineHeight + 'px', width: virtualScrollHorizontal.rightPadding + 'px', 'max-width': virtualScrollHorizontal.rightPadding + 'px', 'min-width': virtualScrollHorizontal.rightPadding + 'px'}"
              />
            </tr>
            <tr :key="`bottom-padding-${virtualScrollVertical.bottomPadding}`">
              <td :style="'height:'+virtualScrollVertical.bottomPadding+'px'" />
            </tr>
            <tr
              v-if="data.results"
              style="position:relative;"
            >
              <v-btn
                v-if="data.next"
                v-intersect="fetchMore"
                :loading="loading"
                text
                color="primary"
                :style="`position:absolute;left: ${windowWidth/2}px;transform: translate(-50%, 0);`"
                @click="fetchMore"
              >
                {{ $t('showMore') }}
              </v-btn>
            </tr>
          </tbody>
        </template>
      </v-data-table>
    </template>

    <!--list mode body -->
    <template v-if="displayMode === 'list'">
      <div style="height:2px;width:100%;">
        <v-progress-linear
          v-if="loading"
          indeterminate
          height="2"
          style="margin:0;"
        />
      </div>

      <v-row
        class="ma-0"
        dense
      >
        <v-col
          v-for="item in data.results"
          :key="item._id"
          cols="12"
          md="6"
          lg="4"
          xl="3"
        >
          <dataset-item-card
            :item="item"
            :filters="filters"
            :selected-fields="selectedCols"
            :truncate="truncate"
            @filter="({field, filter}) => addFilter(field.key, filter)"
          />
        </v-col>
      </v-row>

      <!-- list mode show more -->
      <v-row
        v-if="data.results"
        v-intersect="fetchMore"
        align="center"
        class="my-0"
      >
        <v-col class="text-center py-0">
          <v-btn
            v-if="data.next"
            :loading="loading"
            text
            color="primary"
            @click="fetchMore"
          >
            {{ $t('showMore') }}
          </v-btn>
        </v-col>
      </v-row>
    </template>

    <layout-scroll-to-top />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  tutorialFilter: Appliquez des filtres depuis les entêtes de colonnes et en survolant les valeurs. Triez en cliquant sur les entêtes de colonnes. Cliquez sur le bouton en haut à droite pour télécharger dans un fichier le contenu filtré et trié.
  noData: Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.
  showMore: Voir plus de lignes
en:
  tutorialFilter: Apply filters from the headers and by hovering the values. Sort by clicking on the headers. Click on the button on the top to the right to download in a file the filtered and sorted content.
  noData: The data is not accessible. Either the dataset was not yet entirely processed, or there was an error.
  showMore: Show more lines
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'
import tableVirtualScrollMixin from '~/mixins/table-virtual-scroll'
const filtersUtils = require('~/assets/filters-utils')

export default {
  mixins: [tableVirtualScrollMixin],
  data: () => ({
    data: {},
    query: null,
    pagination: {
      page: 1,
      itemsPerPage: 20,
      sortBy: [null],
      sortDesc: [false]
    },
    loading: false,
    lineHeight: 40,
    filterHeight: 500,
    filters: [],
    lastParams: null,
    selectedCols: [],
    ready: false
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl', 'qMode', 'imageField']),
    displayMode () {
      if (this.$route.query.display) return this.$route.query.display
      if (this.$vuetify.breakpoint.smAndDown) return 'list'
      return 'table'
    },
    headers () {
      const fieldsHeaders = this.dataset.schema
        .filter(field => !field['x-calculated'])
        .map(field => ({
          text: field.title || field['x-originalName'] || field.key,
          value: field.key,
          sortable:
              (!field['x-capabilities'] || field['x-capabilities'].values !== false) && (
                (field.type === 'string' && field['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry') ||
                field.type === 'number' ||
                field.type === 'integer'
              ),
          tooltip: field.description || (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description),
          field
        }))

      if (this.imageField) {
        fieldsHeaders.unshift({ text: '', value: '_thumbnail' })
      }
      return fieldsHeaders
    },
    selectedHeaders () {
      if (this.selectedCols.length === 0) return this.headers
      return this.headers.filter(h => !h.field || this.selectedCols.includes(h.value))
    },
    truncate () {
      return this.$vuetify.breakpoint.mdAndUp ? 50 : 40
    },
    params () {
      const params = {
        size: this.pagination.itemsPerPage,
        page: this.pagination.page,
        q_mode: this.qMode,
        truncate: this.truncate
      }
      if (this.imageField) params.thumbnail = '40x40'
      if (this.pagination.sortBy[0]) {
        params.sort = (this.pagination.sortDesc[0] ? '-' : '') + this.pagination.sortBy[0]
      }
      if (this.query) params.q = this.query
      if (this.filters.length) {
        try {
          params.qs = filtersUtils.filters2qs(this.filters, this.$i18n.locale)
        } catch (error) {
          // eslint-disable-next-line vue/no-async-in-computed-properties
          this.$nextTick(() => eventBus.$emit('notification', { error }))
        }
      }
      if (this.dataset.finalizedAt) params.finalizedAt = this.dataset.finalizedAt
      // if (this.displayMode === 'list') params.html = true
      return params
    },
    downloadParams () {
      if (this.selectedCols.length === 0) return this.params
      return { ...this.params, select: this.selectedCols.join(',') }
    },
    extensionHeight () {
      let height = 0
      if (this.displayMode === 'list') height += 48
      if (this.filters.length) height += 32
      return height
    },
    tableHeight () {
      let height = this.windowHeight
      height -= 48 // app bar
      height -= this.extensionHeight
      height -= 48 // fixed header
      return height
    },
    topBottomHeight () {
      let height = 48 // app bar
      height += this.extensionHeight
      height += 36 // bottom button
      return height
    }
  },
  watch: {
    'dataset.schema' () {
      this.refresh(true)
    },
    pagination: {
      handler () {
        this.refresh(false)
      },
      deep: true
    },
    filters: {
      handler () {
        this.refresh(true)
      },
      deep: true
    },
    selectedCols: {
      handler () {
        this.writeQueryParams()
        this.measureHeaders(true)
      },
      deep: true
    }
  },
  async mounted () {
    this.readQueryParams()
    if (this.displayMode === 'table') this.pagination.itemsPerPage = 40
    this.filterHeight = window.innerHeight - this.topBottomHeight
    this.refresh()
  },
  methods: {
    async refresh (resetPagination) {
      this.writeQueryParams()

      if (resetPagination) {
        this.pagination.page = 1
        const goToOpts = { duration: 0 }
        if (this.displayMode === 'table') goToOpts.container = '.v-data-table__wrapper'
        if (this.displayMode === 'list') {
          this.$vuetify.goTo(0, goToOpts)
        } else {
          document.querySelector('.real-data-table .v-data-table__wrapper').scrollTop = 0
          this.scrollTop = 0
        }
        this.pagination.sortBy = [null]
        this.pagination.sortDesc = [false]
      }

      // prevent triggering multiple times the same request
      const paramsStr = JSON.stringify(this.params)
      if (paramsStr === this.lastParams) return
      this.lastParams = paramsStr

      // this.data = {}
      this.loading = true
      try {
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params: this.params })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des données' })
      }
      this.loading = false
      this.measureHeaders()
      this.watchTableScroll()
    },
    async fetchMore (entries, observer, isIntersecting) {
      if (!this.data.next || this.loading || isIntersecting === false) return
      this.loading = true
      try {
        const nextUrl = new URL(this.data.next)
        const nextData = await this.$axios.$get(nextUrl.href)
        this.data.next = nextData.next
        this.data.results = this.data.results.concat(nextData.results)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des données' })
      }
      this.loading = false
    },
    orderBy (header) {
      if (!header.sortable) return
      if (this.pagination.sortBy[0] === header.value) {
        this.$set(this.pagination.sortDesc, 0, !this.pagination.sortDesc[0])
      } else {
        this.$set(this.pagination.sortBy, 0, header.value)
        this.$set(this.pagination.sortDesc, 0, false)
      }
    },
    addFilter (key, filter) {
      if (typeof filter !== 'object') filter = { type: 'in', values: [filter] }
      filter.field = this.dataset.schema.find(f => f.key === key)
      this.filters = this.filters.filter(f => !(f.field.key === key))
      if (filter.type === 'in' && filter.values.length === 0) return
      this.filters.push(filter)
    },
    readQueryParams () {
      const query = this.$route.query
      if (query.cols) this.selectedCols = query.cols.split(',')
      if (query.q) this.query = query.q
      if (query.sort) {
        const [sortBy, sortDesc] = query.sort.split(':')
        this.$set(this.pagination.sortBy, 0, sortBy)
        this.$set(this.pagination.sortDesc, 0, sortDesc === '-1')
      }
      this.filters = filtersUtils.readQueryParams(query, this.dataset)
    },
    writeQueryParams () {
      const query = { ...this.$route.query }

      if (this.selectedCols.length) query.cols = this.selectedCols.join(',')
      else delete query.cols

      if (this.query) query.q = this.query
      else delete query.q

      filtersUtils.writeQueryParams(this.filters, query)

      if (this.pagination.sortBy && this.pagination.sortBy[0]) {
        query.sort = this.pagination.sortBy[0] + ':' + (this.pagination.sortDesc[0] ? '-1' : '1')
      } else {
        delete query.sort
      }
      this.$router.push({ query })
    }
  }
}
</script>

<style>
.embed-table .v-data-table td {
  white-space: nowrap;
}
.embed-table .v-toolbar__extension {
  padding-left:0;
}
.v-data-table {
  max-width: none;
}
.v-data-table.real-data-table .v-data-table__wrapper {
  position: relative;
}
.v-data-table.real-data-table .v-data-table__wrapper table {
  table-layout: auto;
}

</style>
