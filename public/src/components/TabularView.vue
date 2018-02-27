<template>
  <div>
    <div v-if="notFound">
      <p>Les données ne sont pas accessibles. Soit le jeu de données n'a pas encore été entièrement traité, soit il y a eu une erreur dans le traitement.</p>
      <p>Vous pouvez consulter <router-link :to="{name: 'Dataset', params:{datasetId:dataset.id}, query:{tab:'journal'}}">le journal</router-link> pour en savoir plus.</p>
    </div>
    <md-table-card v-else>
      <md-layout>
        <md-layout md-flex="30" md-flex-offset="5" md-hide-small>
          <md-input-container>
            <label>Rechercher</label>
            <md-input v-model="query" @keyup.enter.native="refresh"/>
            <md-button class="md-icon-button" @click="refresh">
              <md-icon>search</md-icon>
            </md-button>
          </md-input-container>
        </md-layout>
        <md-layout md-flex="50" md-flex-offset="10" md-flex-small="90">
          <md-table-pagination :md-size="size" :md-total="data.total" :md-page="page" md-label="Lignes par page" md-separator="sur" @pagination="refresh" v-if="data.total !== undefined"/>
        </md-layout>
      </md-layout>
      <md-table @sort="orderBy">
        <md-table-header>
          <md-table-row>
            <md-table-head v-for="field in dataset.schema" :key="field.key" :md-tooltip="field.description || (field['x-refersTo'] && vocabulary && vocabulary[field['x-refersTo']] && vocabulary[field['x-refersTo']].description)" :md-sort-by="field.key">{{ field.title || field['x-originalName'] }}</md-table-head>
          </md-table-row>
        </md-table-header>

        <md-table-body>
          <md-table-row v-for="(row, i) in data.results" :key="i">
            <md-table-cell v-for="field in dataset.schema" :key="field.key">{{ ((row[field.key] === undefined || row[field.key] === null ? '' : row[field.key]) + '') | truncate(50) }}</md-table-cell>
          </md-table-row>
        </md-table-body>
      </md-table>
    </md-table-card>
  </div>
</template>

<script>
import { mapState } from 'vuex'

export default {
  name: 'TabularView',
  data: () => ({
    data: {},
    query: null,
    size: 10,
    page: 1,
    sort: null,
    notFound: false
  }),
  computed: {
    ...mapState(['vocabulary']),
    ...mapState('dataset', ['dataset'])
  },
  watch: {
    'dataset.schema'() {
      this.refresh()
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    refresh(pagination) {
      if (pagination) {
        this.size = pagination.size
        this.page = pagination.page
      }
      const params = {
        size: this.size,
        page: this.page
      }
      if (this.sort) params.sort = this.sort
      if (this.query) params.q = this.query
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/datasets/' + this.dataset.id + '/lines', {
        params
      }).then(results => {
        this.notFound = false
        this.data = results.body
      }, error => {
        if (error.status === 404) this.notFound = true
        else this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la récupération des données`)
      })
    },
    orderBy(options) {
      this.sort = (options.type === 'asc' ? '' : '-') + options.name
      this.refresh()
    }
  }
}
</script>
