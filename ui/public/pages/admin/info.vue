<template lang="html">
  <d-frame
    :src="`/data-fair/embed/admin/info`"
    :height="(windowHeight - 48) + 'px'"
    sync-params
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @notif="emitFrameNotif"
  />
</template>

<script>
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { mapActions } from 'vuex'

export default {
  middleware: ['admin-required'],
  computed: {
    stateChangeAdapter () {
      return createStateChangeAdapter(this.$router)
    }
  },
  methods: {
    ...mapActions(['emitFrameNotif'])
  }
}
</script>

<style lang="css">
</style>
