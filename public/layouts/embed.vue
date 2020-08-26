<template>
  <v-app class="embed">
    <v-content>
      <nuxt />
      <notifications />
    </v-content>
  </v-app>
</template>

<script>
  import eventBus from '~/event-bus'
  import Notifications from '~/components/layout/notifications.vue'

  export default {
    components: { Notifications },
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

<style lang="less">
body .application {
  font-family: 'Nunito', sans-serif;
}
html {
  overflow-y: auto !important;
}
</style>
