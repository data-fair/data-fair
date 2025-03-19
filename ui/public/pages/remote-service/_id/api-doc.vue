<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="resourceUrl && !env.openapiViewerV2"
      :url="resourceUrl"
    />
    <open-api
      v-else
      :id="remoteService.id"
      type="remoteService"
    />
  </v-container>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  async fetch ({ store, route }) {
    if (store.state.remoteService?.id !== route.params.id) {
      store.dispatch('remoteService/clear')
      await store.dispatch('remoteService/setId', route.params.id)
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('remoteService', ['remoteService']),
    ...mapGetters('remoteService', ['resourceUrl'])
  },
  created () {
    if (this.$store.state.remoteService) {
      this.$store.dispatch('breadcrumbs', [
        { text: this.$t('services'), to: '/remote-services' },
        { text: this.remoteService.title || this.remoteService.id, to: `/remote-service/${this.remoteService.id}`, exact: true },
        { text: 'API Docs' }
      ])
    }
  }
}
</script>

<style lang="css">
</style>
