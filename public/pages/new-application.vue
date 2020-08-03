<template>
  <v-container fluid class="pa-0">
    <import />
  </v-container>
</template>

<script>
  import Import from '~/components/applications/import.vue'

  export default {
    components: { Import },
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
