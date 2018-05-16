<template>
  <v-layout row>

    <!-- User: show stats -->
    <v-flex md8 offset-md2 v-if="user">
      <h2 class="display-1">Statistiques</h2>

      <v-data-table v-if="stats" :headers="headers" :items="items" hide-actions class="elevation-1 mt-4">
        <template slot="items" slot-scope="props">
          <td>{{ props.item.name }}</td>
          <td>{{ props.item.storage }}</td>
          <td>{{ props.item.datasets }}</td>
        </template>
      </v-data-table>
    </v-flex>

    <!-- Anonymous: show jumbotron -->
    <v-flex md8 offset-xs2 v-else>
      <v-jumbotron>
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <h3 class="display-2 mb-5 mt-5">Vos données, vos services et vos applications.</h3>

              <v-btn @click="login" color="primary">
                Se connecter / S'inscrire
              </v-btn>
            </v-flex>
          </v-layout>
        </v-container>
      </v-jumbotron>
    </v-flex>
  </v-layout>
</template>

<script>
const {mapState, mapActions} = require('vuex')

export default {
  name: 'Home',
  data: () => ({
    stats: null,
    headers: [
      {text: '', value: 'name', sortable: false},
      {text: 'Nombre de jeux de données', value: 'storage', sortable: false},
      {text: 'Espace consommé', value: 'datasets', sortable: false}
    ]
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    items() {
      if (!this.stats) return []
      const orgasItems = this.user.organizations.map(o => {
        return {name: o.name, ...this.stats.organizations[o.id]}
      })
      return [{name: 'Espace personnel', ...this.stats.user}].concat(orgasItems)
    }
  },
  async mounted() {
    if (this.user) {
      this.stats = await this.$axios.$get(this.env.publicUrl + '/api/v1/stats')
    }
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
