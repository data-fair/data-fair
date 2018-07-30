<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ applications.count }} configuration{{ plural }} d'application{{ plural }}</h3>
    <v-layout row wrap>
      <v-flex xs12 sm5 md4 lg3>
        <v-text-field label="Rechercher" v-model="search" append-icon="search" @keyup.enter.native="refresh" @click:append="refresh"/>
      </v-flex>
      <v-spacer/>
      <v-flex xs12 sm7 md6 lg5>
        <v-switch label="Voir les applications dont je ne suis pas propriétaire" v-model="showNotOwned" @change="refresh"/>
      </v-flex>
    </v-layout>

    <search-filters :filter-labels="{'dataset': 'Jeu de données', 'service': 'Service'}" :filters="filters" @apply="refresh"/>

    <v-layout row wrap class="resourcesList">
      <search-progress :loading="loading"/>

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
            <span v-if="application.owner.type === 'user'"><v-icon>person</v-icon>&nbsp;{{ application.owner.name }}</span>
            <span v-if="application.owner.type === 'organization'"><v-icon>group</v-icon>&nbsp;{{ application.owner.name }}</span>
            &nbsp;<v-chip text-color="white" :color="application.public ? 'primary' : 'accent'">{{ application.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap v-if="applications.count">
      <v-spacer/><v-pagination :length="Math.ceil(applications.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
    </v-layout>
  </v-container>
</template>

<script>
import SearchProgress from './SearchProgress.vue'
import SearchFilters from './SearchFilters.vue'
const marked = require('marked')
const {mapState} = require('vuex')

export default {
  components: {SearchProgress, SearchFilters},
  data() {
    return {
      applications: {
        count: 0,
        results: []
      },
      search: '',
      showNotOwned: false,
      size: 10,
      page: 1,
      marked,
      loading: true,
      filters: {}
    }
  },
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.applications.count > 1 ? 's' : ''
    }
  },
  methods: {
    async refresh() {
      this.loading = true
      this.applications = await this.$axios.$get(this.env.publicUrl + '/api/v1/applications', {params:
        {size: this.size, page: this.page, q: this.search, 'is-owner': !this.showNotOwned, select: 'title,description', ...this.filters}
      })
      this.loading = false
    }
  }
}
</script>
