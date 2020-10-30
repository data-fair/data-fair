<template>
  <v-iframe :src="`${env.directoryUrl}/organization/${activeAccount.id}?embed=true&redirect=${encodeURIComponent(env.publicUrl)}`" />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer'
  import VIframe from '@koumoul/v-iframe'
  import { mapState, mapGetters } from 'vuex'

  export default {
    components: { VIframe },
    computed: {
      ...mapState(['env']),
      ...mapGetters('session', ['activeAccount']),
    },
    mounted() {
      if (this.activeAccount.type === 'user') this.$router.replace('/me')
    },
  }
</script>

<style lang="css" scoped>
</style>
