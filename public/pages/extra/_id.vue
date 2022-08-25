<template>
  <v-iframe
    v-if="iframeUrl"
    :src="iframeUrl"
    :sync-state="true"
    @message="onMessage"
  />
</template>

<script>
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import { mapState } from 'vuex'
export default {
  components: { VIframe },
  data () {
    return {
      to: null
    }
  },
  computed: {
    ...mapState(['env']),
    iframeUrl () {
      const extra = this.env.extraNavigationItems.find(e => e.id === this.$route.params.id)
      if (!extra && extra.url) return
      return new URL(extra && extra.iframe, window.location.href).href
    }
  },
  mounted () {
    this.$store.dispatch('breadcrumbs', null)
  },
  methods: {
    // receiving a message from the iframe
    onMessage (message) {
      // the iframe requests that we display a breadcrumb
      // we mirror its internal paths by using them as a "to" query param for our own current page
      if (message.breadcrumbs) {
        const localBreadcrumbs = message.breadcrumbs
          .map(b => ({ ...b, exact: true, to: b.to && { path: this.$route.path, query: { p: b.to } } }))
        this.$store.dispatch('breadcrumbs', localBreadcrumbs)
      }
    }
  }
}
</script>

<style lang="css" scoped>
</style>
