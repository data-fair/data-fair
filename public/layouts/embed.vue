<template>
  <v-app class="embed">
    <layout-dynamic-style />
    <v-main>
      <nuxt />
      <layout-notifications />
    </v-main>
  </v-app>
</template>

<script>
  import eventBus from '~/event-bus'

  export default {
    data() {
      return {
        notification: null,
        showSnackbar: false,
      }
    },
    mounted() {
      eventBus.$on('notification', async notif => {
        this.showSnackbar = false
        await this.$nextTick()
        if (typeof notif === 'string') notif = { msg: notif }
        if (notif.error) {
          notif.type = 'error'
          notif.errorMsg = (notif.error.response && (notif.error.response.data || notif.error.response.status)) || notif.error.message || notif.error
        }
        this.notification = notif
        this.showSnackbar = true
      })
    },
  }

</script>

<style lang="css">
/* hidden by default to prevent glitch when first displaying the page in embed mode */
html {
  overflow-y: auto;
}
</style>
