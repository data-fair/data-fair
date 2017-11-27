<template>
<div>
  <md-toolbar class="md-whiteframe md-whiteframe-3dp">
    <div class="logo-container">
      <img src="../assets/logo.svg"></img>
    </div>
    <div class="double-title">
      <h1>Accessible Data</h1>
      <span>Le Web des données pour tous</span>

    </div>
    <span style="flex:1"></span>
    <router-link to="/">
      <md-button>Accueil</md-button>
    </router-link>
    <router-link to="/api-doc">
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

<style lang="less">

body {
  font-family: 'Nunito', sans-serif;
}

.md-theme-default.md-toolbar {
  background-color: #fafafa; // grey 50
  color: rgba(0, 0, 0, .87); // same as in body

  .logo-container {
    margin: 4px;
    padding: 2px;
    width: 56px;
    height: 56px;
    /*background-color: white;
    border-radius: 2px;
    box-shadow: inset 1px 1px 8px rgba(0, 0, 0, .2), inset 3px 3px 4px rgba(0, 0, 0, .14), inset 3px 3px 3px -2px rgba(0, 0, 0, .12);*/
    /*box-shadow: 0 0 6px white;*/
  }

  .double-title {
    h1 {
        margin-top: 9px;
        margin-left: 16px;
        margin-bottom: 5px;
        // color: #FFF;
    }
    span {
        // float: right;
        margin-left: 16px;
        // color: #FFF;
    }
  }
}
</style>
