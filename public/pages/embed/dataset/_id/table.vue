<template>
  <v-container fluid class="pa-0">
    <v-sheet v-if="notFound" class="pa-2">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
    </v-sheet>
    <template v-else>
      <v-row class="px-3">
        <v-col
          class="pb-0"
          lg="4"
          md="5"
          sm="6"
          cols="12"
        >
          <v-text-field
            v-model="query"
            placeholder="Rechercher"
            append-icon="mdi-magnify"
            style="min-width:150px;"
            solo
            dense
            hide-details
            @keyup.enter.native="refresh"
            @click:append="refresh"
          />
        </v-col>

        <v-col
          lg="8"
          md="7"
          sm="6"
          cols="12"
          class="pb-0"
        >
          <v-row justify="end" class="px-3">
            <v-spacer v-if="$vuetify.breakpoint.xs" />
            <v-pagination
              v-if="data.total"
              v-model="pagination.page"
              circle
              :length="Math.ceil(Math.min(data.total, 10000) / pagination.rowsPerPage)"
              :total-visible="$vuetify.breakpoint.lgAndUp ? 6 : 4"
              style="width: auto"
            />
            <v-spacer v-if="$vuetify.breakpoint.xs" />
            <v-icon>mdi-download</v-icon>
          </v-row>
        </v-col>
      </v-row>

      <v-data-table
        :headers="headers"
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
                v-for="header in headers"
                :key="header.text"
                :class="{'text-start': true, sortable: header.sortable, active : header.value === pagination.sortBy, asc: !pagination.descending, desc: !pagination.descending}"
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
              </th>
            </tr>
          </thead>
        </template>
        <template v-slot:item="{item}">
          <tr>
            <td
              v-for="header in headers"
              :key="header.value"
              :style="`height: ${lineHeight}px;`"
              class="pr-0 pl-4"
            >
              <template v-if="header.value === '_thumbnail'">
                <v-avatar
                  v-if="item._thumbnail"
                  tile
                  :size="40"
                >
                  <img :src="item._thumbnail">
                </v-avatar>
              </template>
              <template v-else-if="digitalDocumentField && digitalDocumentField.key === header.value">
                <a :href="item._attachment_url">{{ item[header.value] }}</a>
              </template>
              <template v-else>
                {{ ((item[header.value] === undefined || item[header.value] === null ? '' : item[header.value]) + '') | truncate(50) }}
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

  export default {
    data: () => ({
      data: {},
      query: null,
      select: [],
      pagination: {
        page: 1,
        rowsPerPage: 5,
        sortBy: null,
        descending: false,
      },
      sort: null,
      notFound: false,
      loading: false,
      lineHeight: 40,
    }),
    computed: {
      ...mapState(['vocabulary']),
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl']),
      headers() {
        const fieldsHeaders = this.dataset.schema
          .filter(field => !field['x-calculated'])
          .filter(field => !this.select.length || this.select.includes(field.key))
          .map(field => ({
            text: field.title || field['x-originalName'] || field.key,
            value: field.key,
            sortable: field.type === 'string' || field.type === 'number' || field.type === 'integer',
            tooltip: field.description || (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description),
          }))

        if (this.imageField) {
          fieldsHeaders.unshift({ text: '', value: '_thumbnail' })
        }
        return fieldsHeaders
      },
      imageField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
      },
      digitalDocumentField() {
        return this.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument')
      },
    },
    watch: {
      'dataset.schema'() {
        this.refresh()
      },
      pagination: {
        handler () {
          this.refresh()
        },
        deep: true,
      },
    },
    mounted() {
      // adapt number of lines to window height
      const height = window.innerHeight
      const top = this.$vuetify.breakpoint.xs ? 245 : 185
      const nbRows = Math.ceil(Math.max(height - top, 120) / (this.lineHeight + 1))
      this.pagination.rowsPerPage = Math.min(Math.max(nbRows, 4), 50)
      this.refresh()
    },
    methods: {
      async refresh() {
        // this.data = {}
        const params = {
          size: this.pagination.rowsPerPage,
          page: this.pagination.page,
        }
        if (this.imageField) params.thumbnail = '40x40'
        if (this.pagination.sortBy) params.sort = (this.pagination.descending ? '-' : '') + this.pagination.sortBy
        if (this.query) params.q = this.query
        if (this.select.length) params.select = this.select.join(',')
        this.loading = true
        try {
          this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
          console.log('data', this.data)
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
        if (this.pagination.sortBy === header.value) {
          this.pagination.descending = !this.pagination.descending
        } else {
          this.pagination.sortBy = header.value
          this.pagination.descending = true
        }
      },
    },
  }
</script>

<style>
.embed .v-datatable td {
  white-space: nowrap;
}
</style>
