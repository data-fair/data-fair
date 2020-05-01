<template>
  <v-container class="pt-0">
    <!-- User: show stats -->
    <v-row v-if="user">
      <v-col>
        <v-subheader class="px-0">
          {{ $t('pages.root.description') }}
        </v-subheader>

        <h3 class="headline mt-2">
          Statistiques
        </h3>
        <v-sheet class="mt-2">
          <v-data-table
            v-if="stats"
            :headers="headers"
            :items="items"
            hide-default-footer
          >
            <template
              slot="items"
              slot-scope="props"
            >
              <td>{{ props.item.name }}</td>
              <td>{{ props.item.datasets }}</td>
              <td>{{ parseFloat((props.item.storage / 1000).toFixed(2)).toLocaleString() }} ko</td>
              <td>{{ parseFloat((props.item.storageLimit / 1000).toFixed(2)).toLocaleString() }} ko</td>
              <td>{{ props.item.applications }}</td>
            </template>
          </v-data-table>
        </v-sheet>
      </v-col>
    </v-row>
    <!-- Anonymous: show jumbotron -->
    <v-col
      v-else-if="initialized"
      md="6"
      offset-md="3"
    >
      <v-responsive>
        <v-container class="fill-height">
          <v-row align="center">
            <v-col class="text-center">
              <h3 class="display-1 mb-3 mt-5">
                {{ $t('common.title') }}
              </h3>
              <div class="headline">
                {{ $t('pages.root.description') }}
              </div>
              <p class="title mt-5">
                {{ $t('common.authrequired') }}
              </p>
              <v-btn
                color="primary"
                @click="login"
              >
                {{ $t('common.login') }}
              </v-btn>
            </v-col>
          </v-row>
        </v-container>
      </v-responsive>
    </v-col>
  </v-container>
</template>

<script>
  const { mapState, mapActions } = require('vuex')

  export default {
    name: 'Home',
    data: () => ({
      stats: null,
      headers: [
        { text: '', value: 'name', sortable: false },
        { text: 'Nombre de jeux de données', value: 'datasets', sortable: false },
        { text: 'Espace consommé', value: 'storage', sortable: false },
        { text: 'Espace total disponible', value: 'storageLimit', sortable: false },
        { text: 'Nombre d\'applications', value: 'applications', sortable: false },
      ],
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
      },
    },
    watch: {
      user: {
        async handler(user) {
          if (user) this.stats = await this.$axios.$get('api/v1/stats')
        },
        immediate: true,
      },
    },
    methods: {
      ...mapActions('session', ['login']),
    },
  }
</script>
