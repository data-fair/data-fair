<template>
  <v-app-bar
    app
    flat
    outlined
    dense
    clipped-left
    class="px-0 main-app-bar"
    style="border-left: none; border-right: none; border-top: none;"
  >
    <v-list
      :style="$vuetify.breakpoint.mobile ? '' : 'width: 256px;'"
      class="py-0"
      color="transparent"
    >
      <layout-brand-title />
    </v-list>
    <v-divider
      v-if="!$vuetify.breakpoint.mobile"
      vertical
    />
    <v-toolbar-items v-if="!navContext.drawer">
      <v-btn
        text
        color="primary"
        @click="navContext.drawer = true"
      >
        <v-icon>mdi-menu</v-icon>
      </v-btn>
    </v-toolbar-items>
    <v-breadcrumbs
      v-if="breadcrumbItems && breadcrumbsRouteName === $route.name && $vuetify.breakpoint.mdAndUp"
      :items="breadcrumbItems"
      :large="!$vuetify.breakpoint.mobile"
      :class="{'pl-1': $vuetify.breakpoint.mobile}"
    />
    <v-spacer />
    <v-toolbar-items>
      <notifications-queue
        v-if="user && env.notifyUrl"
        :notify-url="env.notifyUrl"
      />
    </v-toolbar-items>
    <personal-menu>
      <template #actions-before="{}">
        <v-list-item
          :to="'/me'"
          :nuxt="true"
        >
          <v-list-item-action><v-icon>mdi-information-outline</v-icon></v-list-item-action>
          <v-list-item-title v-t="'myAccount'" />
        </v-list-item>

        <template v-if="!missingSubscription">
          <v-list-item
            v-if="env.notifyUrl"
            :nuxt="true"
            :to="`/notifications`"
          >
            <v-list-item-action><v-icon>mdi-bell-plus</v-icon></v-list-item-action>
            <v-list-item-title v-t="'notifications'" />
          </v-list-item>
        </template>
        <v-divider />
      </template>
    </personal-menu>
    <lang-switcher />
  </v-app-bar>
</template>

<i18n lang="yaml">
fr:
  login: Se connecter / S'inscrire
  logout: Se déconnecter
  personalAccount: Compte personnel
  switchAccount: Changer de compte
  notifications: Notifications
  myAccount: Informations personnelles
en:
  login: Login / Sign up
  logout: Logout
  personalAccount: Personal account
  switchAccount: Switch account
  notifications: Notifications
  myAccount: Personal info
</i18n>

<script>
import { mapState, mapGetters, mapActions } from 'vuex'
import PersonalMenu from '@data-fair/sd-vue/src/vuetify/personal-menu.vue'
import LangSwitcher from '@data-fair/sd-vue/src/vuetify/lang-switcher.vue'

export default {
  components: { PersonalMenu, LangSwitcher },
  props: ['navContext'],
  computed: {
    ...mapState(['env', 'breadcrumbItems', 'breadcrumbsRouteName']),
    ...mapState('session', ['user', 'initialized']),
    ...mapGetters(['missingSubscription']),
    ...mapGetters('session', ['activeAccount'])
  },
  methods: {
    ...mapActions('session', ['logout', 'login', 'switchOrganization']),
    reload () {
      window.location.reload()
    },
    setDarkCookie (value) {
      const maxAge = 60 * 60 * 24 * 100 // 100 days
      this.$cookies.set('theme_dark', '' + value, { path: '/', domain: this.env.sessionDomain, maxAge })
      this.reload()
    },
    setAdminMode (value) {
      const redirect = value ? null : this.env.publicUrl
      this.$store.dispatch('session/setAdminMode', { value, redirect })
    }
  }
}
</script>

<style lang="css">
.main-app-bar .v-toolbar__content {
  padding-left: 0;
  padding-right: 0;
}
</style>
