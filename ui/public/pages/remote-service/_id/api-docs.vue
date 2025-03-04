<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="resourceUrl"
      :url="resourceUrl"
    />
  </v-container>
</template>

<script>
export default {
  computed: {
    resourceUrl () {
      return this.$store.state.env.publicUrl + '/api/v1/api-docs.json'
    }
  },
  created () {
    if (this.$store.state.remoteService) {
      this.$store.dispatch('breadcrumbs', [
        { text: this.$t('remoteServices'), to: '/remote-services' },
        { text: this.$store.state.remoteService.title || this.$store.state.remoteService.id, to: `/remote-services/${this.$store.state.remoteService.id}`, exact: true },
        { text: 'API Docs' }
      ])
    }
  }
}
</script>

<style lang="css">
</style>
