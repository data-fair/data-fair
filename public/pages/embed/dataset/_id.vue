<template>
  <nuxt-child v-if="dataset" />
</template>

<script>
import { mapState } from 'vuex'

export default {
  layout: 'embed',
  middleware: 'dynamic-theme',
  async fetch ({ store, params, route }) {
    try {
      await store.dispatch('dataset/setId', { datasetId: route.params.id })
      await store.dispatch('fetchVocabulary', route.params.id)
    } catch (err) {
      // in embed mode we prefer a blank page rather than showing an error
      console.error(err)
    }
  },
  computed: {
    ...mapState('dataset', ['dataset'])
  }
}
</script>
