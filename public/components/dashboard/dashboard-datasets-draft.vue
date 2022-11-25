<template>
  <dashboard-metric
    :value="nbDatasets"
    :title="$tc('datasetsDraft', nbDatasets)"
    :to="{name: 'datasets', query: {draftStatus: draftStatusFacet && draftStatusFacet.map(f => f.value).join(',')}}"
    color="warning"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsDraft: Brouillon en attente | Brouillon en attente | Brouillons en attente
en:
  datasetsDraft: Draft dataset | Draft dataset | Draft datasets
</i18n>

<script>
import statuses from '../../../shared/statuses.json'
const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      nbDatasets: null,
      draftStatusFacet: null
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount']),
    draftStatusFilter () {
      return Object.keys(statuses.dataset).join(',')
    }
  },
  async created () {
    const res = (await this.$axios.$get('api/v1/datasets', {
      params: { size: 0, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, draftStatus: this.draftStatusFilter, facets: 'draftStatus' }
    }))
    this.nbDatasets = res.count
    this.draftStatusFacet = res.facets.draftStatus
  }
}
</script>

<style lang="css" scoped>
</style>
