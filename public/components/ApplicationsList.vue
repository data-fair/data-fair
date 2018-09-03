<template>
  <v-container fluid grid-list-lg style="width:100vw">
    <h3 class="display-1" v-if="applications">{{ applications.count }} configuration{{ plural }} d'application{{ plural }}</h3>

    <search-filters :filter-labels="{'dataset': 'Jeu de données', 'service': 'Service'}" :filters="filters" :facets="applications && applications.facets" type="applications" @apply="refresh"/>
    <search-progress :loading="loading"/>

    <v-layout row wrap class="resourcesList" v-if="applications">

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
            <span v-if="application.owner.type === 'organization'"><v-icon>group</v-icon>&nbsp;{{ application.owner.name }}<span v-if="application.owner.role"> ({{ application.owner.role }})</span></span>
            &nbsp;<v-chip text-color="white" :color="application.public ? 'primary' : 'accent'">{{ application.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap v-if="applications && applications.count">
      <v-spacer/><v-pagination :length="Math.ceil(applications.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
    </v-layout>

    <v-jumbotron v-if="!hasApplications" height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <div class="headline" v-if="!filtered">Vous n'avez pas encore configuré d'applications.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">consulter la documentation</nuxt-link> pour en savoir plus.</div>
            <div class="headline" v-else>Aucun résultat ne correspond aux critères de recherche</div>
          </v-flex>
        </v-layout>
      </v-container>
    </v-jumbotron>
  </v-container>
</template>

<script>
import SearchProgress from './SearchProgress.vue'
import SearchFilters from './SearchFilters.vue'
const marked = require('marked')
const {mapState} = require('vuex')

export default {
  components: {SearchProgress, SearchFilters},
  data: () => ({
    applications: null,
    page: 1,
    marked,
    loading: true,
    filters: {},
    filtered: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.applications.count > 1 ? 's' : ''
    },
    size() {
      return {xs: 4, sm: 4, md: 8, lg: 12, xl: 16}[this.$vuetify.breakpoint.name]
    },
    hasApplications() {
      return !this.applications || (this.user && this.applications.facets.owner.filter(f => (f.value.type === 'user' && f.value.id === this.user.id) || ((f.value.type === 'organization' && (this.user.organizations || []).map(o => o.id).includes(f.value.id)))).length)
    }
  },
  methods: {
    async refresh() {
      this.loading = true
      this.applications = await this.$axios.$get(this.env.publicUrl + '/api/v1/applications', {params:
        {size: this.size, page: this.page, select: 'title,description', ...this.filters, facets: 'owner'}
      })
      this.filtered = this.filters.q !== undefined
      this.loading = false
    }
  }
}
</script>
