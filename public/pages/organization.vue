<template>
  <v-iframe
    v-if="authorized"
    :src="`${env.directoryUrl}/organization/${activeAccount.id}?embed=true&redirect=${encodeURIComponent(env.publicUrl)}`"
  />
  <layout-not-authorized v-else />
</template>

<script>
import 'iframe-resizer/js/iframeResizer'
import VIframe from '@koumoul/v-iframe'
import { mapState, mapGetters } from 'vuex'

export default {
  components: { VIframe },
  computed: {
    ...mapState(['env']),
    ...mapState('session', ['user']),
    ...mapGetters('session', ['activeAccount']),
    authorized () {
      if (!this.user) return false
      if (this.activeAccount.type === 'user') return false
      if (this.activeAccount.type === 'organization') {
        const organization = this.user.organizations.find(o => o.id === this.activeAccount.id)
        if (!organization) return false
        if (organization.role !== this.env.adminRole) return false
      }
      return true
    }
  },
  mounted () {
    if (this.activeAccount && this.activeAccount.type === 'user') this.$router.replace('/me')
  }
}
</script>

<style lang="css" scoped>
</style>
