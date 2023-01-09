<template>
  <!--<dashboard-metric
    :value="nbDatasets"
    :title="$tc('datasetsError', nbDatasets)"
    :to="{name: 'datasets', query: {status: 'error'}}"
    color="error"
  />-->

  <dashboard-svg-link
    :to="nbDatasets ? {name: 'datasets', query: {status: 'error'}} : null"
    :title="$tc('datasetsError', nbDatasets)"
    :svg="$vuetify.breakpoint.smAndUp ? errorSvg : ''"
    :color="nbDatasets ? 'error' : '#9E9E9E'"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsError: Aucun jeu de données en erreur | 1 jeu de données en erreur | {n} jeux de données en erreur
en:
  datasetsError: No dataset in error | 1 dataset in error | {n} datasets in error
</i18n>

<script>

const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      nbDatasets: null,
      errorSvg: require('~/assets/svg/Under Constructions_Two Color.svg?raw')
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  async created () {
    this.nbDatasets = (await this.$axios.$get('api/v1/datasets', {
      params: { size: 0, shared: false, status: 'error' }
    })).count
  }
}
</script>

<style lang="css" scoped>
</style>
