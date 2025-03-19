<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="resourceUrl && !env.openapiViewerV2"
      :url="resourceUrl + (can('readPrivateApiDoc') ? '/private-api-docs.json' : '/api-docs.json')"
    />
    <open-api
      v-else
      :id="dataset.id"
      :type="can('readPrivateApiDoc') ? 'privateDataset' : 'dataset'"
    />
  </v-container>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  async fetch ({ store, route }) {
    if (store.state.dataset?.datasetId !== route.params.id) {
      store.dispatch('dataset/clear')
      await store.dispatch('dataset/setId', { datasetId: route.params.id, draftMode: true })
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl', 'can'])
  },
  created () {
    if (this.dataset) {
      this.$store.dispatch('breadcrumbs', [
        { text: this.$t('datasets'), to: '/datasets' },
        { text: this.dataset.title || this.dataset.id, to: `/dataset/${this.dataset.id}`, exact: true },
        { text: 'API Docs' }
      ])
    }
  }
}
</script>

<style lang="css">
</style>
