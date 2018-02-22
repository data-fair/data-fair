<template>
  <div>
    <md-toolbar class="md-whiteframe md-whiteframe-3dp">
      <router-link to="/">
        <div class="logo-container">
          <img src="../assets/logo.svg">
        </div>
      </router-link>

      <div class="double-title">
        <h1>Data FAIR</h1>
        <span>Find, Access, Interoperate, Reuse</span>
      </div>

      <span style="flex:1"/>

      <router-link :to="{name: 'Datasets'}">
        <md-button :class="$route.name.indexOf('Dataset') >= 0 ? 'md-warning' : 'md-primary'">Jeux de données</md-button>
      </router-link>

      <router-link :to="{name: 'RemoteServices'}">
        <md-button :class="$route.name.indexOf('RemoteService') >= 0 ? 'md-warning' : 'md-primary'">Services distants</md-button>
      </router-link>

      <router-link :to="{name: 'Applications'}">
        <md-button :class="$route.name.indexOf('Application') >= 0 ? 'md-warning' : 'md-primary'">Configurations d'applications</md-button>
      </router-link>

      <a :href="loginUrl" v-if="!user">
        <md-button class="md-raised md-dense">Se connecter / S'inscrire</md-button>
      </a>
      <md-menu md-align-trigger md-size="3" md-direction="bottom left" class="navbar-menu" v-if="user">
        <md-button md-menu-trigger class="page-link">
          <md-icon>person</md-icon>&nbsp; <user-name :user="user"/>
        </md-button>

        <md-menu-content class="navbar-menu-content">
          <md-menu-item>
            <router-link :to="{name:'Settings', params:{type:'user', id: user.id}}" class="md-button">
              Mes paramètres
            </router-link>
          </md-menu-item>
          <md-menu-item v-for="organization in userOrganizations" :key="organization.id">
            <router-link :to="{name:'Settings', params:{type:'organization', id: organization.id}}" class="md-button">
              Paramètres {{ organization.name }}
            </router-link>
          </md-menu-item>
          <md-menu-item @click.native="logout()">
            Se déconnecter
          </md-menu-item>
        </md-menu-content>
      </md-menu>
    </md-toolbar>

    <md-layout md-align="center">
      <md-layout md-column md-flex="90">
        <router-view :key="$route.path"/>
      </md-layout>
    </md-layout>

    <md-snackbar md-position="bottom center" ref="notificationErrorSnackbar" md-duration="60000" @close="notifyError(null)">
      <md-icon md-theme="error" class="md-primary">error</md-icon>
      &nbsp;&nbsp;&nbsp;
      <div v-html="notifError"/>
      <md-button class="md-icon-button md-dense" @click.native="$refs.notificationErrorSnackbar.close()">
        <md-icon>close</md-icon>
      </md-button>
    </md-snackbar>
    <md-snackbar md-position="bottom center" ref="notificationSnackbar" md-duration="12000" @close="notify(null)">
      <md-icon md-theme="success" class="md-primary">check_circle</md-icon>
      &nbsp;&nbsp;&nbsp;
      <div v-html="notif"/>
      <md-button class="md-icon-button md-dense" @click.native="$refs.notificationSnackbar.close()">
        <md-icon>close</md-icon>
      </md-button>
    </md-snackbar>
  </div>
</template>

<script>
import UserName from './components/UserName.vue'
const {mapState, mapActions} = require('vuex')

export default {
  name: 'App',
  components: {UserName},
  data() {
    return {
      notif: '',
      notifError: ''
    }
  },
  computed: {
    ...mapState(['user', 'userOrganizations', 'notification', 'notificationError']),
    loginUrl() {
      return window.CONFIG.directoryUrl + '/login?redirect=' + window.CONFIG.publicUrl + '/signin?id_token='
    }
  },
  watch: {
    notification(val) {
      if (val) {
        this.notif = this.notification
        this.$refs.notificationSnackbar.open()
      } else this.$refs.notificationSnackbar.close()
    },
    notificationError(val) {
      if (val) {
        this.notifError = this.notificationError
        this.$refs.notificationErrorSnackbar.open()
      } else this.$refs.notificationErrorSnackbar.close()
    }
  },
  methods: mapActions(['logout', 'notify', 'notifyError'])
}
</script>

<style lang="less">
body {
    font-family: 'Nunito', sans-serif;
}

.md-theme-default.md-toolbar {
    background-color: #fafafa; // grey 50
    color: rgba(0, 0, 0, .87); // same as in body
    margin-bottom: 8px;

    .logo-container {
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
            margin-top: 8px;
            margin-left: 16px;
            margin-bottom: 4px;
            // color: #FFF;
        }
        span {
            // float: right;
            margin-left: 16px;
            // color: #FFF;
        }
    }
}

.md-snackbar-content a {
    color: #ff9966 !important;
}

.actions-buttons {
  position: absolute;
  top: 76px;
  right: 8px;
  margin: 0;

  .md-button {
    margin-bottom: 16px;
  }
}
</style>
