<template lang="html">
  <iframe :src="src" :height="height" width="100%"/>
</template>

<script>
import { mapGetters, mapState } from 'vuex'

export default {
  props: ['url'],
  computed: {
    ...mapState(['env']),
    ...mapGetters('dataset', ['resourceUrl']),
    height() {
      return Math.max((process.browser && window.innerHeight) || 0, 1000)
    },
    src() {
      let url = this.env.openapiViewerUrl + '?proxy=false&hide-toolbar=true'
      if (this.$store.state.jwt) url += '&headers=' + encodeURIComponent(JSON.stringify({ Authorization: 'Bearer ' + this.$store.state.jwt }))
      return url + '&url=' + this.url
    }
  }
}
</script>

<style lang="css">
</style>
