<template>
  <v-app-bar
    app
    flat
    dense
    clipped-left
    class="px-0 main-app-bar"
  >
    <v-list
      :style="$vuetify.breakpoint.mobile ? '' : 'width: 255px;'"
      class="py-0"
      color="transparent"
    >
      <layout-brand-title />
    </v-list>
    <v-divider v-if="!$vuetify.breakpoint.mobile" vertical />
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
      v-if="breadcrumbItems && breadcrumbsRouteName === $route.name"
      :items="breadcrumbItems"
      :large="!$vuetify.breakpoint.mobile"
      :class="{'pl-1': $vuetify.breakpoint.mobile}"
    />
    <v-spacer />
    <v-toolbar-items>
      <notifications-queue v-if="user && env.notifyUrl" :notify-url="env.notifyUrl" />
      <template v-if="initialized">
        <v-btn
          v-if="!user"
          depressed
          color="primary"
          @click="login"
        >
          Se connecter / S'inscrire
        </v-btn>
        <v-menu
          v-else
          offset-y
          nudge-left
          max-height="510"
        >
          <template v-slot:activator="{on}">
            <v-btn
              text
              class="px-0"
              v-on="on"
            >
              <v-avatar :size="36">
                <img :src="`${env.directoryUrl}/api/avatars/${activeAccount.type}/${activeAccount.id}/avatar.png`">
              </v-avatar>
            </v-btn>
          </template>

          <v-list outlined>
            <v-list-item disabled>
              <v-list-item-avatar class="ml-0 my-0">
                <v-avatar :size="28">
                  <img :src="activeAccount.type === 'user' ? `${env.directoryUrl}/api/avatars/user/${user.id}/avatar.png` : `${env.directoryUrl}/api/avatars/organization/${activeAccount.id}/avatar.png`">
                </v-avatar>
              </v-list-item-avatar>
              <v-list-item-title>{{ activeAccount.type === 'user' ? 'Compte personnel' : activeAccount.name }}</v-list-item-title>
            </v-list-item>

            <template v-if="user.organizations.length">
              <v-subheader>Changer de compte</v-subheader>
              <v-list-item
                v-if="activeAccount.type !== 'user'"
                id="toolbar-menu-switch-user"
                @click="switchOrganization(); reload()"
              >
                <v-list-item-avatar class="ml-0 my-0">
                  <v-avatar :size="28">
                    <img :src="`${env.directoryUrl}/api/avatars/user/${user.id}/avatar.png`">
                  </v-avatar>
                </v-list-item-avatar>
                <v-list-item-title>Compte personnel</v-list-item-title>
              </v-list-item>
              <v-list-item
                v-for="organization in user.organizations.filter(o => activeAccount.type === 'user' || activeAccount.id !== o.id)"
                :id="'toolbar-menu-switch-orga-' + organization.id"
                :key="organization.id"
                @click="switchOrganization(organization.id); reload()"
              >
                <v-list-item-avatar class="ml-0 my-0">
                  <v-avatar :size="28">
                    <img :src="`${env.directoryUrl}/api/avatars/organization/${organization.id}/avatar.png`">
                  </v-avatar>
                </v-list-item-avatar>
                <v-list-item-title>{{ organization.name }}</v-list-item-title>
              </v-list-item>
              <v-divider />
            </template>
            <v-list-item :to="'/me'" :nuxt="true">
              <v-list-item-content>
                <v-list-item-title>Mon compte</v-list-item-title>
              </v-list-item-content>
            </v-list-item>
            <v-divider />
            <v-list-item
              v-if="canAdmin && env.subscriptionUrl"
              :nuxt="true"
              :to="`/subscription`"
            >
              <v-list-item-action><v-icon>mdi-card-account-details</v-icon></v-list-item-action>
              <v-list-item-content>
                <v-list-item-title>Abonnement</v-list-item-title>
              </v-list-item-content>
            </v-list-item>
            <template v-if="!missingSubscription">
              <v-list-item
                v-if="env.notifyUrl"
                :nuxt="true"
                :to="`/notifications`"
              >
                <v-list-item-action><v-icon>mdi-bell-plus</v-icon></v-list-item-action>
                <v-list-item-title>Notifications</v-list-item-title>
              </v-list-item>
              <v-list-item
                v-if="canContrib"
                :nuxt="true"
                to="/storage"
              >
                <v-list-item-action><v-icon>mdi-harddisk</v-icon></v-list-item-action>
                <v-list-item-title>Stockage</v-list-item-title>
              </v-list-item>
            </template>
            <v-divider />

            <!-- toggle admin mode -->
            <template v-if="user.isAdmin">
              <v-list-item dense>
                <v-list-item-action><v-icon>mdi-shield-alert</v-icon></v-list-item-action>
                <v-list-item-title style="overflow: visible;">
                  <v-switch
                    v-model="user.adminMode"
                    color="admin"
                    hide-details
                    class="mt-0"
                    label="mode admin"
                    @change="setAdminMode"
                  />
                </v-list-item-title>
              </v-list-item>
            </template>

            <v-list-item v-if="env.darkModeSwitch" dense>
              <v-list-item-action><v-icon>mdi-weather-night</v-icon></v-list-item-action>
              <v-list-item-title style="overflow: visible;">
                <v-switch
                  v-model="$vuetify.theme.dark"
                  hide-details
                  class="mt-0"
                  label="mode nuit"
                  color="white"
                  @change="setDarkCookie"
                />
              </v-list-item-title>
            </v-list-item>

            <v-list-item @click="logout">
              <v-list-item-action><v-icon>mdi-logout</v-icon></v-list-item-action>
              <v-list-item-title>Se déconnecter</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
      </template>
    </v-toolbar-items>
  </v-app-bar>
</template>

<script>
  import { mapState, mapGetters, mapActions } from 'vuex'

  export default {
    props: ['navContext'],
    computed: {
      ...mapState(['env', 'breadcrumbItems', 'breadcrumbsRouteName']),
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters(['canAdmin', 'canContrib', 'missingSubscription']),
      ...mapGetters('session', ['activeAccount']),
    },
    methods: {
      ...mapActions('session', ['logout', 'login', 'setAdminMode', 'switchOrganization']),
      reload() {
        window.location.reload()
      },
      setDarkCookie(value) {
        const maxAge = 60 * 60 * 24 * 100 // 100 days
        this.$cookies.set('theme_dark', '' + value, { path: '/', domain: this.env.sessionDomain, maxAge })
        this.reload()
      },
    },
  }
</script>

<style lang="css">
.main-app-bar .v-toolbar__content {
  padding-left: 0;
  padding-right: 0;
}
</style>
