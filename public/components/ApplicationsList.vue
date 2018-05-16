<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ applications.count }} configuration{{ plural }} d'application{{ plural }}</h3>
    <v-layout row wrap>
      <v-flex xs12 sm5 md4 lg3>
        <v-text-field label="Rechercher" v-model="search" append-icon="search" @keyup.enter.native="refresh" :append-icon-cb="refresh"/>
      </v-flex>
      <v-spacer/>
      <v-flex xs12 sm7 md6 lg5 class="pt-4">
        <v-switch label="Voir les applications dont je ne suis pas propriétaire" v-model="showNotOwned" @change="refresh"/>
      </v-flex>
    </v-layout>

    <v-layout row wrap class="resourcesList">
      <v-flex sm12 md6 lg4 xl3 v-for="application in applications.results" :key="application.id">
        <v-card height="100%">
          <v-card-title primary-title style="height:25%">
            <nuxt-link :to="`/application/${application.id}/description`">{{ application.title || application.id }}</nuxt-link>
            <v-spacer/>
            <v-btn icon flat color="primary" :href="`${env.publicUrl}/app/${application.id}`" target="_blank" title="Accéder à l'application">
              <v-icon>exit_to_app</v-icon>
            </v-btn>
          </v-card-title>
          <v-card-text style="height:50%;min-height:80px" v-html="marked($options.filters.truncate(application.description || '', 200))"/>
          <v-card-actions style="height:25%">
            <span v-if="application.owner.type === 'user'"><v-icon>person</v-icon>{{ application.owner.name }}</span>
            <span v-if="application.owner.type === 'organization'"><v-icon>group</v-icon>{{ application.owner.name }}</span>
            <v-chip text-color="white" :color="application.public ? 'primary' : 'accent'">{{ application.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap>
      <v-spacer/><v-pagination :length="Math.ceil(applications.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
    </v-layout>
  </v-container>
</template>

<script>
const marked = require('marked')
const {mapState} = require('vuex')

export default {
  data: () => ({
    applications: {
      count: 0,
      results: []
    },
    search: '',
    showNotOwned: false,
    size: 10,
    page: 1,
    marked
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.applications.count > 1 ? 's' : ''
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.applications = await this.$axios.$get(this.env.publicUrl + '/api/v1/applications', {params:
        {size: this.size, page: this.page, q: this.search, 'is-owner': !this.showNotOwned}
      })
    }
  }
}
</script>
