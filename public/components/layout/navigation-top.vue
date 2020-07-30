<template>
  <v-app-bar
    app
    flat
    dense
    class="px-0 main-app-bar"
  >
    <v-breadcrumbs
      v-if="breadcrumbItems && breadcrumbsRouteName === $route.name"
      :items="breadcrumbItems"
      large
    />
    <v-spacer />
    <v-toolbar-items>
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
          <v-list>
            <template v-if="user && user.organizations.length">
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
            <v-list-item :href="env.directoryUrl + '/me'">
              <v-list-item-title>Mon compte</v-list-item-title>
            </v-list-item>
            <v-divider />

            <!-- toggle admin mode -->
            <template v-if="user.isAdmin">
              <v-list-item
                v-if="!user.adminMode"
                color="admin"
                @click="setAdminMode(true)"
              >
                <v-list-item-title>{{ $t('common.activateAdminMode') }}</v-list-item-title>
              </v-list-item>
              <v-list-item
                v-if="user.adminMode"
                color="admin"
                @click="setAdminMode(false)"
              >
                <v-list-item-title>{{ $t('common.deactivateAdminMode') }}</v-list-item-title>
              </v-list-item>
            </template>

            <v-list-item @click="logout">
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
    computed: {
      ...mapState(['env', 'breadcrumbItems', 'breadcrumbsRouteName']),
      ...mapState('session', ['user', 'initialized']),
      ...mapGetters('session', ['activeAccount']),
    },
    methods: {
      ...mapActions('session', ['logout', 'login', 'setAdminMode', 'switchOrganization']),
      reload() {
        window.location.reload()
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
