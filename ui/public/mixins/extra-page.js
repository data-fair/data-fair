import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'

export default {
  components: { VIframe },
  computed: {
    iframeUrl () {
      if (!this.extra || !this.extra.iframe) return
      return new URL(this.extra.iframe, window.location.href)
    },
    iframePathName () {
      return this.iframeUrl.pathname.endsWith('/') ? this.iframeUrl.pathname : this.iframeUrl.pathname + '/'
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
          .map(b => ({ ...b, exact: true, to: b.to && { path: this.$route.path, query: { p: this.getBreadcrumbPath(b.to) } } }))
        this.$store.dispatch('breadcrumbs', localBreadcrumbs)
      }
    },
    getBreadcrumbPath (to) {
      let p = to
      if (p.startsWith('/') && this.extra.basePath) p = this.extra.basePath + p
      if (p === this.iframeUrl.pathname) return undefined
      if (p.startsWith(this.iframePathName)) p = p.replace(this.iframePathName, './')
      return p
    }
  }
}
