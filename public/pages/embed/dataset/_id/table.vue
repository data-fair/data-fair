<template>
  <div>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>
        Vous pouvez consulter <nuxt-link :to="`/dataset/${dataset.id}/journal`">
          le journal
        </nuxt-link> pour en savoir plus.
      </p>
    </div>
    <v-card>
      <v-card-title style="padding-bottom: 0;">
        <v-layout row wrap>
          <v-flex lg4 md5 sm6 xs12>
            <v-text-field
              v-model="query"
              label="Rechercher"
              append-icon="search"
              class="mr-3"
              style="min-width:150px;"
              @keyup.enter.native="refresh"
              @click:append="refresh"
            />
            <v-spacer />
          </v-flex>
          <v-spacer />
          <v-flex lg4 md5 sm6 xs12>
            <v-pagination v-if="data.total" v-model="pagination.page" :length="Math.floor(Math.min(data.total, 10000) / pagination.rowsPerPage)" :total-visible="$vuetify.breakpoint.lgAndUp ? 7 : 5" style="float:right;" />
          </v-flex>
        </v-layout>
      </v-card-title>

      <v-data-table :headers="headers" :items="data.results" :total-items="data.total" :loading="loading" :pagination.sync="pagination" hide-actions>
        <template slot="headers" slot-scope="props">
          <tr>
            <th
              v-for="header in props.headers"
              :key="header.text"
              :class="['column text-xs-left', header.sortable ? 'sortable' : '', pagination.descending ? 'desc' : 'asc', header.value === pagination.sortBy ? 'active' : '']"
            >
              <v-tooltip v-if="header.tooltip" bottom style="margin-right: 8px;">
                <span slot="activator"><v-icon small>info</v-icon></span>
                <span>{{ header.tooltip }}</span>
              </v-tooltip>
              <span @click="orderBy(header)">
                {{ header.text }}
                <v-icon v-if="header.sortable" small>arrow_upward</v-icon>
              </span>
            </th>
          </tr>
        </template>
        <template slot="items" slot-scope="props">
          <td v-for="header in headers" :key="header.value" :style="`height: ${lineHeight}px;`">
            {{ ((props.item[header.value] === undefined || props.item[header.value] === null ? '' : props.item[header.value]) + '') | truncate(50) }}
          </td>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '../../../../event-bus'

export default {
  data: () => ({
    data: {},
    query: null,
    select: [],
    pagination: {
      page: 1,
      rowsPerPage: 5,
      sortBy: '_i',
      descending: false
    },
    sort: null,
    notFound: false,
    loading: false,
    lineHeight: 40
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    headers() {
      return this.dataset.schema
        .filter(field => !field['x-calculated'])
        .filter(field => !this.select.length || this.select.includes(field.key))
        .map(field => ({
          text: field.title || field['x-originalName'] || field.key,
          value: field.key,
          sortable: (field.type === 'string' && field.format) || field.type === 'number' || field.type === 'integer',
          tooltip: field.description || (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description)
        }))
    }
  },
  watch: {
    'dataset.schema'() {
      this.refresh()
    },
    pagination: {
      handler () {
        this.refresh()
      },
      deep: true
    }
  },
  mounted() {
    // adapt number of lines to window height
    const height = window.innerHeight
    const top = this.$vuetify.breakpoint.xs ? 225 : 185
    const nbRows = Math.ceil(Math.max(height - top, 120) / (this.lineHeight + 1))
    this.pagination.rowsPerPage = Math.min(Math.max(nbRows, 4), 50)
    this.refresh()
  },
  methods: {
    async refresh() {
      // this.data = {}
      const params = {
        size: this.pagination.rowsPerPage,
        page: this.pagination.page
      }
      if (this.pagination.sortBy) params.sort = (this.pagination.descending ? '-' : '') + this.pagination.sortBy
      if (this.query) params.q = this.query
      if (this.select.length) params.select = this.select.join(',')
      this.loading = true
      try {
        this.data = await this.$axios.$get(this.resourceUrl + '/lines', { params })
        this.notFound = false
      } catch (error) {
        if (error.status === 404) this.notFound = true
        else eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération des données` })
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
    }
  }
}
</script>

<style>
.embed .v-datatable td {
  white-space: nowrap;
}
</style>
