<template lang="html">
  <iframe :src="src" :height="height" width="100%"/>
</template>

<script>
import {mapGetters} from 'vuex'

export default {
  props: ['url'],
  computed: {
    ...mapGetters('dataset', ['resourceUrl']),
    height() {
      return Math.max(window.innerHeight, 1000)
    },
    src() {
      let url = 'https://koumoul.com/openapi-viewer/?proxy=false&hide-toolbar=true'
      if (this.$store.state.jwt) url += '&headers=' + encodeURIComponent(JSON.stringify({Authorization: 'Bearer ' + this.$store.state.jwt}))
      return url + '&url=' + this.url
    }
  }
}
</script>

<style lang="css">
</style>
