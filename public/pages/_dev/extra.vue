<template>
  <v-container>
    <p>This page is for development of extra pages. Use it as an iframe inside another page.</p>
    <nuxt-link to="/_dev/extra2">
      Go to extra2 page
    </nuxt-link>
  </v-container>
</template>

<script>
export default {
  layout: 'embed',
  mounted () {
    console.log('extra1')
    if (this.$route.query.to && this.$route.query.to !== this.$route.path) {
      return this.$router.replace(this.$route.query.to)
    }
    parent.postMessage({ to: this.$route.path })
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
