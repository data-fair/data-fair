<template>
  <div>
    <nuxt-child />
    <d-frame
      id="portals-manager"
      :height="(windowHeight - 48) + 'px'"
      src="/portals/"
      sync-params
      sync-path="/data-fair/portals-manager/"
      emit-iframe-messages
      resize="no"
      :adapter.prop="stateChangeAdapter"
      @message="message => onMessage(message.detail)"
      @iframe-message="message => onMessage(message.detail)"
    />
  </div>
</template>

<script>
import '@data-fair/frame/lib/d-frame.js'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'

export default {
  computed: {
    stateChangeAdapter () {
      return createStateChangeAdapter(this.$router)
    }
  },
  methods: {
    onMessage (message) {
      // the iframe requests that we display a breadcrumb
      // we mirror its internal paths by using them as a "to" query param for our own current page
      if (message.breadcrumbs) {
        const localBreadcrumbs = message.breadcrumbs
          .map(b => ({ ...b, exact: true, to: b.to && { path: '/portals' + b.to } }))
        this.$store.dispatch('breadcrumbs', localBreadcrumbs)
      }
    }
  }
}
</script>

<style lang="css" scoped>
</style>
