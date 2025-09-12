<template>
  <div>
    <nuxt-child />
    <d-frame
      :height="(windowHeight - 48) + 'px'"
      src="/catalogs/"
      sync-params
      sync-path="/data-fair/catalogs/"
      @message="message => onMessage(message.detail)"
    />
  </div>
</template>

<script>
import '@data-fair/frame/lib/d-frame.js'

export default {
  methods: {
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
</script>

<style lang="css" scoped>
</style>
