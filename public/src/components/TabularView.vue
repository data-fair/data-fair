<template>
  <div>
    <md-table-card>
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
            <md-table-head v-for="field in dataset.schema" :key="field.key" :md-tooltip="field.description || (field['x-refersTo'] && vocabulary[field['x-refersTo']])" :md-numeric="field.type === 'number' || field.type === 'integer'" :md-sort-by="field.key">{{ field.title || field['x-originalName'] }}</md-table-head>
          </md-table-row>
        </md-table-header>

        <md-table-body>
          <md-table-row v-for="(row, i) in data.results" :key="i">
            <md-table-cell v-for="field in dataset.schema" :key="field.key" :md-numeric="field.type === 'number' || field.key.type === 'integer'">{{ (row[field.key] + '') | truncate(50) }}</md-table-cell>
          </md-table-row>
        </md-table-body>
      </md-table>
    </md-table-card>
  </div>
</template>

<script>

export default {
  name: 'TabularView',
  props: ['dataset'],
  data: () => ({
    data: {},
    query: null,
    size: 10,
    page: 1,
    sort: null,
    vocabulary: {}
  }),
  mounted() {
    this.refresh()
    this.$http.get(window.CONFIG.publicUrl + '/api/v1/vocabulary').then(results => {
      results.data.forEach(term => term.identifiers.forEach(id => { this.vocabulary[id] = term.description }))
    })
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
        this.data = results.body
      }, error => {
        this.$store.dispatch('notifyError', `Erreur ${error.status} pendant la récupération des données`)
      })
    },
    orderBy(options) {
      this.sort = (options.type === 'asc' ? '' : '-') + options.name
      this.refresh()
    }
  }
}
</script>
