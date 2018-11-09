<template>
  <v-container fluid grid-list-lg style="width:100vw">
    <h3 v-if="datasets" class="display-1">{{ datasets.count }} {{ plural ? 'jeux' : 'jeu' }} de données</h3>

    <search-filters :filter-labels="{children: 'Jeu de données agrégé'}" :filters="filters" :facets="datasets && datasets.facets" type="datasets" @apply="page = 1; refresh()"/>
    <search-progress :loading="loading"/>

    <v-layout v-if="datasets" row wrap class="resourcesList">
      <v-flex v-for="dataset in datasets.results" :key="dataset.id" sm12 md6 lg4 xl3>
        <v-card height="100%">
          <v-card-title primary-title style="height:25%">
            <nuxt-link :to="`/dataset/${dataset.id}/description`">{{ dataset.title || dataset.id }}</nuxt-link>
          </v-card-title>
          <v-card-text style="height:50%;min-height:80px" v-html="marked($options.filters.truncate(dataset.description || '', 200))"/>
          <v-card-actions style="width:100%;height:25%">
            <span v-if="dataset.owner.type === 'user'"><v-icon>person</v-icon>&nbsp;{{ dataset.owner.name }}</span>
            <span v-if="dataset.owner.type === 'organization'"><v-icon>group</v-icon>&nbsp;{{ dataset.owner.name }}<span v-if="dataset.owner.role"> ({{ dataset.owner.role }})</span></span>
            &nbsp;<v-chip :color="dataset.public ? 'primary' : 'accent'" text-color="white">{{ dataset.public ? 'Public' : 'Privé' }}</v-chip>
            <template v-if="dataset.status === 'error'">
              <v-spacer />
              <span><v-icon color="red">warning</v-icon>&nbsp;Erreurs pendant la publication</span>
            </template>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout v-if="datasets && datasets.count" row wrap>
      <v-spacer/><v-pagination :length="Math.ceil(datasets.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset});refresh()"/>
    </v-layout>

    <v-responsive v-if="!hasDatasets" height="auto">
      <v-container fill-height>
        <v-layout align-center>
          <v-flex text-xs-center>
            <div v-if="!filtered" class="headline">Vous n'avez pas encore ajouté de jeu de données.<br>Vous pouvez <nuxt-link :to="localePath('user-guide')">consulter la documentation</nuxt-link> pour en savoir plus.</div>
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
    datasets: null,
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
      return this.datasets.count > 1
    },
    size() {
      return { xs: 4, sm: 4, md: 8, lg: 12, xl: 16 }[this.$vuetify.breakpoint.name]
    },
    hasDatasets() {
      return !this.datasets || (this.user && this.datasets.facets.owner.filter(f => (f.value.type === 'user' && f.value.id === this.user.id) || ((f.value.type === 'organization' && (this.user.organizations || []).map(o => o.id).includes(f.value.id)))).length)
    }
  },
  methods: {
    async refresh() {
      this.loading = true
      this.datasets = await this.$axios.$get(this.env.publicUrl + '/api/v1/datasets', { params:
        { size: this.size, page: this.page, select: 'title,description,status', ...this.filters, facets: 'owner', sort: 'createdAt: -1' }
      })
      this.filtered = this.filters.q !== undefined
      this.loading = false
    }
  }
}
</script>
