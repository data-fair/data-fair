<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ remoteServices.count }} service{{ plural }} configuré{{ plural }}</h3>
    <v-layout row wrap>
      <v-flex xs12 sm5 md4 lg3>
        <v-text-field label="Rechercher" v-model="search" append-icon="search" @keyup.enter.native="refresh" @click:append="refresh"/>
      </v-flex>
      <v-spacer/>
      <v-flex xs12 sm7 md6 lg5 class="pt-4">
        <v-switch label="Voir les services dont je ne suis pas propriétaire" v-model="showNotOwned" @change="refresh"/>
      </v-flex>

      <search-progress :loading="loading"/>

    </v-layout>
    <v-layout row wrap class="resourcesList">
      <v-flex sm12 md6 lg4 xl3 v-for="remoteService in remoteServices.results" :key="remoteService.id">
        <v-card height="100%">
          <v-card-title primary-title style="height:25%">
            <nuxt-link :to="`/remote-service/${remoteService.id}/description`">{{ remoteService.title || remoteService.id }}</nuxt-link>
          </v-card-title>
          <v-card-text style="height:50%;min-height:80px" v-html="marked($options.filters.truncate(remoteService.description || '', 200))"/>
          <v-card-actions style="height:25%">
            <span v-if="remoteService.owner.type === 'user'">&nbsp;<v-icon>person</v-icon>{{ remoteService.owner.name }}</span>
            <span v-if="remoteService.owner.type === 'organization'">&nbsp;<v-icon>group</v-icon>{{ remoteService.owner.name }}</span>
            &nbsp;<v-chip text-color="white" :color="remoteService.public ? 'primary' : 'accent'">{{ remoteService.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap v-if="remoteServices.count">
      <v-spacer/><v-pagination :length="Math.ceil(remoteServices.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
    </v-layout>

  </v-container>
</template>

<script>
import SearchProgress from './SearchProgress.vue'
const marked = require('marked')
const {mapState} = require('vuex')

export default {
  components: {SearchProgress},
  data: () => ({
    remoteServices: {
      count: 0,
      results: []
    },
    search: '',
    showNotOwned: false,
    size: 10,
    page: 1,
    marked,
    loading: true
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.remoteServices.count > 1 ? 's' : ''
    }
  },
  created() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.loading = true
      this.remoteServices = await this.$axios.$get(this.env.publicUrl + '/api/v1/remote-services', {params:
        {size: this.size, page: this.page, q: this.search, 'is-owner': !this.showNotOwned, select: 'title,description'}
      })
      this.loading = false
    }
  }
}
</script>
