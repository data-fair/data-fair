<template>
  <dashboard-metric
    :value="nbDatasets"
    :title="$tc('datasetsError', nbDatasets)"
    :to="{name: 'datasets', query: {status: 'error'}}"
    color="error"
  />
</template>

<i18n lang="yaml">
fr:
  datasetsError: Jeu de données en erreur | Jeu de données en erreur | Jeux de données en erreur
en:
  datasetsError: Dataset in error | Dataset in error | Datasets in error
</i18n>

<script>

const { mapGetters } = require('vuex')

export default {
  data () {
    return {
      nbDatasets: null
    }
  },
  computed: {
    ...mapGetters('session', ['activeAccount'])
  },
  async created () {
    this.nbDatasets = (await this.$axios.$get('api/v1/datasets', {
      params: { size: 0, owner: `${this.activeAccount.type}:${this.activeAccount.id}`, status: 'error' }
    })).count
  }
}
</script>

<style lang="css" scoped>
</style>
