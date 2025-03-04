<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="resourceUrl"
      :url="resourceUrl + '/api-docs.json'"
    />
  </v-container>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  computed: {
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
