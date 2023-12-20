<template>
  <application-config v-if="application" />
</template>

<script>
import { mapState } from 'vuex'

export default {
  middleware: ['auth-required'],
  async fetch ({ store, params, route }) {
    store.dispatch('application/clear')
    await store.dispatch('application/setId', route.params.id)
  },
  computed: {
    ...mapState('application', ['application'])
  },
  created () {
    // children pages are deprecated
    if (this.application) {
      this.$store.dispatch('breadcrumbs', [
        { text: this.$t('applications'), to: '/applications' },
        { text: this.application.title || this.application.id, to: `/application/${this.application.id}`, exact: true },
        { text: 'configuration' }
      ])
    }
  }
}
</script>
