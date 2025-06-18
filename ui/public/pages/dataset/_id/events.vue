<template lang="html">
  <d-frame
    :src="src"
    :height="`${windowHeight - 48}px`"
    resize="no"
    sync-params
  />
</template>

<script>
import '@data-fair/frame/lib/d-frame.js'
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
    ...mapGetters('dataset', ['resourceUrl', 'can']),
    src () {
      return `/events/embed/events?resource=${encodeURIComponent('dataset/' + this.$route.params.id)}`
    }
  },
  created () {
    if (this.dataset) {
      this.$store.dispatch('breadcrumbs', [
        { text: this.$t('datasets'), to: '/datasets' },
        { text: this.dataset.title || this.dataset.id, to: `/dataset/${this.dataset.id}`, exact: true },
        { text: 'Traçabilité (bêta)' }
      ])
    }
  }
}
</script>

<style lang="css">
</style>
