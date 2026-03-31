<template lang="html">
  <d-frame
    :src="`/data-fair/embed/settings`"
    :height="(windowHeight - 48) + 'px'"
    sync-params
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @notif="emitFrameNotif"
  />
</template>

<script>
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { mapActions, mapGetters } from 'vuex'

export default {
  async beforeRouteLeave (to, from, next) {
    await this.$store.dispatch('fetchLicenses', this.activeAccount)
    await this.$store.dispatch('fetchTopics', this.activeAccount)
    await this.$store.dispatch('fetchDatasetsMetadata', this.activeAccount)
    await this.$store.dispatch('fetchDatasetsMetadata', this.activeAccount)
    await this.$store.dispatch('fetchPublicationSites', this.activeAccount)
    await this.$store.dispatch('fetchVocabulary', true)
    next()
  },
  middleware: ['auth-required'],
  computed: {
    stateChangeAdapter () {
      return createStateChangeAdapter(this.$router)
    },
    ...mapGetters('session', ['activeAccount']),
  },
  methods: {
    ...mapActions(['emitFrameNotif'])
  }
}
</script>

<style lang="css">
</style>
