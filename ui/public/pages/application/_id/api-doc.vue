<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="resourceUrl && !env.openapiViewerV2"
      :url="resourceUrl + '/api-docs.json'"
    />
    <open-api
      v-else
      :id="application.id"
      type="application"
    />
  </v-container>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  async fetch ({ store, route }) {
    if (store.state.application?.applicationId !== route.params.id) {
      store.dispatch('application/clear')
      await store.dispatch('application/setId', route.params.id)
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapState('application', ['application']),
    ...mapGetters('application', ['resourceUrl'])
  },
  created () {
    if (this.application) {
      this.$store.dispatch('breadcrumbs', [
        { text: this.$t('applications'), to: '/applications' },
        { text: this.application.title || this.application.id, to: `/application/${this.application.id}`, exact: true },
        { text: 'API Docs' }
      ])
    }
  }
}
</script>

<style lang="css">
</style>
