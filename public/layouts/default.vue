<template>
  <v-app>
    <v-toolbar app scroll-off-screen class="main-toolbar">
      <div class="logo-container">
        <a :href="env.brand.url" v-if="env.brand.url" :title="env.brand.title || env.brand.url">
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
        <v-btn flat :to="{name: 'index'}" color="primary" exact>Accueil</v-btn>
        <v-btn flat to="/datasets" color="primary" :class="routePrefix === 'dataset' ? 'v-btn--active' : ''">Jeux de données</v-btn>
        <v-btn flat to="/remote-services" color="primary" :class="routePrefix === 'remote' ? 'v-btn--active' : ''">Services</v-btn>
        <v-btn flat to="/applications" color="primary" :class="routePrefix === 'application' ? 'v-btn--active' : ''">Applications</v-btn>
        <v-btn flat to="/catalogs" color="primary" :class="routePrefix === 'catalog' ? 'v-btn--active' : ''">Catalogues</v-btn>
        <template v-if="session.initialized">
          <v-btn v-if="!user" @click="login" color="primary">
            Se connecter / S'inscrire
          </v-btn>
          <v-menu offset-y v-else>
            <v-btn slot="activator" flat>{{ user.name }}</v-btn>
            <v-list>
              <v-list-tile :to="`/settings/user/${user.id}`">
                <v-list-tile-title>Mes paramètres</v-list-tile-title>
              </v-list-tile>
              <v-list-tile :to="`/settings/organization/${orga.id}`" v-for="orga in user.organizations || []" :key="orga.id">
                <v-list-tile-title>Paramètres {{ orga.name || orga.id }}</v-list-tile-title>
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
          <v-list-tile :to="{name: 'index'}" exact>
            <v-list-tile-title>Accueil</v-list-tile-title>
          </v-list-tile>
          <v-list-tile to="/datasets">
            <v-list-tile-title>Jeux de données</v-list-tile-title>
          </v-list-tile>
          <v-list-tile to="/remote-services">
            <v-list-tile-title>Services</v-list-tile-title>
          </v-list-tile>
          <v-list-tile to="/applications">
            <v-list-tile-title>Applications</v-list-tile-title>
          </v-list-tile>
          <v-list-tile to="/catalogs">
            <v-list-tile-title>Catalogues</v-list-tile-title>
          </v-list-tile>
          <v-list-tile v-if="!user" @click="login" color="primary">
            <v-list-tile-title>Se connecter / S'inscrire</v-list-tile-title>
          </v-list-tile>
          <v-list-tile v-else @click="logout">
            <v-list-tile-title>Se déconnecter</v-list-tile-title>
          </v-list-tile>
        </v-list>
      </v-menu>

    </v-toolbar>
    <v-content>
      <v-container fluid>
        <nuxt/>
      </v-container>
      <v-snackbar class="notification" v-if="notification" ref="notificationSnackbar" v-model="showSnackbar" :color="notification.type" bottom :timeout="notification.type === 'error' ? 30000 : 6000">
        <div>
          <p>{{ notification.msg }}</p>
          <p v-if="notification.errorMsg" class="ml-3">{{ notification.errorMsg }}</p>
        </div>
        <v-btn flat icon @click.native="showSnackbar = false"><v-icon>close</v-icon></v-btn>
      </v-snackbar>
    </v-content>
    <v-footer class="pa-3">
      <v-spacer/>
      <div>Powered by <a href="https://koumoul-dev.github.io/data-fair/">DataFAIR</a></div>
    </v-footer>
  </v-app>
</template>

<script>
import eventBus from '../event-bus'
const {mapState, mapActions} = require('vuex')

export default {
  data() {
    return {
      notification: null,
      showSnackbar: false
    }
  },
  computed: {
    ...mapState(['env']),
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
      if (typeof notif === 'string') notif = {msg: notif}
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

</style>
