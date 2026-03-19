<template>
  <d-frame
    :src="`/data-fair/embed/workflow/update-dataset`"
    :height="(windowHeight - 48) + 'px'"
    sync-params
    resize="no"
    :adapter.prop="stateChangeAdapter"
    @notif="emitFrameNotif"
  />
</template>

<script>
import '@data-fair/frame/lib/d-frame.js'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'
import { mapActions } from 'vuex'

export default {
  middleware: ['auth-required'],
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
