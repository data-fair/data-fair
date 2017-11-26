<template>
<div>
  <md-toolbar>
    <h2 class="md-title">Gérez vos données Privées</h2>
    <span style="flex:1"></span>
    <router-link to="/" style="color:white;">
      <md-button>Accueil</md-button>
    </router-link>
    <router-link to="/api-doc" style="color:white;">
      <md-button>Documentation de l'API</md-button>
    </router-link>

    <a :href="loginUrl" v-if="!user">
      <md-button class="md-raised md-dense">Se connecter / S'inscrire</md-button>
    </a>
    <md-menu md-align-trigger md-size="3" md-direction="bottom left" class="navbar-menu" v-if="user">
      <md-button md-menu-trigger class="page-link">
        <md-icon>person</md-icon>&nbsp;{{user.firstName ? user.firstName : user.email.split('@')[0]}}
      </md-button>
      <md-menu-content class="navbar-menu-content">
        <md-menu-item @click.native="logout()">
            Se déconnecter
        </md-menu-item>
      </md-menu-content>
    </md-menu>

  </md-toolbar>
  <router-view></router-view>
</div>
</template>

<script>
const {
  mapState,
  mapActions
} = require('vuex')

export default {
  name: 'app',
  computed: mapState({
    user: state => state.user,
    loginUrl() {
      return window.CONFIG.directoryUrl + '/login?redirect=' + window.location.origin + '/signin?id_token='
    }
  }),
  methods: mapActions(['logout'])
}
</script>
