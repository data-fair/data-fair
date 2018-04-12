<template>
  <v-app>
    <v-toolbar app scroll-off-screen class="main-toolbar">
      <div class="logo-container">
        <nuxt-link :to="{name: 'index'}" title="Accueil">
          <img src="../assets/logo.svg">
        </nuxt-link>
      </div>

      <v-toolbar-title><h1 class="headline">Data FAIR</h1></v-toolbar-title>

      <v-spacer/>

      <!-- larger screens: navigation in toolbar -->
      <v-toolbar-items class="hidden-md-and-down">
        <v-btn flat to="/datasets" color="primary">Jeux de données</v-btn>
        <v-btn flat to="/remote-services" color="primary">Services distants</v-btn>
        <v-btn flat to="/applications" color="primary">Configurations d'applications</v-btn>
        <v-btn v-if="!user" :href="loginUrl" color="primary">
          Se connecter / S'inscrire
        </v-btn>
        <v-menu offset-y v-else>
          <v-btn slot="activator" flat><user-name :user="user"/></v-btn>
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
      </v-toolbar-items>

      <!-- smaller screens: navigation in menu -->
      <v-menu bottom left class="hidden-lg-and-up">
        <v-btn slot="activator" icon><v-icon>menu</v-icon></v-btn>
        <v-list>
          <v-list-tile to="/datasets">
            <v-list-tile-title>Jeux de données</v-list-tile-title>
          </v-list-tile>
          <v-list-tile to="/remote-services">
            <v-list-tile-title>Services distants</v-list-tile-title>
          </v-list-tile>
          <v-list-tile to="/applications">
            <v-list-tile-title>Configurations d'applications</v-list-tile-title>
          </v-list-tile>
          <v-list-tile v-if="!user" :href="loginUrl" color="primary">
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
      <v-snackbar v-if="notification" ref="notificationSnackbar" v-model="showSnackbar" bottom>
        <v-icon v-if="notification.type === 'error'" color="error">error</v-icon>
        <v-icon v-if="notification.type === 'info'" color="success">check_circle</v-icon>
        &nbsp;
        {{ notification.msg }}
        <v-btn flat icon @click.native="showSnackbar = false"><v-icon>close</v-icon></v-btn>
      </v-snackbar>
    </v-content>
    <v-footer class="pa-3">
      <v-spacer/>
      <div>&copy;2018 — <a href="https://koumoul.com">Koumoul</a></div>
    </v-footer>
  </v-app>
</template>

<script>
import eventBus from '../event-bus'
import UserName from '../components/UserName.vue'
const {mapState, mapActions, mapGetters} = require('vuex')

export default {
  components: {
    UserName
  },
  data() {
    return {
      notification: null,
      showSnackbar: false
    }
  },
  computed: {
    ...mapState(['user', 'userOrganizations', 'env']),
    ...mapGetters(['loginUrl'])
  },
  mounted() {
    eventBus.$on('notification', notif => {
      this.notification = notif
      this.showSnackbar = true
    })
  },
  methods: mapActions(['logout'])
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
}

</style>
