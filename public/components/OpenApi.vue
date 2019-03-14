<template lang="html">
  <div>
    <iframe id="openapi-iframe" :src="src" width="100%" scrolling="no" height="300px" />
  </div>
</template>

<script>
import { mapGetters, mapState } from 'vuex'
import iFrameResize from 'iframe-resizer/js/iframeResizer'

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
      return url + '&url=' + this.url
    }
  },
  mounted() {
    iFrameResize({ minHeight: 300 }, '#openapi-iframe')
  }
}
</script>

<style lang="css">
</style>
