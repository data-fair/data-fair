<template lang="html">
  <v-container
    v-scroll="onScroll"
    fluid
    class="pa-0"
  >
    <tutorial-alert
      id="dataset-table"
      style="position:absolute;bottom: 0px;z-index:1;left: 50%;transform: translate(-50%, 0);"
    >
      {{ $t('tutorialFilter') }}
    </tutorial-alert>
    <v-app-bar
      elevate-on-scroll
      app
      dense
      :color="$vuetify.theme.dark ? 'black' : 'white'"
    >
      <v-toolbar-title>
        <dataset-nb-results
          :total="data.total"
          :limit="0"
        />
      </v-toolbar-title>
      <v-text-field
        v-model="query"
        placeholder="Rechercher"
        append-icon="mdi-magnify"
        style="min-width:150px; max-width:250px;"
        outlined
        dense
        rounded
        hide-details
        clearable
        class="mx-2"
        @input="qMode === 'complete' && refresh(true)"
        @keyup.enter.native="refresh(true)"
        @click:append="refresh(true)"
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

    <v-data-table
      :headers="selectedHeaders"
      :items="displayMode === 'table' ? data.results : []"
      :server-items-length="data.total"
      :loading="loading"
      :options.sync="pagination"
      hide-default-header
      hide-default-footer
    >
      <template #header>
        <thead class="v-data-table-header">
          <tr>
            <th
              v-for="header in selectedHeaders"
              :key="header.text"
              :class="{'text-start': true, sortable: header.sortable, active : header.value === pagination.sortBy[0], asc: !pagination.sortDesc[0], desc: pagination.sortDesc[0]}"
              nowrap
              @click="orderBy(header)"
            >
              <help-tooltip
                v-if="header.tooltip"
                small
                orientation="bottom"
              >
                <div v-html="header.tooltip" />
              </help-tooltip>
              <span>
                {{ header.text }}
              </span>
              <v-icon
                v-if="header.sortable"
                class="v-data-table-header__icon"
                small
              >
                mdi-arrow-up
              </v-icon>
              <dataset-filter-col
                v-if="header.field && header.filterable"
                :max-height="filterHeight"
                :field="header.field"
                :filters="filters"
                @filter="f => addFilter(header.value, f)"
              />
            </th>
          </tr>
        </thead>
      </template>
      <template #item="{item}">
        <tr>
          <td
            v-for="header in selectedHeaders"
            :key="header.value"
            :class="`pl-4 pr-0`"
            :style="`height: ${lineHeight}px`"
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
            <template v-else-if="digitalDocumentField && digitalDocumentField.key === header.value">
              <!-- attachment_url is empty if the value is an external link -->
              <a :href="item._attachment_url || item[header.value]">{{ item[header.value] | truncate(truncate) }}</a>
            </template>
            <template v-else-if="webPageField && webPageField.key === header.value">
              <a
                v-if="item[header.value]"
                target="_blank"
                :href="item[header.value]"
              >{{ item[header.value] | truncate(truncate) }}</a>
            </template>
            <template v-else>
              <div
                v-if="header.field.type === 'string' && header.field.separator"
                :style="`max-height: 40px; min-width: ${Math.min((item[header.value] + '').length, 50) * 6}px;`"
              >
                <v-chip-group
                  v-if="item[header.value]"
                  style="max-width:500px;"
                  show-arrows
                >
                  <v-hover
                    v-for="(value, i) in item[header.value].split(header.field.separator).map(v => v.trim())"
                    v-slot="{ hover }"
                    :key="i"
                  >
                    <v-chip
                      :class="{'my-0': true, 'px-4': !hover, 'px-2': hover}"
                      :color="hover ? 'primary' : 'default'"
                      @click="addFilter(header.value, value)"
                    >
                      <span>
                        {{ value | cellValues(header.field) }}
                        <v-icon v-if="hover">mdi-filter-variant</v-icon>
                      </span>
                    </v-chip>
                  </v-hover>
                </v-chip-group>
              </div>
              <v-hover
                v-else
                v-slot="{ hover }"
              >
                <div :style="`position: relative; max-height: 40px; min-width: ${Math.min((item[header.value] + '').length, 50) * 6}px;`">
                  <span>{{ item[header.value] | cellValues(header.field) }}</span>
                  <v-btn
                    v-if="hover && !item._tmpState && !filters.find(f => f.field.key === header.value) && header.filterable && isFilterable(item[header.value])"
                    fab
                    x-small
                    color="primary"
                    style="right: 0px;top: 50%;transform: translate(0, -50%);"
                    absolute
                    @click="addFilter(header.value, item[header.value])"
                  >
                    <v-icon>mdi-filter-variant</v-icon>
                  </v-btn>
                </div>
              </v-hover>
            </template>
          </td>
        </tr>
      </template>
    </v-data-table>
    <v-row v-if="displayMode === 'list'">
      <v-col
        v-for="item in data.results"
        :key="item._id"
        cols="12"
      >
        {{ item }}
      </v-col>
    </v-row>
    <v-row
      align="center"
      class="my-1"
    >
      <v-col class="text-center">
        <v-btn
          v-if="data.next"
          :loading="loading"
          text
          color="primary"
          @click="fetchMore"
        >
          show more
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
en:
  tutorialFilter: Apply filters from the headers and by hovering the values. Sort by clicking on the headers. Click on the button on the top to the right to download in a file the filtered and sorted content.
  noData: The data is not accessible. Either the dataset was not yet entirely processed, or there was an error.
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'
import helpTooltip from '../../../../components/help-tooltip.vue'
const filtersUtils = require('~/assets/filters-utils')

export default {
  components: { helpTooltip },
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
    ...mapGetters('dataset', ['resourceUrl', 'qMode']),
    displayMode () {
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
    imageField () {
      return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    },
    digitalDocumentField () {
      return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
    },
    webPageField () {
      return this.dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/WebPage')
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
      return params
    },
    downloadParams () {
      if (this.selectedCols.length === 0) return this.params
      return { ...this.params, select: this.selectedCols.join(',') }
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
    await this.$nextTick()
    this.ready = true
    this.refresh(true)
  },
  methods: {
    async refresh (resetPagination, initial) {
      if (!this.ready) return
      if (!initial) this.writeQueryParams()

      if (this.resetPagination) {
        this.pagination.page = 1
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
      await this.$nextTick()
      await this.$nextTick()
      this.continueFetch()
    },
    async fetchMore () {
      this.loading = true
      try {
        const nextData = await this.$axios.$get(this.data.next)
        this.data.next = nextData.next
        this.data.results = this.data.results.concat(nextData.results)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des données' })
      }
      this.loading = false
    },
    continueFetch () {

      /* const html = document.getElementsByTagName('html')
      if (html[0].scrollHeight === html[0].clientHeight && this.data.next) {
        this.fetchMore()
      } */
    },
    onScroll (e) {

      /* if (this.loading) return
      const se = e.target.scrollingElement
      if (se.clientHeight + se.scrollTop > se.scrollHeight - 300 && this.data.next) {
        this.fetchMore()
      } */
    },
    orderBy (header) {
      if (!header.sortable) return
      if (this.pagination.sortBy[0] === header.value) {
        this.$set(this.pagination.sortDesc, 0, !this.pagination.sortDesc[0])
      } else {
        this.$set(this.pagination.sortBy, 0, header.value)
        this.$set(this.pagination.sortDesc, 0, true)
      }
    },
    addFilter (key, filter) {
      if (typeof filter !== 'object') filter = { type: 'in', values: [filter] }
      filter.field = this.dataset.schema.find(f => f.key === key)
      this.filters = this.filters.filter(f => !(f.field.key === key))
      this.filters.push(filter)
    },
    isFilterable (value) {
      if (value === undefined || value === null || value === '') return false
      if (typeof value === 'string' && (value.length > 200 || value.startsWith('{'))) return false
      return true
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
