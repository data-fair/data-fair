<template>
  <v-snackbar
    v-if="notification"
    ref="notificationSnackbar"
    v-model="showSnackbar"
    :color="notification.type"
    :timeout="notification.type === 'error' ? 0 : 300000"
    :text="notification.type === 'default'"
    class="notification"
    tile
    bottom
    :outlined="$vuetify.theme.dark"
  >
    <p>{{ notification.msg }}</p>
    <!-- errorMsg used to be displayed using v-html but this creates a XSS vulnerability and also weird graphical bugs when the error is returned as a full html page -->
    <p
      v-if="notification.errorMsg"
      class="ml-3"
      v-text="notification.errorMsg"
    />

    <template #action="{ }">
      <v-btn
        icon
        @click.native="showSnackbar = false"
      >
        <v-icon>mdi-close</v-icon>
      </v-btn>
    </template>
  </v-snackbar>
</template>

<script>
import eventBus from '~/event-bus'

export default {
  data () {
    return {
      notification: null,
      showSnackbar: false
    }
  },
  created () {
    eventBus.$on('notification', async notif => {
      if (this.showSnackbar) {
        this.showSnackbar = false
        await new Promise(resolve => setTimeout(resolve, 300))
      }

      if (typeof notif === 'string') notif = { msg: notif }
      if (notif.error) {
        notif.type = 'error'
        notif.errorMsg = (notif.error.response && (notif.error.response.data || notif.error.response.status)) || notif.error.message || notif.error
      }
      notif.type = notif.type || 'default'
      this.notification = notif
      this.showSnackbar = true
    })
  }
}
</script>

<style lang="less">
.notification.v-snack {
  .v-snack__wrapper {
    min-width: 256px;
  }
  .v-snack__content {
    height: auto;
    p {
      margin-bottom: 4px;
      margin-top: 4px;
    }
  }
}
</style>
