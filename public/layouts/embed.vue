<template>
  <v-app>
    <v-content>
      <nuxt/>
      <v-snackbar class="notification" v-if="notification" ref="notificationSnackbar" v-model="showSnackbar" :color="notification.type" bottom :timeout="notification.type === 'error' ? 30000 : 6000">
        <div>
          <p>{{ notification.msg }}</p>
          <p v-if="notification.errorMsg" class="ml-3">{{ notification.errorMsg }}</p>
        </div>
        <v-btn flat icon @click.native="showSnackbar = false"><v-icon>close</v-icon></v-btn>
      </v-snackbar>
    </v-content>
  </v-app>
</template>

<script>
import eventBus from '../event-bus'
export default {
  data() {
    return {
      notification: null,
      showSnackbar: false
    }
  },
  mounted() {
    eventBus.$on('notification', async notif => {
      this.showSnackbar = false
      await this.$nextTick()
      if (typeof notif === 'string') notif = {msg: notif}
      if (notif.error) {
        notif.type = 'error'
        notif.errorMsg = (notif.error.response && (notif.error.response.data || notif.error.response.status)) || notif.error.message || notif.error
      }
      this.notification = notif
      this.showSnackbar = true
    })
  }
}

</script>

<style lang="less">
body .application {
  font-family: 'Nunito', sans-serif;
}
</style>
