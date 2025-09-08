<template>
  <div v-if="iframeUrl">
    <d-frame
      v-if="extra.dFrame"
      :height="windowHeight - 48"
      :src="iframeUrl.href"
      sync-params
      @message="message => onMessage(message.detail)"
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

export default {
  mixins: [extraPageMixin],
  computed: {
    ...mapState(['env']),
    extra () {
      return this.env.extraAdminNavigationItems.find(e => e.id === this.$route.params.id)
    }
  }
}
</script>

<style lang="css" scoped>
</style>
