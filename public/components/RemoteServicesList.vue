<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ remoteServices.count }} service{{ plural }} distant{{ plural }} configuré{{ plural }}</h3>
    <v-layout row wrap>
      <v-flex xs12 sm5 md4 lg3>
        <v-text-field label="Rechercher" v-model="search" append-icon="search" @keyup.enter.native="refresh" :append-icon-cb="refresh"/>
      </v-flex>
      <v-spacer/>
      <v-flex xs12 sm7 md5 lg3 class="pt-4">
        <v-switch v-if="user" label="Voir les services publics des autres utilisateurs" v-model="showPublic" @change="refresh"/>
      </v-flex>
    </v-layout>

    <v-layout row wrap class="resourcesList">
      <v-flex sm12 md6 lg4 xl3 v-for="remoteService in remoteServices.results" :key="remoteService.id">
        <v-card>
          <v-card-title primary-title>
            <nuxt-link :to="`/remote-service/${remoteService.id}/description`">{{ remoteService.title || remoteService.id }}</nuxt-link>
          </v-card-title>
          <v-card-text style="min-height:80px" v-html="marked(remoteService.description || '')"/>
          <v-card-actions>
            <span v-if="remoteService.owner.type === 'user'"><v-icon>person</v-icon>{{ remoteService.owner.name }}</span>
            <span v-if="remoteService.owner.type === 'organization'"><v-icon>group</v-icon>{{ remoteService.owner.name }}</span>
            <v-chip text-color="white" :color="remoteService.public ? 'primary' : 'accent'">{{ remoteService.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap>
      <v-spacer/><v-pagination :length="Math.ceil(remoteServices.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
    </v-layout>
  </v-container>
</template>

<script>
const marked = require('marked')
const {mapState} = require('vuex')

export default {
  data: () => ({
    remoteServices: {
      count: 0,
      results: []
    },
    search: '',
    showPublic: false,
    size: 10,
    page: 1,
    marked
  }),
  computed: {
    ...mapState(['user', 'env']),
    plural() {
      return this.remoteServices.count > 1 ? 's' : ''
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.remoteServices = await this.$axios.$get(this.env.publicUrl + '/api/v1/remote-services', {params:
        {size: this.size, page: this.page, q: this.search, public: this.showPublic}
      })
    }
  }
}
</script>
