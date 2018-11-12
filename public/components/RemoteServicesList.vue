<template>
  <v-container fluid grid-list-lg style="width:100vw">
    <h3 v-if="remoteServices" class="display-1">{{ remoteServices.count }} service{{ plural }} configuré{{ plural }}</h3>

    <search-filters :filter-labels="{}" :hide-owners="true" :filters="filters" :facets="remoteServices && remoteServices.facets" type="remote-services" @apply="page = 1; refresh()"/>
    <search-progress :loading="loading"/>

    <v-layout v-if="remoteServices" row wrap class="resourcesList">
      <v-flex v-for="remoteService in remoteServices.results" :key="remoteService.id" sm12 md6 lg4 xl3>
        <v-card height="100%">
          <v-card-title primary-title style="height:25%">
            <nuxt-link :to="`/remote-service/${remoteService.id}/description`">{{ remoteService.title || remoteService.id }}</nuxt-link>
          </v-card-title>
          <v-card-text style="height:50%;min-height:80px" v-html="marked($options.filters.truncate(remoteService.description || '', 200))"/>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout v-if="remoteServices && remoteServices.count" row wrap>
      <v-spacer/><v-pagination :length="Math.ceil(remoteServices.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset});refresh()"/>
    </v-layout>
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
    page: 1,
    marked,
    loading: true,
    remoteServices: null,
    filters: {},
    filtered: false
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.remoteServices.count > 1 ? 's' : ''
    },
    size() {
      return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
    }
  },
  methods: {
    async refresh() {
      this.loading = true
      this.remoteServices = await this.$axios.$get(this.env.publicUrl + '/api/v1/remote-services', { params:
        { size: this.size, page: this.page, select: 'title,description', ...this.filters }
      })
      this.filtered = this.filters.q !== undefined
      this.loading = false
    }
  }
}
</script>
