<template>
  <v-app>
    <v-toolbar app scroll-off-screen class="main-toolbar">
      <div class="logo-container">
        <a v-if="env.brand.url" :href="env.brand.url" :title="env.brand.title || env.brand.url">
          <img v-if="env.brand.logo" :src="env.brand.logo">
          <img v-else src="../assets/logo.svg">
        </a>
        <template v-else>
          <img v-if="env.brand.logo" :src="env.brand.logo">
          <img v-else src="../assets/logo.svg">
        </template>
      </div>

      <v-toolbar-title><h1 class="headline">{{ env.brand.title || 'DataFair' }}</h1><small>{{ env.brand.description }}</small></v-toolbar-title>

      <v-spacer/>

      <!-- larger screens: navigation in toolbar -->
      <v-toolbar-items class="hidden-md-and-down">
        <v-btn :to="localePath('index')" flat color="primary" exact>Accueil</v-btn>
        <v-btn :to="localePath({name: 'datasets', query: searchQuery('datasets')})" :class="routePrefix === 'dataset' ? 'v-btn--active' : ''" flat color="primary">Jeux de données</v-btn>
        <v-btn :to="localePath({name: 'remote-services', query: searchQuery('remote-services')})" :class="routePrefix === 'remote' ? 'v-btn--active' : ''" flat color="primary">Services</v-btn>
        <v-btn :to="localePath({name: 'applications', query: searchQuery('applications')})" :class="routePrefix === 'application' ? 'v-btn--active' : ''" flat color="primary">Applications</v-btn>
        <v-btn :to="localePath({name: 'catalogs', query: searchQuery('catalogs')})" :class="routePrefix === 'catalog' ? 'v-btn--active' : ''" flat color="primary">Catalogues</v-btn>
        <v-menu>
          <v-btn slot="activator" :class="(routePrefix === 'user' || routePrefix === 'interoperate') ? 'v-btn--active' : ''" flat>Documentation</v-btn>
          <v-list>
            <v-list-tile :to="localePath({name: 'user-guide-id', params: {id: 'introduction'}})">
              <v-list-tile-title>{{ $t('pages.user-guide.title') }}</v-list-tile-title>
            </v-list-tile>
            <v-list-tile href="https://videos.koumoul.com/" target="_blank">
              <v-list-tile-title>Tutoriels</v-list-tile-title>
            </v-list-tile>
            <v-list-tile :to="localePath('api-doc')">
              <v-list-tile-title>API</v-list-tile-title>
            </v-list-tile>
            <v-list-tile :to="localePath({name: 'interoperate-id', params: {id: 'applications'}})">
              <v-list-tile-title>{{ $t('pages.interoperate.title') }}</v-list-tile-title>
            </v-list-tile>
          </v-list>
        </v-menu>
        <template v-if="session.initialized">
          <v-btn v-if="!user" color="primary" @click="login">
            Se connecter / S'inscrire
          </v-btn>
          <v-menu v-else offset-y left>
            <v-btn slot="activator" flat>{{ user.name }}</v-btn>
            <v-list>
              <v-list-tile :to="`/settings/user/${user.id}`">
                <v-list-tile-title>Mes paramètres</v-list-tile-title>
              </v-list-tile>
              <v-list-tile v-for="orga in user.organizations || []" :to="`/settings/organization/${orga.id}`" :key="orga.id">
                <v-list-tile-title>Paramètres {{ orga.name || orga.id }}</v-list-tile-title>
              </v-list-tile>
              <v-list-tile v-if="user.isAdmin" to="/admin/info">
                <v-list-tile-title>Administration</v-list-tile-title>
              </v-list-tile>
              <v-list-tile @click="logout">
                <v-list-tile-title>Se déconnecter</v-list-tile-title>
              </v-list-tile>
            </v-list>
          </v-menu>
        </template>
      </v-toolbar-items>

      <!-- smaller screens: navigation in menu -->
      <v-menu bottom left class="hidden-lg-and-up">
        <v-btn slot="activator" icon><v-icon>menu</v-icon></v-btn>
        <v-list>
          <v-list-tile :to="localePath('index')" exact>
            <v-list-tile-title>Accueil</v-list-tile-title>
          </v-list-tile>
          <v-list-tile :to="localePath({name: 'datasets', query: searchQuery('datasets')})">
            <v-list-tile-title>Jeux de données</v-list-tile-title>
          </v-list-tile>
          <v-list-tile :to="localePath({name: 'remote-services', query: searchQuery('remote-services')})">
            <v-list-tile-title>Services</v-list-tile-title>
          </v-list-tile>
          <v-list-tile :to="localePath({name: 'applications', query: searchQuery('applications')})">
            <v-list-tile-title>Applications</v-list-tile-title>
          </v-list-tile>
          <v-list-tile :to="localePath({name: 'catalogs', query: searchQuery('catalogs')})">
            <v-list-tile-title>Catalogues</v-list-tile-title>
          </v-list-tile>
          <v-list-tile v-if="!user" color="primary" @click="login">
            <v-list-tile-title>Se connecter / S'inscrire</v-list-tile-title>
          </v-list-tile>
          <v-list-tile v-else @click="logout">
            <v-list-tile-title>Se déconnecter</v-list-tile-title>
          </v-list-tile>
        </v-list>
      </v-menu>

    </v-toolbar>
    <v-content>

      <nuxt/>

      <v-snackbar v-if="notification" ref="notificationSnackbar" v-model="showSnackbar" :color="notification.type" :timeout="notification.type === 'error' ? 0 : 6000" class="notification" bottom>
        <div>
          <p>{{ notification.msg }}</p>
          <p v-if="notification.errorMsg" class="ml-3">{{ notification.errorMsg }}</p>
        </div>
        <v-btn flat icon @click.native="showSnackbar = false"><v-icon>close</v-icon></v-btn>
      </v-snackbar>
    </v-content>
    <v-footer class="pa-3">
      <v-spacer/>
      <div>Powered by <a href="https://koumoul.com">Koumoul</a></div>
    </v-footer>
  </v-app>
</template>

<script>
import eventBus from '../event-bus'
const { mapState, mapActions, mapGetters } = require('vuex')

export default {
  data() {
    return {
      notification: null,
      showSnackbar: false
    }
  },
  computed: {
    ...mapState(['env']),
    ...mapGetters(['searchQuery']),
    session() {
      return this.$store.state.session
    },
    user() {
      return this.session.user
    },
    routePrefix() {
      return this.$route && this.$route.name && this.$route.name.split('-')[0]
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
  methods: mapActions('session', ['logout', 'login'])
}

</script>

<style lang="less">
body .application {
  font-family: 'Nunito', sans-serif;

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

  .main-toolbar {
    background-color: white;
    .v-toolbar__content {
      padding-left: 0;
    }
  }

  .actions-buttons {
    position: absolute;
    top: 76px;
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

.event-error * {
  color: red !important;
}

iframe {
  background-color: transparent;
  border: none;
}
</style>
