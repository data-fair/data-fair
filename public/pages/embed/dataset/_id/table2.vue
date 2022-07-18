<template lang="html">
  <v-container
    v-scroll="onScroll"
    fluid
    class="pa-0"
  >
    <tutorial-alert
      id="dataset-table"
      style="position:absolute;top: 60px;z-index:1;left: 50%;transform: translate(-50%, 0);min-width: 360px;"
    >
      {{ $t('tutorialFilter') }}
    </tutorial-alert>
    <v-app-bar
      elevate-on-scroll
      app
      dense
      :color="$vuetify.theme.dark ? 'black' : 'white'"
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
        @click:clear="$nextTick(() => refresh(true))"
      />

      <v-spacer />
      <dataset-select-cols
        v-model="selectedCols"
        :headers="headers"
      />
      <dataset-download-results
        :params="downloadParams"
        :total="data.total"
      />
      <template
        v-if="filters.length"
        #extension
      >
        <dataset-filters v-model="filters" />
      </template>
    </v-app-bar>

    <!-- table mode data-table -->
    <v-data-table
      v-if="displayMode === 'table'"
      :headers="selectedHeaders"
      :items="data.results"
      :server-items-length="data.total"
      :loading="loading"
      :options.sync="pagination"
      hide-default-header
      hide-default-footer
    >
      <template #header>
        <thead
          class="v-data-table-header"
          style="width:100%"
        >
          <tr>
            <dataset-table-header
              v-for="header in selectedHeaders"
              :key="header.text"
              :header="header"
              :filters="filters"
              :filter-height="filterHeight"
              :pagination="pagination"
              @sort="orderBy(header)"
              @filter="f => addFilter(header.value, f)"
            />
          </tr>
        </thead>
      </template>
      <template #item="{item}">
        <tr>
          <td
            v-for="header in selectedHeaders"
            :key="header.value"
            :class="`pl-4 pr-0`"
            :style="`height: ${lineHeight}px;position:relative;`"
          >
            <template v-if="header.value === '_thumbnail'">
              <v-avatar
                v-if="item._thumbnail"
                tile
                :size="lineHeight"
              >
                <img :src="item._thumbnail">
              </v-avatar>
            </template>
            <dataset-item-value
              v-else
              :item="item"
              :field="header.field"
              :filters="filters"
              @filter="f => addFilter(header.value, f)"
            />
          </td>
        </tr>
      </template>
    </v-data-table>

    <!-- list mode header -->
    <template v-if="displayMode === 'list'">
      <v-row class="ma-0 px-2">
        <v-slide-group show-arrows>
          <v-slide-item
            v-for="header in selectedHeaders"
            :key="header.text"
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

      <div style="height:2px;width:100%;">
        <v-progress-linear
          v-if="loading"
          indeterminate
          height="2"
          style="margin:0;"
        />
      </div>
    </template>

    <!--list mode body -->
    <v-row
      v-if="displayMode === 'list'"
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
          @filter="({field, filter}) => addFilter(field.key, filter)"
        />
      </v-col>
    </v-row>
    <v-row
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
const filtersUtils = require('~/assets/filters-utils')

export default {
  data: () => ({
    data: {},
    query: null,
    pagination: {
      page: 1,
      itemsPerPage: 12,
      sortBy: [null],
      sortDesc: [false]
    },
    notFound: false,
    loading: false,
    lineHeight: 40,
    filterHeight: 500,
    filters: [],
    lastParams: null,
    selectedCols: [],
    ready: false,
    windowHeight: window.innerHeight
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
          filterable: (!field['x-capabilities'] || field['x-capabilities'].index !== false) && field['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry',
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
      return this.$vuetify.breakpoint.mdAndUp ? 50 : 30
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
    topBottomHeight () {
      let height = 48 // app bar
      if (this.filters.length) height += 48 // app bar extension
      height += 48 // table header
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
      },
      deep: true
    }
  },
  async mounted () {
    this.readQueryParams()
    if (this.displayMode === 'table') this.setItemsPerPage()
    this.filterHeight = window.innerHeight - this.topBottomHeight
    await this.$nextTick()
    this.ready = true
    this.refresh()
  },
  methods: {
    setItemsPerPage () {
      // adapt number of lines to window height
      // don't forget to let enough space for the optional horizontal scroll bar
      const height = window.innerHeight
      const nbRows = Math.floor(Math.max(height - this.topBottomHeight, 120) / (this.lineHeight + 2))
      this.pagination.itemsPerPage = Math.min(Math.max(nbRows, 4), 50)
    },
    async refresh (resetPagination, initial) {
      if (!this.ready) return
      if (!initial) this.writeQueryParams()

      if (resetPagination) {
        if (this.displayMode === 'table') this.setItemsPerPage()
        this.pagination.page = 1
        this.$vuetify.goTo(0)
        // this is debatable
        // but in case of full-text search you can forget that a sort is active
        // and be surprised by counter-intuitive results
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

      // if the page is too large for the user to trigger a scroll we append results immediately
      this.continueFetch()
    },
    async fetchMore () {
      this.loading = true
      try {
        const nextUrl = new URL(this.data.next)
        nextUrl.searchParams.set('size', 40)
        const nextData = await this.$axios.$get(nextUrl.href)
        this.data.next = nextData.next
        this.data.results = this.data.results.concat(nextData.results)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des données' })
      }
      this.loading = false

      // if the page is too large for the user to trigger a scroll we append results immediately
      this.continueFetch()
    },
    async continueFetch () {
      await this.$nextTick()
      await this.$nextTick()
      if (this.displayMode === 'table') return
      const html = document.getElementsByTagName('html')
      if (html[0].scrollHeight === html[0].clientHeight && this.data.next) {
        this.fetchMore()
      }
    },
    onScroll (e) {
      if (this.displayMode === 'table') return // infinite scroll incompatible with table horizontal scroll
      if (this.loading) return
      const se = e.target.scrollingElement
      if (se.clientHeight + se.scrollTop > se.scrollHeight - 300 && this.data.next) {
        this.fetchMore()
      }
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

      if (global.parent && global.parent !== global.self) parent.postMessage({ query }, '*')
      else this.$router.push({ query })
    }
  }
}
</script>

<style>
.embed .v-data-table td {
  white-space: nowrap;
}
</style>
