<template lang="html">
  <d-frame
    :src="src"
    height="100vh"
    resize="no"
  />
</template>

<script>
import { mapState } from 'vuex'
import '@data-fair/frame/lib/d-frame.js'

export default {
  props: ['url'],
  computed: {
    ...mapState(['env']),
    src () {
      const url = this.env.openapiViewerUrl + '?hide-toolbar=true'
      return url + '&url=' + this.url
    }
  }
}
</script>

<style lang="css">
</style>
