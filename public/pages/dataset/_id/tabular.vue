<template>
  <div>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>Vous pouvez consulter <nuxt-link :to="`/dataset/${dataset.id}/journal`">le journal</nuxt-link> pour en savoir plus.</p>
    </div>
    <v-card>
      <v-card-title>
        <v-layout column>
          <h3 v-if="data.total <= 10000">Consultez {{ data.total.toLocaleString() }} {{ plural ? 'enregistrements' : 'enregistrement' }}</h3>
          <h3 v-if="data.total > 10000">Consultez {{ plural ? 'les' : 'le' }} {{ (10000).toLocaleString() }} {{ plural ? 'premiers enregistrements' : 'premier enregistrement' }} ({{ data.total.toLocaleString() }} au total)</h3>
          <v-layout row>
            <v-text-field
              v-model="query"
              label="Rechercher"
              append-icon="search"
              class="mr-3"
              style="min-width:150px;"
              @keyup.enter.native="refresh"
              @click:append="refresh"/>
            <v-spacer/>
            <v-flex v-if="data.total > pagination.rowsPerPage" sm4 md2 lg1 xl1>
              <v-select
                :items="[10,20,50]"
                v-model="pagination.rowsPerPage"
                label="Nombre de lignes"
              />
            </v-flex>
            <v-pagination v-if="data.total > pagination.rowsPerPage" v-model="pagination.page" :length="Math.ceil(Math.min(data.total, 10000) / pagination.rowsPerPage)" total-visible="7" class="mx-4"/>
          </v-layout>
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
          <td v-for="field in dataset.schema" :key="field.key">{{ ((props.item[field.key] === undefined || props.item[field.key] === null ? '' : props.item[field.key]) + '') | truncate(50) }}</td>
        </template>
      </v-data-table>
    </v-card>
  </div>
</template>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '../../../event-bus'

export default {
  data: () => ({
    data: {},
    query: null,
    select: [],
    pagination: {
      page: 1,
      rowsPerPage: 10,
      sortBy: null,
      descending: false
    },
    sort: null,
    notFound: false,
    loading: false
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    headers() {
      return this.dataset.schema
        .filter(field => !this.select.length || this.select.includes(field.key))
        .map(field => ({
          text: field.title || field['x-originalName'],
          value: field.key,
          sortable: (field.type === 'string' && field.format) || field.type === 'number' || field.type === 'integer',
          tooltip: field.description || (field['x-refersTo'] && this.vocabulary && this.vocabulary[field['x-refersTo']] && this.vocabulary[field['x-refersTo']].description)
        }))
    },
    plural() {
      return this.data.total > 1
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
        if (error.response && error.response.status === 404) this.notFound = true
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
