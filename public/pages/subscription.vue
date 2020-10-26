<template>
  <v-iframe :src="env.subscriptionUrl" />
</template>

<script>
  import 'iframe-resizer/js/iframeResizer'
  import VIframe from '@koumoul/v-iframe'
  import { mapState } from 'vuex'
  export default {
    components: { VIframe },
    computed: {
      ...mapState(['env']),
    },
  }
</script>

<style lang="css" scoped>
</style>
