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
      return 'https://koumoul.com/openapi-viewer/?proxy=false&hide-toolbar=true&url=' + encodeURIComponent(this.url)
    }
  }
}
</script>

<style lang="css">
iframe {
  background-color: transparent;
  border: none;
}
</style>
