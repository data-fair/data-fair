<template>
  <v-app class="embed">
    <v-main>
      <nuxt />
      <layout-notifications />
    </v-main>
  </v-app>
</template>

<script>
import '@koumoul/v-iframe/content-window.js'
import vueRouterDFrameContent from '@data-fair/frame/lib/vue-router/d-frame-content.js'

export default {
  head () {
    return {
      htmlAttrs: { lang: this.$i18n.locale }, // TODO: this should be set by nuxt-i18n but it isn't for some reason
      style: [{ vmid: 'dynamic-style', cssText: this.$store.getters.style(), type: 'text/css' }],
      __dangerouslyDisableSanitizers: ['style']
    }
  },
  created () {
    if (this.$route.query['d-frame'] === 'true') {
      vueRouterDFrameContent(this.$router)
    } else {
      global.vIframeOptions = { router: this.$router, reactiveParams: true }
    }
  }
}

</script>

<style lang="css">
/* hidden by default to prevent glitch when first displaying the page in embed mode */
html {
  overflow-y: auto;
}
</style>
