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
      const html = route.path.endsWith('/fields') || route.path.endsWith('/table')
      await store.dispatch('dataset/setId', { datasetId: route.params.id, html })
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
