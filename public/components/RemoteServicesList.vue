<template>
  <div>
    <h3
      v-if="remoteServices"
      class="display-1"
    >
      {{ remoteServices.count }} service{{ plural }} configuré{{ plural }}
    </h3>

    <search-filters
      :filter-labels="{}"
      :hide-owners="true"
      :filters="filters"
      :facets="remoteServices && remoteServices.facets"
      type="remote-services"
      @apply="page = 1; refresh()"
    />
    <search-progress :loading="loading" />

    <v-container
      class="pa-0"
      fluid
      grid-list-lg
    >
      <v-row
        v-if="remoteServices"

        class="resourcesList"
      >
        <v-col
          v-for="remoteService in remoteServices.results"
          :key="remoteService.id"
          sm="12"
          md="6"
          lg="4"
          xl="3"
        >
          <v-card height="100%">
            <v-card-title
              primary-title
              style="height:25%"
            >
              <nuxt-link :to="`/remote-service/${remoteService.id}/description`">
                {{ remoteService.title || remoteService.id }}
              </nuxt-link>
            </v-card-title>
            <v-card-text
              style="height:50%;min-height:80px"
              v-html="marked($options.filters.truncate(remoteService.description || '', 200))"
            />
          </v-card>
        </v-col>
      </v-row>
    </v-container>

    <v-row
      v-if="remoteServices && remoteServices.count"
    >
      <v-spacer /><v-pagination
        v-model="page"
        :length="Math.ceil(remoteServices.count / size)"
        @input="$vuetify.goTo('.resourcesList', {offset});refresh()"
      />
    </v-row>
  </div>
</template>

<script>
  import SearchProgress from './search/progress.vue'
  import SearchFilters from './search/filters.vue'
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
      filtered: false,
    }),
    computed: {
      ...mapState('session', ['user']),
      ...mapState(['env']),
      plural() {
        return this.remoteServices.count > 1 ? 's' : ''
      },
      size() {
        return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
      },
    },
    methods: {
      async refresh() {
        this.loading = true
        this.remoteServices = await this.$axios.$get('api/v1/remote-services', {
          params:
            { size: this.size, page: this.page, select: 'title,description', ...this.filters },
        })
        this.filtered = this.filters.q !== undefined
        this.loading = false
      },
    },
  }
</script>
