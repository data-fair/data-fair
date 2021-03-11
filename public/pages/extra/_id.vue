<template>
  <v-iframe
    v-if="url"
    ref="iframe"
    :src="url"
    @message="onMessage"
  />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer'
  import VIframe from '@koumoul/v-iframe'
  import { mapState } from 'vuex'
  export default {
    components: { VIframe },
    data() {
      return {
        url: null,
        to: null,
      }
    },
    computed: {
      ...mapState(['env']),
      iframeUrl() {
        const extra = this.env.extraNavigationItems.find(e => e.id === this.$route.params.id)
        return extra && extra.iframe
      },
    },
    watch: {
      async '$route.query.to'() {
        if (!this.$route.query.to) {
          // left menu was re-clicked, reload iframe with starting url
          this.url = null
          await this.$nextTick()
          this.url = this.iframeUrl
        } else if (this.to !== this.$route.query.to) {
          // trigger navigation inside the iframe when our breadcrumb is clicked
          this.$refs.iframe.sendMessage({ to: this.$route.query.to })
        }
      },
    },
    mounted() {
      this.$store.dispatch('breadcrumbs', null)
      if (!this.iframeUrl) return
      // if the navigation to the extra page has an initial "to" query parameter we transmit it
      const url = new URL(this.iframeUrl)
      if (this.$route.query.to) url.searchParams.append('to', this.$route.query.to)
      this.url = url.href
    },
    methods: {
      // receiving a message from the iframe
      onMessage(message) {
        // the iframe navigated inside, we mirror it in our url
        if (message.to && message.to !== this.$route.query.to) {
          this.to = message.to
          this.$router.push({ query: { to: message.to } })
        }
        // the iframe requests that we display a breadcrumb
        // we mirror its internal paths by using them as a "to" query param for our own current page
        if (message.breadcrumbs) {
          const localBreadcrumbs = message.breadcrumbs
            .map(b => ({ ...b, exact: true, to: b.to && { path: this.$route.path, query: { to: b.to } } }))
          this.$store.dispatch('breadcrumbs', localBreadcrumbs)
        }
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
