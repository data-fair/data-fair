<template>
  <!--<dashboard-metric
    :value="nbDatasets"
    :title="$tc('datasetsDraft', nbDatasets)"
    :to="{name: 'datasets', query: {draftStatus: draftStatusFacet && draftStatusFacet.map(f => f.value).join(',')}}"
    color="warning"
  />-->

  <dashboard-svg-link
    :to="nbDatasets ? {name: 'datasets', query: {draftStatus: draftStatusFacet && draftStatusFacet.map(f => f.value).join(',')}} : null"
    :title="$tc('datasetsDraft', nbDatasets)"
    :svg="$vuetify.breakpoint.smAndUp ? draftSvg : ''"
    :color="nbDatasets ? 'warning' : '#9E9E9E'"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsDraft: Aucun brouillon en attente | 1 brouillon en attente | {n} brouillons en attente
en:
  datasetsDraft: No draft dataset | 1 draft dataset | {n} draft datasets
</i18n>

<script>
import statuses from '../../../shared/statuses.json'
const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      nbDatasets: null,
      draftStatusFacet: null,
      draftSvg: require('~/assets/svg/Under Constructions _Two Color.svg?raw')
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
      params: { size: 0, shared: false, draftStatus: this.draftStatusFilter, facets: 'draftStatus' }
    }))
    this.nbDatasets = res.count
    this.draftStatusFacet = res.facets.draftStatus
  }
}
</script>

<style lang="css" scoped>
</style>
