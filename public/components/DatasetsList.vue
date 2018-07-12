<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ datasets.count }} {{ plural ? 'jeux' : 'jeu' }} de données</h3>
    <v-layout row wrap>
      <v-flex xs12 sm5 md4 lg3>
        <v-text-field label="Rechercher" v-model="search" append-icon="search" @keyup.enter.native="refresh" :append-icon-cb="refresh"/>
      </v-flex>
      <v-spacer/>
      <v-flex xs12 sm7 md6 lg5 class="pt-4">
        <v-switch label="Voir les jeux dont je ne suis pas propriétaire" v-model="showNotOwned" @change="refresh"/>
      </v-flex>
    </v-layout>

    <v-layout row wrap class="resourcesList">
      <v-flex sm12 md6 lg4 xl3 v-for="dataset in datasets.results" :key="dataset.id">
        <v-card height="100%">
          <v-card-title primary-title style="height:25%">
            <nuxt-link :to="`/dataset/${dataset.id}/description`">{{ dataset.title || dataset.id }}</nuxt-link>
          </v-card-title>
          <v-card-text style="height:50%;min-height:80px" v-html="marked($options.filters.truncate(dataset.description || '', 200))"/>
          <v-card-actions style="height:25%">
            <span v-if="dataset.owner.type === 'user'"><v-icon>person</v-icon>&nbsp;{{ dataset.owner.name }}</span>
            <span v-if="dataset.owner.type === 'organization'"><v-icon>group</v-icon>&nbsp;{{ dataset.owner.name }}</span>
            &nbsp;<v-chip text-color="white" :color="dataset.public ? 'primary' : 'accent'">{{ dataset.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>

    <v-layout row wrap>
      <v-spacer/><v-pagination :length="Math.ceil(datasets.count / size)" v-model="page" @input="$vuetify.goTo('.resourcesList', {offset: -20});refresh()"/>
    </v-layout>
  </v-container>
</template>

<script>
const marked = require('marked')
const {mapState} = require('vuex')

export default {
  data: () => ({
    datasets: {
      count: 0,
      results: []
    },
    search: '',
    showNotOwned: false,
    size: 10,
    page: 1,
    marked
  }),
  computed: {
    ...mapState('session', ['user']),
    ...mapState(['env']),
    plural() {
      return this.datasets.count > 1
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.datasets = await this.$axios.$get(this.env.publicUrl + '/api/v1/datasets', {params:
        {size: this.size, page: this.page, q: this.search, 'is-owner': !this.showNotOwned}
      })
    }
  }
}
</script>
