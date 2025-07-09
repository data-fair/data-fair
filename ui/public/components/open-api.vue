<template lang="html">
  <d-frame
    :src="src"
    :height="`${windowHeight - 48}px`"
    resize="no"
    sync-params
    @notif="emitFrameNotif"
  />
</template>

<script>
import { mapState, mapActions } from 'vuex'
import '@data-fair/frame/lib/d-frame.js'

export default {
  props: {
    type: {
      type: String,
      // required: true
      default: ''
    },
    id: {
      type: String,
      default: ''
    },
    url: {
      type: String,
      default: ''
    }
  },
  computed: {
    ...mapState(['env']),
    src () {
      if (this.env.openapiViewerV2) return this.env.openapiViewerUrl + `?drawerLocation=right&urlType=${this.type}` + (this.id ? `&id=${this.id}` : '')
      else return this.env.openapiViewerUrl + '?hide-toolbar=true&drawerLocation=right' + '&url=' + this.url
    }
  },
  methods: {
    ...mapActions(['emitFrameNotif'])
  }
}
</script>

<style lang="css">
</style>
