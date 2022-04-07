<template>
  <v-iframe :src="iframeUrl" />
</template>

<script>
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import { mapState } from 'vuex'
export default {
  components: { VIframe },
  computed: {
    ...mapState(['env']),
    iframeUrl () {
      const extra = this.env.extraAdminNavigationItems.find(e => e.id === this.$route.params.id)
      let url = extra && extra.iframe
      if (url && url.startsWith('/')) url = window.location.origin + url
      return url
    }
  }
}
</script>

<style lang="css" scoped>
</style>
