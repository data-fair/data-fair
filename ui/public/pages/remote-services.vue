<template lang="html">
  <d-frame
    :src="`/data-fair/embed/remote-services`"
    :height="(windowHeight - 48) + 'px'"
    resize="no"
    @notif="emitFrameNotif"
  />
</template>

<script>
import { mapActions } from 'vuex'

export default {
  middleware: ['auth-required'],
  methods: {
    ...mapActions(['emitFrameNotif'])
  }
}
</script>

<style lang="css">
</style>
