<template>
  <v-container fluid grid-list-lg style="width:100vw">
    <h3 class="display-1" v-if="remoteServices">{{ remoteServices.count }} service{{ plural }} configuré{{ plural }}</h3>

    <search-filters v-if="initDone" :filter-labels="{}" :filters="filters" :facets="remoteServices && remoteServices.facets" @apply="refresh"/>
    <search-progress :loading="loading"/>

    <v-layout row wrap class="resourcesList" v-if="remoteServices">
      <v-flex sm12 md6 lg4 xl3 v-for="remoteService in remoteServices.results" :key="remoteService.id">
        <v-card height="100%">
          <v-card-title primary-title style="height:25%">
            <nuxt-link :to="`/remote-service/${remoteService.id}/description`">{{ remoteService.title || remoteService.id }}</nuxt-link>
          </v-card-title>
          <v-card-text style="height:50%;min-height:80px" v-html="marked($options.filters.truncate(remoteService.description || '', 200))"/>
          <v-card-actions style="height:25%">
            <span v-if="remoteService.owner.type === 'user'">&nbsp;<v-icon>person</v-icon>{{ remoteService.owner.name }}</span>
            <span v-if="remoteService.owner.type === 'organization'">&nbsp;<v-icon>group</v-icon>{{ remoteService.owner.name }}<span v-if="remoteService.owner.role"> ({{ remoteService.owner.role }})</span></span>
            &nbsp;<v-chip text-color="white" :color="remoteService.public ? 'primary' : 'accent'">{{ remoteService.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap v-if="remoteServices && remoteServices.count">
      <v-spacer/><v-pagination :length="Math.ceil(remoteServices.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
    </v-layout>

    <v-jumbotron v-if="!hasServices" height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <div class="headline" v-if="!filtered">Vous n'avez pas encore ajouté de services distants (API).<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">consulter la documentation</nuxt-link> pour en savoir plus.</div>
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
    page: 1,
    marked,
    loading: true,
    remoteServices: null,
    filters: {},
    filtered: false,
    initDone: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.remoteServices.count > 1 ? 's' : ''
    },
    size() {
      return {xs: 4, sm: 4, md: 8, lg: 12, xl: 16}[this.$vuetify.breakpoint.name]
    },
    hasServices() {
      return !this.remoteServices || (this.user && this.remoteServices.facets.owner.filter(f => (f.value.type === 'user' && f.value.id === this.user.id) || ((f.value.type === 'organization' && (this.user.organizations || []).map(o => o.id).includes(f.value.id)))).length)
    }
  },
  async created() {
    await this.$axios.$post(this.env.publicUrl + '/api/v1/remote-services/_init')
    this.initDone = true
  },
  methods: {
    async refresh() {
      this.loading = true
      this.remoteServices = await this.$axios.$get(this.env.publicUrl + '/api/v1/remote-services', {params:
        {size: this.size, page: this.page, select: 'title,description', ...this.filters, facets: 'owner'}
      })
      this.filtered = this.filters.q !== undefined
      this.loading = false
    }
  }
}
</script>
