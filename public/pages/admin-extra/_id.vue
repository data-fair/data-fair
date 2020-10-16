<template>
  <v-iframe :src="extra && extra.iframe" />
</template>

<script>
  import VIframe from '@koumoul/v-iframe'
  import { mapState } from 'vuex'
  export default {
    components: { VIframe },
    computed: {
      ...mapState(['env']),
      extra() {
        return this.env.extraAdminNavigationItems.find(e => e.id === this.$route.params.id)
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
