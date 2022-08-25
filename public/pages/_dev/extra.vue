<template>
  <v-container>
    <p>This page is for development of extra pages. Use it as an iframe inside another page.</p>
    <nuxt-link to="/_dev/extra2?param=value2">
      Go to extra2 page
    </nuxt-link>
  </v-container>
</template>

<script>
import '@koumoul/v-iframe/content-window.js'

export default {
  layout: 'embed',
  mounted () {
    window.vIframeOptions = { router: this.$router }
    console.log('extra1')
    parent.postMessage({
      breadcrumbs: [{
        text: 'Extra page'
      }]
    })
  }
}
</script>

<style lang="css" scoped>
</style>
