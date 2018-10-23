<template lang="html">
  <div>
    <iframe v-resize id="openapi-iframe" :src="src" width="100%" scrolling="no" height="300px"/>
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex'
import Vue from 'vue'
import iFrameResize from 'iframe-resizer/js/iframeResizer'

Vue.directive('resize', {
  inserted: function (el) {
    iFrameResize({ minHeight: 300 }, '#' + el.id)
  }
})

export default {
  props: ['url'],
  data() {
    return { height: null }
  },
  computed: {
    ...mapState(['env']),
    ...mapGetters('dataset', ['resourceUrl']),
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
