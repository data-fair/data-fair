<template>
  <v-container fluid grid-list-lg>
    <h3 class="display-1">{{ datasets.count }} {{ plural ? 'jeux' : 'jeu' }} de données</h3>
    <v-layout row wrap>
      <v-flex sm12 md6 lg4 xl3 v-for="dataset in datasets.results" :key="dataset.id">
        <v-card>
          <v-card-title primary-title>
            <nuxt-link :to="`/dataset/${dataset.id}/description`">{{ dataset.title || dataset.id }}</nuxt-link>
          </v-card-title>
          <v-card-text v-if="dataset.description">
            {{ dataset.description }}
          </v-card-text>
          <v-card-actions>
            <span v-if="dataset.owner.type === 'user'"><v-icon>person</v-icon>{{ dataset.owner.name }}</span>
            <span v-if="dataset.owner.type === 'organization'"><v-icon>group</v-icon>{{ dataset.owner.name }}</span>
            <v-chip text-color="white" :color="dataset.public ? 'primary' : 'accent'">{{ dataset.public ? 'Public' : 'Privé' }}</v-chip>
          </v-card-actions>
        </v-card>
      </v-flex>
    </v-layout>
  </v-container>
</template>

<script>
const {mapState} = require('vuex')

export default {
  data: () => ({
    datasets: {
      count: 0,
      results: []
    }
  }),
  computed: {
    ...mapState(['user', 'env']),
    plural() {
      return this.datasets.count > 1
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.datasets = await this.$axios.$get(this.env.publicUrl + '/api/v1/datasets?size=100')
    }
  }
}
</script>
