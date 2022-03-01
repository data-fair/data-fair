<template>
  <v-container>
    <p>This page is also for development of extra pages.</p>
  </v-container>
</template>

<script>
export default {
  layout: 'embed',
  mounted () {
    console.log('extra2')
    parent.postMessage({ to: this.$route.path })
    parent.postMessage({
      breadcrumbs: [{
        text: 'Extra page ',
        to: '/_dev/extra'
      }, {
        text: 'Extra page 2'
      }]
    })
    window.addEventListener('message', (e) => {
      console.log(e)
      if (e.data && e.data.to && e.data.to !== this.$route.path) {
        this.$router.replace(e.data.to)
      }
    })
  }
}
</script>

<style lang="css" scoped>
</style>
