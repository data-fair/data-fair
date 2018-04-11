<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ applications.count }} configuration{{ plural }} d'application{{ plural }}</h3>
    <v-layout row wrap>
      <v-flex sm12 md6 lg4 xl3 v-for="application in applications.results" :key="application.id">
        <v-card>
          <v-card-title primary-title>
            <nuxt-link :to="`/application/${application.id}/description`">{{ application.title || application.id }}</nuxt-link>
            <v-spacer/>
            <v-btn icon flat color="primary" :href="application.url" target="_blank" title="Accéder à l'application">
              <v-icon>exit_to_app</v-icon>
            </v-btn>
          </v-card-title>
          <v-card-text v-if="application.description" v-html="application.description"/>
          <v-card-actions>
            <span v-if="application.owner.type === 'user'"><v-icon>person</v-icon>{{ application.owner.name }}</span>
            <span v-if="application.owner.type === 'organization'"><v-icon>group</v-icon>{{ application.owner.name }}</span>
            <v-chip text-color="white" :color="application.public ? 'primary' : 'accent'">{{ application.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
const {mapState} = require('vuex')

export default {
  data: () => ({
    applications: {
      count: 0,
      results: []
    }
  }),
  computed: {
    ...mapState(['user', 'env']),
    plural() {
      return this.applications.count > 1 ? 's' : ''
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.applications = await this.$axios.$get(this.env.publicUrl + '/api/v1/applications?size=100')
    }
  }
}
</script>
