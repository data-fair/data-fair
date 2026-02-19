<template lang="html">
  <div>
    <nuxt-child />
    <d-frame
      :src="`/data-fair/embed/remote-services/`"
      :height="(windowHeight - 48) + 'px'"
      resize="no"
      emit-iframe-messages
      sync-params
      sync-path="/data-fair/remote-services/"
      :adapter.prop="stateChangeAdapter"
      debug
      @message="message => onMessage(message.detail)"
      @iframe-message="message => onMessage(message.detail)"
      @notif="emitFrameNotif"
    />
  </div>
</template>

<script>
import { mapActions } from 'vuex'
import '@data-fair/frame/lib/d-frame.js'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'

export default {
  middleware: ['auth-required'],
  computed: {
    stateChangeAdapter () {
      return createStateChangeAdapter(this.$router)
    }
  },
  methods: {
    ...mapActions(['emitFrameNotif']),
    onMessage (message) {
      // the iframe requests that we display a breadcrumb
      // we mirror its internal paths by using them as a "to" query param for our own current page
      if (message.breadcrumbs) {
        const localBreadcrumbs = message.breadcrumbs
          .map(b => ({ ...b, exact: true, to: b.to && { path: b.to } }))
        this.$store.dispatch('breadcrumbs', localBreadcrumbs)
      }
    }
  }
}
</script>

<style lang="css">
</style>
