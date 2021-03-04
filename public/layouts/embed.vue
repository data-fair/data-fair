<template>
  <v-app class="embed">
    <dynamic-style />
    <v-main>
      <nuxt />
      <notifications />
    </v-main>
  </v-app>
</template>

<script>
  import DynamicStyle from '~/components/layout/dynamic-style.vue'
  import eventBus from '~/event-bus'
  import Notifications from '~/components/layout/notifications.vue'

  export default {
    components: { DynamicStyle, Notifications },
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
