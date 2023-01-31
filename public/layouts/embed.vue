<template>
  <v-app class="embed">
    <layout-dynamic-style />
    <v-main>
      <nuxt />
      <layout-notifications />
    </v-main>
  </v-app>
</template>

<script>
import '@koumoul/v-iframe/content-window.js'

export default {
  head () {
    return {
      htmlAttrs: { lang: this.$i18n.locale }, // TODO: this should be set by nuxt-i18n but it isn't for some reason
      style: [{ vmid: 'dynamic-style', cssText: this.$store.getters.style(), type: 'text/css' }],
      __dangerouslyDisableSanitizers: ['style']
    }
  },
  created () {
    global.vIframeOptions = { router: this.$router }
  }
}

</script>

<style lang="css">
/* hidden by default to prevent glitch when first displaying the page in embed mode */
html {
  overflow-y: auto;
}
</style>
