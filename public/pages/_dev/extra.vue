<template>
  <v-container>
    <p>This page is for development of extra pages. Use it as an iframe inside another page.</p>
    <nuxt-link to="/_dev/extra2?param=value2">
      Go to extra2 page
    </nuxt-link>
    <br>
    <nuxt-link to="/embed/dataset/test-10/table">
      Go to embedded table
    </nuxt-link>
    <br>
    <v-btn @click="$router.push({ query: {param2: 'value1'} })">
      Write param2
    </v-btn>
    <v-btn @click="$router.push({ query: {param3: 'value1'} })">
      Write param3
    </v-btn>
    <v-btn @click="$router.push({ query: {} })">
      Empty params
    </v-btn>
  </v-container>
</template>

<script>
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
