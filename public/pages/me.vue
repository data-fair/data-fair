<template>
  <v-iframe :src="env.directoryUrl + '/me?embed=true'" />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer'
  import VIframe from '@koumoul/v-iframe'
  import { mapState, mapGetters } from 'vuex'

  export default {
    components: { VIframe },
    computed: {
      ...mapState(['env']),
      ...mapGetters(['missingSubscription']),
    },
    mounted() {
      if (this.missingSubscription) this.$router.replace('/subscription')
    },
  }
</script>

<style lang="css" scoped>
</style>
