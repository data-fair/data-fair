<template>
  <nuxt-child v-if="dataset" />
</template>

<script>
import { mapState } from 'vuex'

export default {
  layout: 'embed',
  async fetch ({ store, params, route }) {
    try {
      const html = route.path.endsWith('/fields') || route.path.endsWith('/table')
      await store.dispatch('dataset/setId', { datasetId: route.params.id, html, fetchInfo: false })
      await Promise.all([
        store.dispatch('fetchVocabulary', route.params.id),
        store.dispatch('dataset/fetchDataset')
      ])
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
