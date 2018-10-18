<template lang="html">
  <iframe :src="src" :height="height" width="100%" class="pt-2"/>
</template>

<script>
import { mapGetters, mapState } from 'vuex'

export default {
  props: ['url'],
  computed: {
    ...mapState(['env']),
    ...mapGetters('dataset', ['resourceUrl']),
    height() {
      return ((process.browser && window.innerHeight) || 3000) - 200
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
