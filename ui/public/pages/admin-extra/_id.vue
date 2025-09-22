<template>
  <div>
    <v-iframe
      v-if="iframeUrl"
      :src="iframeUrl.href"
      :sync-state="true"
      @message="onMessage"
    />
    <v-alert
      v-if="!extra"
      type="error"
    >
      Page inconnue {{ $route.params.id }}
    </v-alert>
  </div>
</template>

<script>
import { mapState } from 'vuex'
import extraPageMixin from '~/mixins/extra-page'

export default {
  mixins: [extraPageMixin],
  computed: {
    ...mapState(['env']),
    extra () {
      const extra = this.env.extraNavigationItems.find(e => e.id === this.$route.params.id)
      if (!extra) {
        console.log('extra page not found', this.$route.params.id, this.env.extraNavigationItems)
      }
      return extra
    }
  }
}
</script>

<style lang="css" scoped>
</style>
