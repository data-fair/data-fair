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
      return `/openapi-viewer?drawerLocation=right&urlType=${this.type}` + (this.id ? `&id=${this.id}` : '')
    }
  },
  methods: {
    ...mapActions(['emitFrameNotif'])
  }
}
</script>

<style lang="css">
</style>
