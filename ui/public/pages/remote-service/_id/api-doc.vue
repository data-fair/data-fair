<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      :id="remoteService.id"
      type="remoteService"
    />
  </v-container>
</template>

<script>
import { mapState } from 'vuex'

export default {
  async fetch ({ store, route }) {
    if (store.state.remoteService?.id !== route.params.id) {
      store.dispatch('remoteService/clear')
      await store.dispatch('remoteService/setId', route.params.id)
    }
  },
  computed: {
    ...mapState('remoteService', ['remoteService']),
  },
  created () {
    if (this.$store.state.remoteService) {
      this.$store.dispatch('breadcrumbs', [
        { text: this.$t('remoteServices'), to: '/remote-services' },
        { text: this.remoteService.title || this.remoteService.id, to: `/remote-service/${this.remoteService.id}`, exact: true },
        { text: 'API Docs' }
      ])
    }
  }
}
</script>

<style lang="css">
</style>
