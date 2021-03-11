<template>
  <v-menu
    v-model="menu"
    nudge-left
    offset-y
    max-height="400"
  >
    <template v-slot:activator="{on, attrs}">
      <v-btn
        text
        class="px-0"
        v-bind="attrs"
        v-on="on"
      >
        <v-badge
          :content="countNew"
          :value="!!countNew"
          color="pink"
          overlap
        >
          <v-icon>
            mdi-bell
          </v-icon>
        </v-badge>
      </v-btn>
    </template>

    <v-list :width="500" dense>
      <v-list-item v-if="!notifications">
        <v-list-item-title>Chargement...</v-list-item-title>
      </v-list-item>
      <v-list-item v-else-if="notifications.length === 0">
        <v-list-item-title>Aucune notification reçue</v-list-item-title>
      </v-list-item>
      <v-list-item-group
        v-else
        active-class="pink--text"
        multiple
        :value="notifications.filter(n => n.new).map(n => n._id)"
      >
        <v-list-item
          v-for="notif in notifications"
          :key="notif._id"
          style="cursor: default"
          :value="notif._id"
        >
          <v-list-item-content>
            <v-list-item-title>{{ notif.title }}</v-list-item-title>
            <v-list-item-subtitle>{{ notif.date | moment("DD/MM/YYYY, HH:mm") }}</v-list-item-subtitle>
            <v-list-item-subtitle>{{ notif.body }}</v-list-item-subtitle>
          </v-list-item-content>
          <v-list-item-action>
            <owner-short v-if="notif.sender" :owner="notif.sender" />
          </v-list-item-action>
        </v-list-item>
      </v-list-item-group>
    </v-list>
  </v-menu>
</template>

<script>
  import { mapState } from 'vuex'
  import eventBus from '~/event-bus'
  const sound = new Audio(require('@/assets/sounds/when-604.ogg'))

  export default {
    props: ['notifyUrl'],
    data: () => ({
      menu: false,
      countNew: null,
      notifications: null,
      loading: false,
      size: 10,
    }),
    computed: {
      ...mapState('session', ['user']),
    },
    watch: {
      menu(value) {
        if (value) {
          this.fetchNotifications()
        } else {
          this.countNotifications()
          this.notifications = null
          this.size = 10
        }
      },
    },
    mounted() {
      this.countNotifications()
      // always subscribe to notifications from notify
      if (this.user) {
        const channel = `user:${this.user.id}:notifications`
        eventBus.$emit('subscribe-notify', channel)
        eventBus.$on(channel, notification => {
          sound.play()
          if (this.notifications) {
            notification.new = true
            this.notifications.unshift(notification)
            // TODO: replace this with a endpoint simply to reset pointer
            this.$axios.$get(`${this.notifyUrl}/api/v1/notifications`, { params: { size: 1 } })
          }

          if (this.countNew !== null) {
            this.countNew += 1
          }
        })
      }
    },
    methods: {
      async countNotifications() {
        const res = await this.$axios.$get(`${this.notifyUrl}/api/v1/notifications`, { params: { size: 0 } })
        this.countNew = res.countNew
      },
      async fetchNotifications() {
        this.loading = true
        const res = await this.$axios.$get(`${this.notifyUrl}/api/v1/notifications`, { params: { size: this.size } })
        this.countNew = res.countNew
        this.notifications = res.results
        this.loading = false
      },
    },
  }
</script>

<style lang="css" scoped>
</style>
