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

    <!-- this is simply to include the style of v-data-table and related components -->
    <v-data-table v-show="false" />
    <v-simple-table v-show="false" />

    <v-app-bar
      :elevate-on-scroll="displayMode === 'list'"
      app
      dense
      :flat="displayMode === 'table' || displayMode === 'table-dense'"
      :color="$vuetify.theme.dark ? 'black' : 'white'"
      :extension-height="extensionHeight"
      clipped-left
    >
      <dataset-nb-results
        :total="data.total"
        :limit="0"
        style="min-width:80px;max-width:80px;"
      />
      <v-text-field
        v-model="query"
        placeholder="Rechercher"
        append-icon="mdi-magnify"
        style="min-width:170px; max-width:250px;"
        outlined
        dense
        rounded
        hide-details
        class="ml-2 mr-2"
        clearable
        @input="qMode === 'complete' && refresh(true)"
        @keyup.enter.native="refresh(true)"
        @click:append="refresh(true)"
        @click:clear="$nextTick(() => {$nextTick(() => refresh(true))})"
      />
      <dataset-filters
        v-if="$vuetify.breakpoint.mdAndUp"
        v-model="filters"
        :max-width="filtersWidth"
      />
      <v-spacer />
      <v-menu
        v-if="$vuetify.breakpoint.mdAndUp"
        offset-y
        tile
      >
        <template #activator="{ on }">
          <v-btn
            icon
            large
            :title="$t('selectDisplay')"
            v-on="on"
          >
            <v-icon v-if="displayMode === 'table'">
              mdi-table
            </v-icon>
            <v-icon v-if="displayMode === 'table-dense'">
              mdi-table-large
            </v-icon>
            <v-icon v-if="displayMode === 'list'">
              mdi-view-grid-outline
            </v-icon>
          </v-btn>
        </template>
        <v-sheet>
          <v-subheader v-t="'displayTitle'" />
          <v-list
            class="py-0"
            dense
          >
            <v-list-item-group
              v-model="displayMode"
              color="primary"
            >
              <v-list-item value="table">
                <v-list-item-avatar :size="30">
                  <v-avatar :size="30">
                    <v-icon>
                      mdi-table
                    </v-icon>
                  </v-avatar>
                </v-list-item-avatar>
                <v-list-item-title v-t="'displayTable'" />
              </v-list-item>
              <v-list-item value="table-dense">
                <v-list-item-avatar :size="30">
                  <v-avatar :size="30">
                    <v-icon>
                      mdi-table-large
                    </v-icon>
                  </v-avatar>
                </v-list-item-avatar>
                <v-list-item-title v-t="'displayTableDense'" />
              </v-list-item>
              <v-list-item value="list">
                <v-list-item-avatar :size="30">
                  <v-avatar :size="30">
                    <v-icon>
                      mdi-view-grid-outline
                    </v-icon>
                  </v-avatar>
                </v-list-item-avatar>
                <v-list-item-title v-t="'displayList'" />
              </v-list-item>
            </v-list-item-group>
          </v-list>
        </v-sheet>
      </v-menu>
      <dataset-select-cols
        v-model="selectedCols"
        :headers="headers"
        :height="windowHeight - 60"
      />
      <dataset-download-results
        :params="downloadParams"
        :total="data.total"
      />
      <template
        v-if="$vuetify.breakpoint.smAndDown && filters.length"
        #extension
      >
        <v-col class="pa-0">
          <v-row
            class="my-0 mx-1 align-center"
            style="height:40px;"
          >
            <dataset-filters
              v-model="filters"
              :max-width="windowWidth"
            />
          </v-row>
        </v-col>
      </template>
    </v-app-bar>

    <!-- table mode data-table -->
    <template v-if="showTable">
      <!-- fixed table to the left -->
      <v-navigation-drawer
        v-if="fixedCol"
        clipped
        :width="fixedColWidth"
        app
        permanent
        class="fixed-column-drawer"
        :class="{'elevation-3': elevateLeft}"
      >
        <v-row class="fixed-header-data-table v-data-table ma-0">
          <div
            class="v-data-table__wrapper"
          >
            <table
              :style="{'table-layout': 'fixed'}"
              :summary="$t('fixedTableHeaderSummary', {col: fixedHeader.text})"
              aria-colcount="1"
            >
              <thead
                class="v-data-table-header"
              >
                <tr style="position:relative">
                  <dataset-table-header-cell
                    :id="'fixed-header-cell'"
                    :header="fixedHeader"
                    :pagination="pagination"
                    :width="headerWidths[fixedHeader.value]"
                    :dense="displayMode === 'table-dense'"
                  />
                  <dataset-table-header-menu
                    :activator="'#fixed-header-cell'"
                    :header="fixedHeader"
                    :filters="filters"
                    :filter-height="tableHeight - 20"
                    :pagination="pagination"
                    :fixed-col="fixedCol"
                    @filter="f => addFilter(fixedHeader.value, f)"
                    @hide="hideHeader(fixedHeader)"
                    @fixCol="fixedCol = null; writeQueryParams()"
                  />
                </tr>
              </thead>
            </table>
          </div>
        </v-row>
        <div :class="`v-data-table fixed-data-table v-data-table--fixed-height theme--${$vuetify.theme.dark ? 'dark' : 'light'}`">
          <div
            class="v-data-table__wrapper"
            :style="{height: tableHeight + 'px'}"
          >
            <table
              :summary="$t('fixedTableDataSummary', {col: fixedHeader.text})"
              :aria-rowcount="data.total"
            >
              <tbody :style="{ 'height': virtualScrollVertical.totalHeight + 'px', }">
                <tr
                  v-for="(result, i) in virtualScrollVertical.results"
                  :key="verticalKeys[result._id]"
                  :style="{
                    display: 'block',
                    position: 'relative',
                    width: totalHeaderWidths + 'px',
                    minWidth: totalHeaderWidths + 'px',
                    maxWidth: totalHeaderWidths + 'px',
                    height: lineHeight + 'px',
                    'will-change': 'transform',
                    transform: `translateY(${virtualScrollVertical.topPadding}px)`
                  }"
                  :aria-rowindex="virtualScrollVertical.index + i + 1"
                >
                  <dataset-table-cell
                    :item="result"
                    :line-height="lineHeight"
                    :header="fixedHeader"
                    :filters="filters"
                    :truncate="truncate"
                    :dense="displayMode === 'table-dense'"
                    :style="{width: fixedColWidth + 'px', 'min-width': fixedColWidth + 'px', 'max-width': fixedColWidth + 'px'}"
                    @filter="f => addFilter(fixedHeader.value, f)"
                  />
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </v-navigation-drawer>

      <!-- fake table only here to have a fixed position header that follow the scroll on the actual table -->
      <v-row class="header-data-table v-data-table ma-0">
        <div
          class="v-data-table__wrapper"
          :class="{'elevation-3': elevateTop}"
        >
          <table
            :style="{'table-layout': 'fixed'}"
            :summary="$t('tableHeaderSummary', {dataset: dataset.title})"
          >
            <thead class="v-data-table-header">
              <tr
                style="position:relative;"
                :style="{
                  display: 'block',
                  position: 'relative',
                  width: totalHeaderWidths + 'px',
                  minWidth: totalHeaderWidths + 'px',
                  maxWidth: totalHeaderWidths + 'px',
                  height: '48px'
                }"
              >
                <template v-for="(header, h) in renderFullHeader ? selectedHeaders : virtualScrollHorizontal.headers">
                  <dataset-table-header-cell
                    :id="'header-cell-' + (renderFullHeader ? h : horizontalKeys[header.value])"
                    :key="'header-cell-' + (renderFullHeader ? h : horizontalKeys[header.value])"
                    :header="header"
                    :pagination="pagination"
                    :width="headerWidths[header.value]"
                    :style="renderFullHeader ? {} : {
                      position: 'relative',
                      'will-change': 'transform',
                      transform: `translateX(${virtualScrollHorizontal.leftPadding}px)`
                    }"
                    :dense="displayMode === 'table-dense'"
                    :aria-colindex="(renderFullHeader ? h : virtualScrollHorizontal.index + h) + 1"
                    :aria-colindextext="header.text"
                  />
                  <dataset-table-header-menu
                    v-if="header.field"
                    :key="'header-menu-' + (renderFullHeader ? h : horizontalKeys[header.value])"
                    :activator="'#header-cell-' + (renderFullHeader ? h : horizontalKeys[header.value])"
                    :header="header"
                    :filters="filters"
                    :filter-height="tableHeight - 20"
                    :pagination="pagination"
                    :fixed-col="fixedCol"
                    @filter="f => addFilter(header.value, f)"
                    @hide="hideHeader(header)"
                    @fixCol="fixedCol = header.value; writeQueryParams()"
                  />
                </template>
              </tr>
            </thead>
          </table>
        </div>
      </v-row>

      <!-- actual data-table the header is hidden, the visible header is in the app bar-->
      <div :class="`v-data-table real-data-table v-data-table--fixed-height theme--${$vuetify.theme.dark ? 'dark' : 'light'}`">
        <div
          class="v-data-table__wrapper"
          :style="{height: tableHeight + 'px'}"
        >
          <table
            :summary="$t('tableDataSummary', {dataset: dataset.title})"
            :aria-rowcount="data.total"
            :aria-colcount="selectedHeaders.length"
          >
            <tbody :style="{ 'height': virtualScrollVertical.totalHeight + 'px'}">
              <tr v-if="virtualScrollVertical.results.length === 0">
                <td :style="{minWidth: totalHeaderWidths + 'px'}" />
              </tr>
              <tr
                v-for="(result, v) in virtualScrollVertical.results"
                :key="verticalKeys[result._id]"
                :style="{
                  display: 'block',
                  position: 'relative',
                  width: totalHeaderWidths + 'px',
                  minWidth: totalHeaderWidths + 'px',
                  maxWidth: totalHeaderWidths + 'px',
                  height: lineHeight + 'px',
                  'will-change': 'transform',
                  transform: `translateY(${virtualScrollVertical.topPadding}px)`
                }"
                :aria-rowindex="virtualScrollVertical.index + v + 1"
                :aria-rowindextext="fixedCol ? result[fixedCol] : ''"
              >
                <template v-for="(header, h) in virtualScrollHorizontal.headers">
                  <dataset-table-cell
                    :key="horizontalKeys[header.value]"
                    :item="result"
                    :line-height="lineHeight"
                    :header="header"
                    :filters="filters"
                    :truncate="truncate"
                    :dense="displayMode === 'table-dense'"
                    :style="{
                      width: headerWidths[header.value] + 'px',
                      'min-width': headerWidths[header.value] + 'px',
                      'max-width': headerWidths[header.value] + 'px',
                      position: 'relative',
                      'will-change': 'transform',
                      transform: `translateX(${virtualScrollHorizontal.leftPadding}px)`
                    }"
                    :aria-colindex="virtualScrollHorizontal.index + h + 1"
                    :aria-colindextext="header.text"
                    @filter="f => addFilter(header.value, f)"
                  />
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- drag and drop handles to resize columns -->
      <template
        v-if="headersPositions && virtualScrollHorizontal && !scrollingHorizontal"
      >
        <dataset-table-drag-col
          v-if="fixedHeader"
          :key="`drag-col-fixed`"
          :height="tableHeight + 30"
          :left="-5"
          style="z-index:6"
          @move="movement => headerWidths[fixedHeader.value] = Math.min(tableWidth, Math.max(80, headerWidths[fixedHeader.value] + movement))"
        />
        <dataset-table-drag-col
          v-for="(header, i) in selectedHeaders.filter(header => headersPositions[header.value] - scrollLeft > 0 && headersPositions[header.value] - scrollLeft < tableWidth)"
          :key="`drag-col-${i}`"
          :height="tableHeight + 30"
          :left="headersPositions[header.value] - scrollLeft - 4"
          @move="movement => headerWidths[header.value] = Math.min(tableWidth, Math.max(80, headerWidths[header.value] + movement))"
        />
      </template>

      <layout-scroll-to-top selector=".real-data-table .v-data-table__wrapper" />
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
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <dataset-item-card
            :item="item"
            :filters="filters"
            :filter-height="tableHeight - 20"
            :selected-fields="selectedCols"
            :headers="selectedHeaders"
            :truncate="truncate"
            :pagination="pagination"
            @filter="({header, filter}) => addFilter(header.value, filter)"
            @hide="header => hideHeader(header)"
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
      <layout-scroll-to-top />
    </template>

    <div
      v-if="scrollGrabbed"
      id="scroll-overlay"
      style="background-color:rgba(0,0,0,0);position:fixed;top:0;left:0;bottom:0;right:0;z-index:7;"
    />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  selectDisplay: Choisir le type d'affichage
  displayTitle: Type d'affichage
  displayTable: Table
  displayTableDense: Table dense
  displayList: Liste de vignettes
  tutorialFilter: Appliquez des filtres depuis les entêtes de colonnes et en survolant les valeurs. Triez en cliquant sur les entêtes de colonnes. Cliquez sur le bouton en haut à droite pour télécharger dans un fichier le contenu filtré et trié.
  noData: Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.
  showMore: Voir plus de lignes
  fixedTableHeaderSummary: "Cette table contient l'entête de la colonne \"{col}\" fixée sur la gauche de l'écran."
  fixedTableDataSummary: "Cette table contient les données de la colonne \"{col}\" fixée sur la gauche de l'écran."
  tableHeaderSummary: "Cette table contient les entêtes de colonnes pour l'exploration des données de \"{dataset}\". Ces entêtes permettent d'ouvrir un menu pour trier, filtrer et masquer les colonnes."
  tableDataSummary: "Cette table contient les données de \"{dataset}\"."
en:
  selectDisplay: Chose the type of display
  displayTitle: Type of display
  displayTable: Table
  displayTableDense: Dense table
  displayList: Liste of cards
  tutorialFilter: Apply filters from the headers and by hovering the values. Sort by clicking on the headers. Click on the button on the top to the right to download in a file the filtered and sorted content.
  noData: The data is not accessible. Either the dataset was not yet entirely processed, or there was an error.
  showMore: Show more lines
  fixedTableHeaderSummary: "This table contains the header for the column \"{col}\" fixed to the left of the screen."
  fixedTableDataSummary: "This table contains the data for the column \"{col}\" fixed to the left of the screen."
  tableHeaderSummary: "This table contains the column headers for exploring the data of \"{dataset}\". These headers can be used to open a menu for sorting, filtering, and hiding columns."
  tableDataSummary: "This table contains the data of \"{dataset}\"."
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
    filters: [],
    lastParams: null,
    selectedCols: [],
    ready: false,
    fixedCol: null
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl', 'qMode', 'imageField']),
    displayMode: {
      get () {
        if (this.$route.query.display) return this.$route.query.display
        if (this.$vuetify.breakpoint.smAndDown) return 'list'
        return 'table'
      },
      async set (value) {
        const url = new URL(window.location.href)
        url.searchParams.set('display', value)
        window.location.href = url.href
      }
    },
    lineHeight () {
      return this.displayMode === 'table-dense' ? 28 : 40
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
    cols () {
      return this.headers.filter(h => !!h.field).map(h => h.value)
    },
    selectedHeaders () {
      return this.headers.filter(h => (!h.field || !this.selectedCols.length || this.selectedCols.includes(h.value)) && h.value !== this.fixedCol)
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
      if (this.$vuetify.breakpoint.smAndDown && this.filters.length) height += 40
      return height
    },
    tableHeight () {
      let height = this.windowHeight
      height -= 48 // app bar
      height -= this.extensionHeight
      height -= 48 // fixed header
      height -= 1 // header border
      return height
    },
    filtersWidth () {
      let width = this.windowWidth
      width -= 32 // app bar padding
      width -= 80 // number of lines
      width -= 186 // search bar
      width -= 44 // select display
      width -= 44 // select cols
      width -= 44 // download
      return width
    },
    fixedHeader () {
      return this.fixedCol && this.headers.find(h => h.value === this.fixedCol)
    },
    showTable () {
      return (this.displayMode === 'table' || this.displayMode === 'table-dense') && this.headerWidthsAdjusted
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
      async handler () {
        this.writeQueryParams()
        this.headerWidths = {}
      },
      deep: true
    },
    'data.results' () {
      if (this.data.results && (this.data.results.length * this.lineHeight) < this.windowHeight) {
        this.fetchMore()
      }
    },
    showTable (value) {
      if (value) this.watchTableScroll()
    }
  },
  async mounted () {
    this.readQueryParams()
    this.refresh()
  },
  methods: {
    async refresh (resetPagination) {
      this.writeQueryParams()

      if (resetPagination) {
        this.pagination.page = 1
        const goToOpts = { duration: 0 }
        if (this.displayMode === 'list') {
          this.$vuetify.goTo(0, goToOpts)
        } else {
          if (this._tableWrapper) this._tableWrapper.scrollTop = 0
          this.scrollTop = 0
        }
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
      if (query['hide-cols']) {
        const hiddenCols = query['hide-cols'].split(',')
        this.selectedCols = this.cols.filter(col => !hiddenCols.includes(col))
      }
      if (query.fixed) this.fixedCol = query.fixed
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

      if (this.selectedCols.length) {
        if (this.selectedCols.length > this.cols.length / 2) {
          query['hide-cols'] = this.cols.filter(col => !this.selectedCols.includes(col)).join(',')
          delete query.cols
        } else {
          query.cols = this.selectedCols.join(',')
          delete query['hide-cols']
        }
      } else {
        delete query.cols
        delete query['hide-cols']
      }

      if (this.fixedCol) query.fixed = this.fixedCol
      else delete query.fixed

      if (this.query) query.q = this.query
      else delete query.q

      filtersUtils.writeQueryParams(this.filters, query)

      if (this.pagination.sortBy && this.pagination.sortBy[0]) {
        query.sort = this.pagination.sortBy[0] + ':' + (this.pagination.sortDesc[0] ? '-1' : '1')
      } else {
        delete query.sort
      }
      if (JSON.stringify(query) !== JSON.stringify(this.$route.query)) {
        this.$router.replace({ query })
      }
    },
    hideHeader (header) {
      if (!this.selectedCols.length) this.selectedCols = this.cols
      this.selectedCols = this.selectedCols.filter(sc => sc !== header.value)
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
.embed-table .tutorial-alert {
  z-index: 7 !important;
}
.fixed-data-table {
  z-index: 6;
}
.header-data-table .v-data-table__wrapper, .fixed-header-data-table .v-data-table__wrapper {
  border-bottom: 1px solid #D1D1D1;
}

/* replace native scrolling with perfect scrollbar */
.embed-table .v-navigation-drawer__content, .embed-table .v-data-table__wrapper {
  overflow-x: hidden !important;
  overflow-y: hidden !important;
}
.embed-table .v-data-table {
  max-width: none;
}
.embed-table .real-data-table .v-data-table__wrapper {
  position: relative;
}
.embed-table .v-data-table .v-data-table__wrapper {
  will-change: scroll-position;
}

/* customize perfect scrollbar */
.embed-table .ps .ps__rail-y, .embed-table .ps .ps__rail-x {
  opacity: 0.9;
  background-color: #eee;
}
.embed-table .ps .ps__rail-y .ps__thumb-y {
  width: 11px;
}
.embed-table .ps .ps__rail-x .ps__thumb-x {
  height: 11px;
}

</style>
