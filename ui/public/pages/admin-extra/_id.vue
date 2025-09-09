<template>
  <div v-if="iframeUrl">
    <d-frame
      v-if="extra.dFrame"
      :height="(windowHeight - 48) + 'px'"
      :src="iframeUrl.href"
      sync-params
      sync-path
      emit-iframe-messages
      :adapter.prop="stateChangeAdapter"
      @message="message => onMessage(message.detail)"
      @iframe-message="message => onMessage(message.detail)"
    />
    <v-iframe
      v-else
      :src="iframeUrl.href"
      :sync-state="true"
      @message="onMessage"
    />
  </div>
</template>

<script>
import { mapState } from 'vuex'
import extraPageMixin from '~/mixins/extra-page'
import '@data-fair/frame/lib/d-frame.js'
import createStateChangeAdapter from '@data-fair/frame/lib/vue-router/state-change-adapter'

export default {
  mixins: [extraPageMixin],
  computed: {
    ...mapState(['env']),
    extra () {
      return this.env.extraNavigationItems.find(e => e.id === this.$route.params.id)
    },
    stateChangeAdapter () {
      return createStateChangeAdapter(this.$router)
    }
  }
}
</script>

<style lang="css" scoped>
</style>
