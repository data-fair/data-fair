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
    <router-link to="/me" v-if="user">
      <md-button>{{user.firstName ? user.firstName : user.email.split('@')[0]}}</md-button>
    </router-link>
    <a :href="loginUrl" v-if="!user">
      <md-button class="md-raised md-dense">Se connecter / S'inscrire</md-button>
    </a>

  </md-toolbar>
  <router-view></router-view>
</div>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'app',
  computed: mapState({
    user: state => state.user,
    loginUrl() {
      return window.CONFIG.directoryUrl + '/login?url=' + window.location.origin
    }
  })
}
</script>
