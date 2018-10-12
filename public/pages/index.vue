<template>
  <v-layout row>
    <!-- User: show stats -->
    <v-layout v-if="user" column>
      <v-subheader>{{ $t('pages.root.description') }}</v-subheader>
      <v-container fluid>
        <h2 class="display-1">Statistiques</h2>
        <v-data-table v-if="stats" :headers="headers" :items="items" hide-actions class="elevation-1 mt-4">
          <template slot="items" slot-scope="props">
            <td>{{ props.item.name }}</td>
            <td>{{ props.item.datasets }}</td>
            <td>{{ (props.item.storage / 1000).toFixed(2) }} ko</td>
            <td>{{ props.item.applications }}</td>
          </template>
        </v-data-table>
      </v-container>
    </v-layout>
    <!-- Anonymous: show jumbotron -->
    <v-flex v-else-if="initialized" md6 offset-md3>
      <v-responsive>
        <v-container fill-height>
          <v-layout align-center>
            <v-flex text-xs-center>
              <h3 class="display-1 mb-3 mt-5">{{ $t('common.title') }}</h3>
              <div class="headline">{{ $t('pages.root.description') }}</div>
              <p class="title mt-5">{{ $t('common.authrequired') }}</p>
              <v-btn color="primary" @click="login">{{ $t('common.login') }}</v-btn>
            </v-flex>
          </v-layout>
        </v-container>
      </v-responsive>
    </v-flex>
  </v-layout>
</template>

<script>
const { mapState, mapActions } = require('vuex')

export default {
  name: 'Home',
  data: () => ({
    stats: null,
    headers: [
      { text: '', value: 'name', sortable: false },
      { text: 'Nombre de jeux de données', value: 'storage', sortable: false },
      { text: 'Espace consommé', value: 'datasets', sortable: false },
      { text: 'Nombre d\'applications', value: 'applications', sortable: false }
    ]
  }),
  computed: {
    ...mapState('session', ['user', 'initialized']),
    ...mapState(['env']),
    items() {
      if (!this.stats) return []
      const orgasItems = this.user.organizations.map(o => {
        return { name: o.name, ...this.stats.organizations[o.id] }
      })
      return [{ name: 'Espace personnel', ...this.stats.user }].concat(orgasItems)
    }
  },
  watch: {
    user: {
      async handler(user) {
        if (user) this.stats = await this.$axios.$get(this.env.publicUrl + '/api/v1/stats')
      },
      immediate: true
    }
  },
  methods: {
    ...mapActions('session', ['login'])
  }
}
</script>
