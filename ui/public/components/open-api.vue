<template lang="html">
  <d-frame
    :src="src"
    :height="`${windowHeight - 48}px`"
    resize="no"
    sync-params
  />
</template>

<script>
import { mapState } from 'vuex'
import '@data-fair/frame/lib/d-frame.js'

export default {
  props: {
    type: {
      type: String,
      required: true
    },
    id: {
      type: String,
      required: false,
      default: ''
    }
  },
  computed: {
    ...mapState(['env']),
    src () {
      return this.env.openapiViewerUrl + `?urlType=${this.type}` + (this.id ? `&id=${this.id}` : '')
    }
  }
}
</script>

<style lang="css">
</style>
