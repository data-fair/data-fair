<template>
  <div v-if="application">
    <d-frame
      v-if="application.baseApp?.meta?.['df:vjsf'] === '3'"
      :src="`/data-fair/next-ui/embed/application/${$route.params.id}/config`"
      :height="`${windowHeight - 48}px`"
      resize="no"
      sync-params
    />
    <lazy-application-config v-else />
  </div>
</template>

<script>
import '@data-fair/frame/lib/d-frame.js'
import { mapState } from 'vuex'

export default {
  middleware: ['auth-required'],
  meta: {
    htmlScroll: 'auto'
  },
  async fetch ({ store, params, route }) {
    if (store.state.application?.applicationId !== route.params.id) {
      store.dispatch('application/clear')
      await store.dispatch('application/setId', route.params.id)
    }
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
