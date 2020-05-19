<template>
  <v-app :dark="env.theme.dark">
    <v-app-bar
      app
      scroll-off-screen
      :color="(user && user.adminMode) ? 'admin' : 'default'"
      :dark="env.theme.dark || (user && user.adminMode)"
      :class="env.theme.dark || (user && user.adminMode) ? 'main-toolbar' : 'main-toolbar main-toolbar-light'"
      height="64"
    >
      <div class="logo-container">
        <a
          :href="env.brand.url || env.publicUrl"
          :title="env.brand.title || env.brand.url"
        >
          <img v-if="env.brand.logo" :src="env.brand.logo">
          <img v-else src="../assets/logo.svg">
        </a>
      </div>

      <v-toolbar-title>
        <h1 class="headline pt-2" style="line-height:1.3rem;">
          {{ env.brand.title || 'DataFair' }}
        </h1>
        <small>{{ env.brand.description }}</small>
      </v-toolbar-title>

      <v-spacer />

      <!-- larger screens: navigation in toolbar -->
      <v-toolbar-items v-if="$vuetify.breakpoint.lgAndUp">
        <v-btn
          :to="localePath({name: 'datasets', query: searchQuery('datasets')})"
          :class="routePrefix === 'dataset' ? 'v-btn--active' : ''"
          text
          :color="user && user.adminMode ? 'default' : 'primary'"
        >
          Jeux de données
        </v-btn>
        <v-btn
          :to="localePath({name: 'applications', query: searchQuery('applications')})"
          :class="routePrefix === 'application' ? 'v-btn--active' : ''"
          text
          :color="user && user.adminMode ? 'default' : 'primary'"
        >
          Applications
        </v-btn>
        <v-btn
          :to="localePath({name: 'catalogs', query: searchQuery('catalogs')})"
          :class="routePrefix === 'catalog' ? 'v-btn--active' : ''"
          text
          :color="user && user.adminMode ? 'default' : 'primary'"
        >
          Catalogues
        </v-btn>
        <v-btn
          :to="localePath({name: 'remote-services', query: searchQuery('remote-services')})"
          :class="routePrefix === 'remote' ? 'v-btn--active' : ''"
          text
          :color="user && user.adminMode ? 'default' : 'primary'"
        >
          Services
        </v-btn>
        <v-menu offset-y>
          <template v-slot:activator="{on}">
            <v-btn
              :class="(routePrefix === 'user' || routePrefix === 'interoperate') ? 'v-btn--active' : ''"
              text
              v-on="on"
            >
              Documentation
            </v-btn>
          </template>
          <v-list>
            <v-list-item :to="localePath({name: 'user-guide-id', params: {id: 'introduction'}})">
              <v-list-item-title>{{ $t('pages.user-guide.title') }}</v-list-item-title>
            </v-list-item>
            <v-list-item
              href="https://videos.koumoul.com/"
              target="_blank"
            >
              <v-list-item-title>Tutoriels</v-list-item-title>
            </v-list-item>
            <v-list-item :to="localePath('api-doc')">
              <v-list-item-title>API</v-list-item-title>
            </v-list-item>
            <v-list-item :to="localePath({name: 'interoperate-id', params: {id: 'applications'}})">
              <v-list-item-title>{{ $t('pages.interoperate.title') }}</v-list-item-title>
            </v-list-item>
          </v-list>
        </v-menu>
        <template v-if="session.initialized">
          <v-btn
            v-if="!user"
            color="primary"
            @click="login"
          >
            Se connecter / S'inscrire
          </v-btn>
          <v-menu
            v-else
            offset-y
            left
          >
            <template v-slot:activator="{on}">
              <v-btn text v-on="on">
                <v-avatar :size="40">
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
                  <v-list-item-title>Compte personnel</v-list-item-title>
                </v-list-item>
                <v-list-item
                  v-for="organization in user.organizations.filter(o => activeAccount.type === 'user' || activeAccount.id !== o.id)"
                  :id="'toolbar-menu-switch-orga-' + organization.id"
                  :key="organization.id"
                  @click="switchOrganization(organization.id); reload()"
                >
                  <v-list-item-title>Organisation {{ organization.name }}</v-list-item-title>
                </v-list-item>
                <v-divider />
              </template>
              <v-list-item to="/stats">
                <v-list-item-title>Statistiques</v-list-item-title>
              </v-list-item>
              <v-list-item to="/settings">
                <v-list-item-title>Paramètres</v-list-item-title>
              </v-list-item>
              <v-list-item to="/storage">
                <v-list-item-title>Stockage</v-list-item-title>
              </v-list-item>
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

              <!-- Administration pages -->
              <template v-if="user.adminMode">
                <v-list-item to="/admin/info" color="admin">
                  <v-list-item-avatar>
                    <v-icon color="admin">
                      mdi-information
                    </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-title>Informations du service</v-list-item-title>
                </v-list-item>
                <v-list-item to="/admin/owners" color="admin">
                  <v-list-item-avatar>
                    <v-icon color="admin">
                      mdi-briefcase
                    </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-title>Propriétaires</v-list-item-title>
                </v-list-item>
                <v-list-item to="/admin/errors" color="admin">
                  <v-list-item-avatar>
                    <v-icon color="admin">
                      mdi-alert
                    </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-title>Erreurs</v-list-item-title>
                </v-list-item>
                <v-list-item to="/admin/base-apps" color="admin">
                  <v-list-item-avatar>
                    <v-icon color="admin">
                      mdi-apps
                    </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-title>Applications de base</v-list-item-title>
                </v-list-item>
                <v-list-item :href="env.directoryUrl + '/admin/users'" color="admin">
                  <v-list-item-avatar>
                    <v-icon color="admin">
                      mdi-account-supervisor
                    </v-icon>
                  </v-list-item-avatar>
                  <v-list-item-title>Gestion des comptes</v-list-item-title>
                </v-list-item>
                <v-divider />
              </template>

              <v-list-item @click="logout">
                <v-list-item-title>Se déconnecter</v-list-item-title>
              </v-list-item>
            </v-list>
          </v-menu>
        </template>
      </v-toolbar-items>

      <!-- smaller screens: navigation in menu -->
      <v-menu
        v-if="$vuetify.breakpoint.mdAndDown"
        bottom
        left
      >
        <template v-slot:activator="{on}">
          <v-btn icon v-on="on">
            <v-icon>mdi-menu</v-icon>
          </v-btn>
        </template>
        <v-list>
          <v-list-item :to="localePath({name: 'datasets', query: searchQuery('datasets')})">
            <v-list-item-title>Jeux de données</v-list-item-title>
          </v-list-item>
          <v-list-item :to="localePath({name: 'applications', query: searchQuery('applications')})">
            <v-list-item-title>Applications</v-list-item-title>
          </v-list-item>
          <v-list-item :to="localePath({name: 'catalogs', query: searchQuery('catalogs')})">
            <v-list-item-title>Catalogues</v-list-item-title>
          </v-list-item>
          <v-list-item :to="localePath({name: 'remote-services', query: searchQuery('remote-services')})">
            <v-list-item-title>Services</v-list-item-title>
          </v-list-item>
          <v-list-item
            v-if="!user"
            color="primary"
            @click="login"
          >
            <v-list-item-title>Se connecter / S'inscrire</v-list-item-title>
          </v-list-item>
          <v-list-item
            v-else
            @click="logout"
          >
            <v-list-item-title>Se déconnecter</v-list-item-title>
          </v-list-item>
        </v-list>
      </v-menu>
    </v-app-bar>
    <v-content>
      <nuxt />

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
    </v-content>
    <v-footer class="pa-3">
      <v-spacer />
      <div>Powered by <a href="https://koumoul.com">Koumoul</a></div>
    </v-footer>
  </v-app>
</template>

<script>
  import eventBus from '~/event-bus'
  const { mapState, mapActions, mapGetters } = require('vuex')

  export default {
    data() {
      return {
        notification: null,
        showSnackbar: false,
      }
    },
    computed: {
      ...mapState(['env']),
      ...mapGetters(['searchQuery']),
      ...mapGetters('session', ['activeAccount']),
      session() {
        return this.$store.state.session
      },
      user() {
        return this.session.user
      },
      routePrefix() {
        return this.$route && this.$route.name && this.$route.name.split('-')[0]
      },
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
    methods: {
      ...mapActions('session', ['logout', 'login', 'setAdminMode', 'switchOrganization']),
      reload() {
        window.location.reload()
      },
    },
  }

</script>

<style lang="less">
body .v-application {
  .logo-container {
    height: 100%;
    padding: 4px;
    margin-left: 4px !important;
    margin-right: 4px;

    img {
      height:100%;
    }
  }

  main.content {
    // background-color: white;
  }

  .main-toolbar-light {
    background-color: white;
  }

  .main-toolbar {
    .v-toolbar__content {
      padding-left: 0;
    }
  }

  .actions-buttons {
    position: absolute;
    top: 8px;
    right: 8px;
    margin: 0;

    .v-btn {
      margin-bottom: 16px;
    }
  }

  .notification .v-snack__content {
    height: auto;
    p {
      margin-bottom: 4px;
      margin-top: 4px;
    }
  }
}

.event-finalize-end * {
  color: green !important;
}

.event-publication * {
  color: green !important;
}

.event-error {
  * {
    color: red !important;
  }
  .v-list__tile {
    height: auto;
  }
  p {
    margin-bottom: 0;
  }
}

iframe {
  background-color: transparent;
  border: none;
}
</style>
