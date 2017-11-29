<template>
<md-table-card>
  <md-table @sort="orderBy">
    <md-table-header>
      <md-table-row>
        <md-table-head v-for="(fieldInfos, field) in dataset.schema" :md-tooltip="fieldInfos.description" :md-numeric="fieldInfos.type === 'number' || fieldInfos.type === 'integer'" :md-sort-by="field">{{fieldInfos.title || fieldInfos['x-originalName']}}</md-table-head>
      </md-table-row>
    </md-table-header>

    <md-table-body>
      <md-table-row v-for="row in data.results">
        <md-table-cell v-for="(fieldInfos, field) in dataset.schema" :md-numeric="fieldInfos.type === 'number' || fieldInfos.type === 'integer'">{{row[field]}}</md-table-cell>
      </md-table-row>
    </md-table-body>
  </md-table>

  <md-table-pagination :md-size="size" :md-total="data.total" :md-page="page" md-label="Lignes par page" md-separator="sur" @pagination="refresh"></md-table-pagination>
</md-table-card>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'tabular-view',
  props: ['dataset'],
  data: () => ({
    data: {},
    size: 10,
    page: 1,
    sort: null
  }),
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
      if(this.sort) params.sort = this.sort
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
