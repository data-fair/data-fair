<template>
  <v-container
    fluid
    class="pa-0"
  >
    <dataset-import-file v-if="$route.query.type === 'file'" />
    <dataset-create-virtual v-if="$route.query.type === 'virtual'" />
    <dataset-create-rest v-if="$route.query.type === 'rest'" />
    <dataset-create-meta-only v-if="$route.query.type === 'metaOnly'" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasets: Jeux de données
  file: Importer un fichier
  virtual: Créer un jeu virtuel
  rest: Créer un jeu incrémental
  metaOnly: Créer un jeu de métadonnées seules
en:
  datasets: Datasets
  file: Import a file
  virtual: Create a virtual dataset
  rest: Create an incremental dataset
  metaOnly: Create a metadata only dataset
</i18n>

<script>
export default {
  created () {
    let pageName
    if (this.$route.query.type === 'file') pageName = this.$t('file')
    if (this.$route.query.type === 'virtual') pageName = this.$t('virtual')
    if (this.$route.query.type === 'rest') pageName = this.$t('rest')
    if (this.$route.query.type === 'metaOnly') pageName = this.$t('metaOnly')
    this.$store.dispatch('breadcrumbs', [{ text: this.$t('datasets'), to: '/datasets' }, { text: pageName }])
  }
}
</script>

<style lang="css" scoped>
</style>
