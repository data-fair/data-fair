<template>
  <div>
    <nuxt-child />
    <d-frame
      id="processings"
      :height="(windowHeight - 48) + 'px'"
      src="/processings/admin/plugins/"
      sync-params
      resize="no"
      :adapter.prop="stateChangeAdapter"
      @notif="emitFrameNotif"
    />
  </div>
</template>

<script>
import { mapActions } from 'vuex'
import '@data-fair/frame/lib/d-frame.js'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'

export default {
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

<style lang="css" scoped>
</style>
