<template>
  <div>
    <search-filters
      :filter-labels="{}"
      :hide-owners="true"
      :filters="filters"
      :facets="remoteServices && remoteServices.facets"
      type="remote-services"
      @apply="refresh()"
    />

    <v-container
      v-scroll="onScroll"
      class="pa-0"
      fluid
    >
      <v-row v-if="remoteServices" class="resourcesList">
        <v-col
          v-for="remoteService in remoteServices.results"
          :key="remoteService.id"
          cols="12"
          sm="6"
          md="4"
          lg="3"
          xl="2"
        >
          <remote-service-card :remote-service="remoteService" />
        </v-col>
        <search-progress :loading="loading" />
      </v-row>
    </v-container>

    <v-row v-if="remoteServices && remoteServices.count > size">
      <v-spacer />
      <v-pagination
        v-model="page"
        circle
        :length="Math.ceil(remoteServices.count / size)"
        @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
      />
    </v-row>
  </div>
</template>

<script>
  import SearchProgress from '~/components/search/progress.vue'
  import SearchFilters from '~/components/search/filters.vue'
  import RemoteServiceCard from '~/components/remote-services/card.vue'
  const { mapState } = require('vuex')

  export default {
    components: { SearchProgress, SearchFilters, RemoteServiceCard },
    data: () => ({
      page: 1,
      loading: true,
      remoteServices: null,
      filters: {},
      filtered: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      plural() {
        return this.remoteServices.count > 1
      },
      size() {
        return { xs: 12, sm: 12, md: 12, lg: 15, xl: 24 }[this.$vuetify.breakpoint.name]
      },
    },
    methods: {
      onScroll(e) {
        if (!this.datasets) return
        const se = e.target.scrollingElement
        if (se.clientHeight + se.scrollTop > se.scrollHeight - 140 && this.datasets.results.length < this.datasets.count) {
          this.refresh(true)
        }
      },
      async refresh(append) {
        this.loading = true
        if (append) this.page += 1
        else this.page = 1
        const remoteServices = await this.$axios.$get('api/v1/remote-services', {
          params:
            { size: this.size, page: this.page, select: 'title,description', ...this.filters },
        })
        if (append) remoteServices.results.forEach(r => this.remoteServices.results.push(r))
        else this.remoteServices = remoteServices
        this.$store.dispatch('breadcrumbs', [{ text: `${this.remoteServices.count} service${this.plural ? 's' : ''}` }])
        this.filtered = this.filters.q !== undefined
        this.loading = false
      },
    },
  }
</script>
