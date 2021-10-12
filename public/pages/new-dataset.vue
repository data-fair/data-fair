<template>
  <v-container fluid class="pa-0">
    <dataset-import-file v-if="$route.query.type === 'file'" />
    <dataset-create-virtual v-if="$route.query.type === 'virtual'" />
    <dataset-create-rest v-if="$route.query.type === 'rest'" />
    <dataset-create-meta-only v-if="$route.query.type === 'metaOnly'" />
  </v-container>
</template>

<i18n lang="yaml">
fr:
  file: Importer un fichier
  virtual: Créer un jeu virtuel
  rest: Créer un jeu incrémental
  metaOnly: Créer un jeu de métadonnées seules
</i18n>

<script>
  export default {
    created() {
      let pageName
      if (this.$route.query.type === 'file') pageName = this.$t('file')
      if (this.$route.query.type === 'virtual') pageName = this.$t('virtual')
      if (this.$route.query.type === 'rest') pageName = this.$t('rest')
      if (this.$route.query.type === 'metaOnly') pageName = this.$t('metaOnly')
      this.$store.dispatch('breadcrumbs', [{ text: 'Jeux de données', to: '/datasets' }, { text: pageName }])
    },
  }
</script>

<style lang="css" scoped>
</style>
