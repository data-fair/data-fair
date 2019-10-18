<template lang="html">
  <div>
    <v-iframe :src="src" />
  </div>
</template>

<script>
import { mapState } from 'vuex'
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'

export default {
  components: {
    VIframe
  },
  props: ['url'],
  data() {
    return { height: null }
  },
  computed: {
    ...mapState(['env']),
    src() {
      const url = this.env.openapiViewerUrl + '?proxy=false&hide-toolbar=true'
      return url + '&url=' + this.url
    }
  }
}
</script>

<style lang="css">
</style>
