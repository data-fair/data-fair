<template>
  <v-container fluid class="pa-0">
    <tutorial-alert id="dataset-table">
      Appliquez des filtres en survolant les valeurs et triez en cliquant sur les entêtes de colonnes. Cliquez sur le bouton en haut à droite pour télécharger dans un fichier le contenu filtré et trié.
    </tutorial-alert>
    <v-sheet v-if="notFound" class="pa-2">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
    </v-sheet>
    <template v-else>
      <v-row class="ma-0">
        <v-col
          class="pb-0 pr-0 pl-1 pt-1"
          sm="4"
          cols="12"
        >
          <v-text-field
            v-model="query"
            placeholder="Rechercher"
            append-icon="mdi-magnify"
            style="min-width:150px;"
            outlined
            dense
            hide-details
            @input="qMode === 'complete' && refresh(true)"
            @keyup.enter.native="refresh(true)"
            @click:append="refresh(true)"
          />
        </v-col>

        <v-col
          sm="8"
          cols="12"
          class="pb-0"
        >
          <v-row justify="end" class="pr-3">
            <v-spacer v-if="$vuetify.breakpoint.xs" />
            <v-pagination
              v-if="data.total"
              v-model="pagination.page"
              circle
              :length="Math.ceil(Math.min(data.total, 10000 - pagination.itemsPerPage) / pagination.itemsPerPage)"
              :total-visible="$vuetify.breakpoint.mdAndUp ? 6 : 5"
              style="width: auto"
            />
            <v-spacer v-if="$vuetify.breakpoint.xs" />
            <dataset-select-cols v-model="selectedCols" :headers="headers" />
            <dataset-download-results :params="downloadParams" :total="data.total" />
          </v-row>
        </v-col>
      </v-row>

      <v-row v-if="filters.length" class="ma-0">
        <v-col class="pb-1 pt-2 pl-0">
          <dataset-filters v-model="filters" />
        </v-col>
      </v-row>
      <v-row class="ma-0">
        <v-col class="pl-0 pb-1 pt-2">
          <dataset-nb-results :total="data.total" class="ml-3" />
        </v-col>
      </v-row>
      <v-data-table
        :headers="selectedHeaders"
        :items="data.results"
        :server-items-length="data.total"
        :loading="loading"
        :options.sync="pagination"
        hide-default-header
        hide-default-footer
      >
        <template v-slot:header>
          <thead class="v-data-table-header">
            <tr>
              <th
                v-for="header in selectedHeaders"
                :key="header.text"
                :class="{'text-start': true, sortable: header.sortable, active : header.value === pagination.sortBy[0], asc: !pagination.sortDesc[0], desc: pagination.sortDesc[0]}"
                nowrap
                @click="orderBy(header)"
              >
                <v-tooltip
                  v-if="header.tooltip"
                  bottom
                  style="margin-right: 8px;"
                >
                  <template v-slot:activator="{ on }">
                    <v-icon small v-on="on">
                      mdi-information
                    </v-icon>
                  </template>
                  <span>{{ header.tooltip }}</span>
                </v-tooltip>
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
                  @filter="f => addFilter(header.value, f)"
                />
              </th>
            </tr>
          </thead>
        </template>
        <template v-slot:item="{item}">
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
                <a :href="item._attachment_url">{{ item[header.value] | truncate(50) }}</a>
              </template>
              <template v-else-if="webPageField && webPageField.key === header.value">
                <a
                  v-if="item[header.value]"
                  target="_blank"
                  :href="item[header.value]"
                >{{ item[header.value] | truncate(50) }}</a>
              </template>
              <template v-else>
                <div v-if="header.field.type === 'string' && header.field.separator" :style="`max-height: 40px; min-width: ${Math.min((item[header.value] + '').length, 50) * 6}px;`">
                  <v-chip-group
                    v-if="item[header.value]"
                    style="max-width:500px;"
                    show-arrows
                  >
                    <v-hover
                      v-for="(value, i) in item[header.value].split(header.field.separator).map(v => v.trim())"
                      v-slot:default="{ hover }"
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
                <v-hover v-else v-slot:default="{ hover }">
                  <div :style="`position: relative; max-height: 40px; min-width: ${Math.min((item[header.value] + '').length, 50) * 6}px;`">
                    <span>{{ item[header.value] | cellValues(header.field) }}</span>
                    <v-btn
                      v-if="hover && !item._tmpState && !filters.find(f => f.field.key === header.value) && header.filterable && isFilterable(item[header.value])"
                      fab
                      x-small
                      color="primary"
                      style="right: -10px;top: 50%;transform: translate(0, -50%);"
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
    </template>
  </v-container>
</template>

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
        itemsPerPage: 5,
        sortBy: [null],
        sortDesc: [false],
      },
      sort: null,
      notFound: false,
      loading: false,
      lineHeight: 40,
      filterHeight: 500,
      filters: [],
      lastParams: null,
      selectedCols: [],
    }),
    computed: {
      ...mapState(['vocabulary']),
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl', 'qMode']),
      headers() {
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
            field,
          }))

        if (this.imageField) {
          fieldsHeaders.unshift({ text: '', value: '_thumbnail' })
        }
        return fieldsHeaders
      },
      selectedHeaders() {
        if (this.selectedCols.length === 0) return this.headers
        return this.headers.filter(h => !h.field || this.selectedCols.includes(h.value))
      },
      imageField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
      },
      digitalDocumentField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
      webPageField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'https://schema.org/WebPage')
      },
      params() {
        const params = {
          size: this.pagination.itemsPerPage,
          page: this.pagination.page,
          q_mode: this.qMode,
          truncate: 50,
        }
        if (this.imageField) params.thumbnail = '40x40'
        if (this.pagination.sortBy[0]) {
          params.sort = (this.pagination.sortDesc[0] ? '-' : '') + this.pagination.sortBy[0]
        }
        if (this.query) params.q = this.query
        if (this.filters.length) {
          params.qs = filtersUtils.filters2qs(this.filters)
        }
        if (this.dataset.finalizedAt) params.finalizedAt = this.dataset.finalizedAt
        return params
      },
      downloadParams() {
        if (this.selectedCols.length === 0) return this.params
        return { ...this.params, select: this.selectedCols.join(',') }
      },
    },
    watch: {
      'dataset.schema'() {
        this.refresh(true)
      },
      pagination: {
        handler () {
          this.refresh()
        },
        deep: true,
      },
      filters: {
        handler () {
          this.setItemsPerPage()
          this.refresh(true)
        },
        deep: true,
      },
      selectedCols: {
        handler () {
          this.writeQueryParams()
        },
        deep: true,
      },
    },
    mounted() {
      this.readQueryParams()
      this.setItemsPerPage()
      this.refresh()
    },
    methods: {
      setItemsPerPage() {
        // adapt number of lines to window height
        const height = window.innerHeight
        let top = this.$vuetify.breakpoint.xs ? 150 : 100
        if (this.filters.length) top += 28
        const nbRows = Math.floor(Math.max(height - top, 120) / (this.lineHeight + 2))
        this.pagination.itemsPerPage = Math.min(Math.max(nbRows, 4), 50)
        this.filterHeight = height - top
      },
      async refresh(resetPagination) {
        this.writeQueryParams()
        if (resetPagination) {
          this.pagination.page = 1
          // this is debatable
          // but in case of full-text search you can forget that a sort is active
          // and be surprised by counter-intuitive results
          this.pagination.sortBy = [null]
        }

        // prevent triggering multiple times the same request
        const paramsStr = JSON.stringify(this.params)
        if (paramsStr === this.lastParams) return
        this.lastParams = paramsStr

        // this.data = {}
        this.loading = true
        try {
          this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params: this.params })
          // console.log('data', this.data)
          this.notFound = false
        } catch (error) {
          console.log('ERROR', error)
          if (error.status === 404) this.notFound = true
          else eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des données' })
        }
        this.loading = false
      },
      orderBy(header) {
        if (!header.sortable) return
        if (this.pagination.sortBy[0] === header.value) {
          this.$set(this.pagination.sortDesc, 0, !this.pagination.sortDesc[0])
        } else {
          this.$set(this.pagination.sortBy, 0, header.value)
          this.$set(this.pagination.sortDesc, 0, true)
        }
      },
      addFilter(key, filter) {
        if (typeof filter !== 'object') filter = { type: 'in', values: [filter] }
        filter.field = this.dataset.schema.find(f => f.key === key)
        this.filters = this.filters.filter(f => !(f.field.key === key))
        this.filters.push(filter)
      },
      isFilterable(value) {
        if (value === undefined || value === null || value === '') return false
        if (typeof value === 'string' && (value.length > 200 || value.startsWith('{'))) return false
        return true
      },
      readQueryParams() {
        const query = this.$route.query
        if (query.cols) this.selectedCols = query.cols.split(',')
        if (query.q) this.query = query.q
        this.filters = filtersUtils.readQueryParams(query, this.dataset)
      },
      writeQueryParams() {
        const query = { ...this.$route.query }

        if (this.selectedCols.length) query.cols = this.selectedCols.join(',')
        else delete query.cols

        if (this.query) query.q = this.query
        else delete query.q

        filtersUtils.writeQueryParams(this.filters, query)

        this.$router.push({ query })

        if (global.parent) parent.postMessage({ query }, '*')
      },
    },
  }
</script>

<style>
.embed .v-data-table td {
  white-space: nowrap;
}
</style>
