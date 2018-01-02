<template>
<md-layout md-align="center">
  <md-layout md-column md-flex="90">
    <h3 class="md-display-1">Statistiques</h3>
    <md-table-card v-if="stats">
      <md-table v-if="userOrganizations">
        <md-table-header>
          <md-table-row>
            <md-table-head></md-table-head>
            <md-table-head>Espace personnel</md-table-head>
            <md-table-head v-for="organization in Object.values(userOrganizations)">{{organization.name}}</md-table-head>
          </md-table-row>
        </md-table-header>

        <md-table-body>
          <md-table-row>
            <md-table-cell>Nombre de jeux de données</md-table-cell>
            <md-table-cell>{{stats.user.datasets}}</md-table-cell>
            <md-table-cell v-for="organization in Object.keys(userOrganizations)">{{stats.organizations[organization].datasets}}</md-table-cell>
          </md-table-row>
          <md-table-row>
            <md-table-cell>Espace consommé</md-table-cell>
            <md-table-cell>{{stats.user.storage}}</md-table-cell>
            <md-table-cell v-for="organization in Object.keys(userOrganizations)">{{stats.organizations[organization].storage}}</md-table-cell>
          </md-table-row>
        </md-table-body>
      </md-table>

    </md-table-card>

  </md-layout>
</md-layout>
</template>

<script>
const {
  mapState
} = require('vuex')

export default {
  name: 'home',
  data:()=>({
    stats: null
  }),
  computed: {
    ...mapState({
      user: state => state.user,
      userOrganizations: state => state.userOrganizations
    })
  },
  mounted(){
    if(this.user){
      this.$http.get(window.CONFIG.publicUrl + '/api/v1/stats').then(results => {
        this.stats = results.data
      })
    }
  }
}
</script>
