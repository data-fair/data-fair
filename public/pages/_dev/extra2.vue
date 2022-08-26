<template>
  <v-container>
    <p>This page is also for development of extra pages.</p>
    <nuxt-link to="/_dev/extra?param=value1">
      Go to extra1 page
    </nuxt-link>
  </v-container>
</template>

<script>
export default {
  layout: 'embed',
  mounted () {
    console.log('extra2')
    parent.postMessage({
      breadcrumbs: [{
        text: 'Extra page ',
        to: '/_dev/extra'
      }, {
        text: 'Extra page 2'
      }]
    })
  }
}
</script>

<style lang="css" scoped>
</style>
