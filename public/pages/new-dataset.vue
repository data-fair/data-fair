<template>
  <v-container fluid class="pa-0">
    <import-file v-if="$route.query.type === 'file'" />
    <create-virtual v-if="$route.query.type === 'virtual'" />
    <create-rest v-if="$route.query.type === 'rest'" />
  </v-container>
</template>

<script>
  import ImportFile from '~/components/datasets/import-file.vue'
  import CreateVirtual from '~/components/datasets/create-virtual.vue'
  import CreateRest from '~/components/datasets/create-rest.vue'

  export default {
    components: { ImportFile, CreateVirtual, CreateRest },
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
