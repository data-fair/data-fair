<template>
  <v-container fluid class="pa-0">
    <dataset-import-file v-if="$route.query.type === 'file'" />
    <dataset-create-virtual v-if="$route.query.type === 'virtual'" />
    <dataset-create-rest v-if="$route.query.type === 'rest'" />
  </v-container>
</template>

<script>
  export default {
    created() {
      let pageName
      if (this.$route.query.type === 'file') pageName = 'Importer un fichier'
      if (this.$route.query.type === 'virtual') pageName = 'Créer un jeu virtuel'
      if (this.$route.query.type === 'rest') pageName = 'Créer un jeu incrémental'
      this.$store.dispatch('breadcrumbs', [{ text: 'Jeux de données', to: '/datasets' }, { text: pageName }])
    },
  }
</script>

<style lang="css" scoped>
</style>
