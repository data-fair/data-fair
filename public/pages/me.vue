<template>
  <v-iframe :src="env.directoryUrl + '/me?embed=true'" />
</template>

<script>
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import { mapState, mapGetters } from 'vuex'

export default {
  components: { VIframe },
  middleware: ['auth-required'],
  computed: {
    ...mapState(['env']),
    ...mapGetters(['missingSubscription']),
    ...mapGetters('session', ['activeAccount'])
  },
  mounted () {
    // this is intended mostly to react to page reload after the user created an organization
    if (this.missingSubscription && this.activeAccount.type === 'organization') this.$router.replace('/subscription')
    // react to page reload after user deletion
    if (!this.activeAccount) this.$router.replace('/')
  }
}
</script>

<style lang="css" scoped>
</style>
