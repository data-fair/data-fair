<template lang="html">
  <v-container
    fluid
    class="pa-0"
  >
    <open-api
      v-if="resourceUrl"
      :url="resourceUrl + (can('readPrivateApiDoc') ? '/private-api-docs.json' : '/api-docs.json')"
    />
  </v-container>
</template>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  computed: {
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
