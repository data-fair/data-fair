<template>
  <v-snackbar
    v-if="notification"
    ref="notificationSnackbar"
    v-model="showSnackbar"
    :color="notification.type"
    :timeout="notification.type === 'error' ? 0 : 6000"
    class="notification"
    bottom
  >
    <div style="max-width: 85%;">
      <p>{{ notification.msg }}</p>
      <p
        v-if="notification.errorMsg"
        class="ml-3"
        v-html="notification.errorMsg"
      />
    </div>
    <v-btn
      icon
      color="white"
      @click.native="showSnackbar = false"
    >
      <v-icon>mdi-close</v-icon>
    </v-btn>
  </v-snackbar>
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

<style lang="css" scoped>
</style>
