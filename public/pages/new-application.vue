<template>
  <v-container fluid class="pa-0">
    <application-import />
  </v-container>
</template>

<script>

  export default {
    async fetch({ store }) {
      await store.dispatch('fetchVocabulary')
    },
    created() {
      this.$store.dispatch('breadcrumbs', [{ text: 'Visualisations', to: '/applications' }, { text: 'Configurer une visualisation' }])
    },
  }
</script>

<style lang="css" scoped>
</style>
