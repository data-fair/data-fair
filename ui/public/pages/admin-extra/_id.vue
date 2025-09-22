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
      return this.env.extraAdminNavigationItems.find(e => e.id === this.$route.params.id)
    }
  }
}
</script>

<style lang="css" scoped>
</style>
