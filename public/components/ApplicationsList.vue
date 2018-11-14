<template>
  <v-container fluid grid-list-lg>
    <h3 v-if="applications" class="display-1">{{ applications.count }} configuration{{ plural }} d'application{{ plural }}</h3>

    <search-filters :filter-labels="{'dataset': 'Jeu de données', 'service': 'Service', 'url': 'Application de base'}" :filters="filters" :facets="applications && applications.facets" type="applications" @apply="page = 1; refresh()"/>
    <search-progress :loading="loading"/>

    <v-layout v-if="applications" row wrap class="resourcesList">

      <v-flex v-for="application in applications.results" :key="application.id" sm12 md6 lg4 xl3>
        <v-card height="100%">
          <v-card-title primary-title style="padding-top: 0; padding-bottom: 0;">
            <nuxt-link :to="`/application/${application.id}/description`">{{ application.title || application.id }}</nuxt-link>
            <v-spacer/>
            <v-btn :href="`${env.publicUrl}/app/${application.id}`" icon flat color="primary" target="_blank" title="Accéder à l'application">
              <v-icon>exit_to_app</v-icon>
            </v-btn>
          </v-card-title>
          <v-divider/>
          <v-img :src="`${application.href}/capture`" height="200px"/>
          <v-divider/>
          <v-card-text style="max-height:160px;overflow: hidden; margin-bottom: 40px;" v-html="marked($options.filters.truncate(application.description || '', 200))"/>

          <v-card-actions style="position:absolute; bottom: 0px;width:100%;">
            <span v-if="application.owner.type === 'user'"><v-icon>person</v-icon>&nbsp;{{ application.owner.name }}</span>
            <span v-if="application.owner.type === 'organization'"><v-icon>group</v-icon>&nbsp;{{ application.owner.name }}<span v-if="application.owner.role"> ({{ application.owner.role }})</span></span>
            &nbsp;<v-chip :color="application.public ? 'primary' : 'accent'" text-color="white">{{ application.public ? 'Public' : 'Privé' }}</v-chip>
            <template v-if="application.status === 'configured'">
              <v-spacer />
              <span><v-icon color="red">warning</v-icon>&nbsp;En erreur</span>
            </template>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout v-if="applications && applications.count" row wrap>
      <v-spacer/><v-pagination :length="Math.ceil(applications.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset});refresh()"/>
    </v-layout>

    <v-responsive v-if="!hasApplications" height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <div v-if="!filtered" class="headline">Vous n'avez pas encore configuré d'applications.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">consulter la documentation</nuxt-link> pour en savoir plus.</div>
            <div v-else class="headline">Aucun résultat ne correspond aux critères de recherche</div>
          </v-flex>
        </v-layout>
      </v-container>
    </v-responsive>
  </v-container>
</template>

<script>
import SearchProgress from './SearchProgress.vue'
import SearchFilters from './SearchFilters.vue'
const marked = require('marked')
const { mapState } = require('vuex')

export default {
  components: { SearchProgress, SearchFilters },
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
      return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
    },
    hasApplications() {
      return !this.applications || (this.user && this.applications.facets.owner.filter(f => (f.value.type === 'user' && f.value.id === this.user.id) || ((f.value.type === 'organization' && (this.user.organizations || []).map(o => o.id).includes(f.value.id)))).length)
    }
  },
  methods: {
    async refresh() {
      this.loading = true
      this.applications = await this.$axios.$get(this.env.publicUrl + '/api/v1/applications', { params:
        { size: this.size, page: this.page, select: 'title,description,status', ...this.filters, facets: 'owner' }
      })
      this.filtered = this.filters.q !== undefined
      this.loading = false
    }
  }
}
</script>
