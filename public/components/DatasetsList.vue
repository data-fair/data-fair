<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1" v-if="datasets">{{ datasets.count }} {{ plural ? 'jeux' : 'jeu' }} de données</h3>

    <search-filters :filter-labels="{}" :filters="filters" :facets="datasets && datasets.facets" @apply="refresh"/>
    <search-progress :loading="loading"/>

    <v-layout row wrap class="resourcesList" v-if="datasets">
      <v-flex sm12 md6 lg4 xl3 v-for="dataset in datasets.results" :key="dataset.id">
        <v-card height="100%">
          <v-card-title primary-title style="height:25%">
            <nuxt-link :to="`/dataset/${dataset.id}/description`">{{ dataset.title || dataset.id }}</nuxt-link>
          </v-card-title>
          <v-card-text style="height:50%;min-height:80px" v-html="marked($options.filters.truncate(dataset.description || '', 200))"/>
          <v-card-actions style="width:100%;height:25%">
            <span v-if="dataset.owner.type === 'user'"><v-icon>person</v-icon>&nbsp;{{ dataset.owner.name }}</span>
            <span v-if="dataset.owner.type === 'organization'"><v-icon>group</v-icon>&nbsp;{{ dataset.owner.name }}</span>
            &nbsp;<v-chip text-color="white" :color="dataset.public ? 'primary' : 'accent'">{{ dataset.public ? 'Public' : 'Privé' }}</v-chip>
            <template v-if="dataset.status === 'error'">
              <v-spacer />
              <span><v-icon color="red">warning</v-icon>&nbsp;Erreurs pendant la publication</span>
            </template>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap v-if="datasets && datasets.count">
      <v-spacer/><v-pagination :length="Math.ceil(datasets.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
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
  data: () => ({
    datasets: null,
    page: 1,
    marked,
    loading: true,
    filters: {}
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.datasets.count > 1
    },
    size() {
      return {xs: 4, sm: 4, md: 8, lg: 12, xl: 16}[this.$vuetify.breakpoint.name]
    }
  },
  methods: {
    async refresh() {
      this.loading = true
      this.datasets = await this.$axios.$get(this.env.publicUrl + '/api/v1/datasets', {params:
        {size: this.size, page: this.page, select: 'title,description,status', ...this.filters, facets: 'owner', sort: 'createdAt: -1'}
      })
      this.loading = false
    }
  }
}
</script>
