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
