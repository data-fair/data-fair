<template>
  <v-container v-if="datasets" fluid grid-list-lg style="width:100vw">
    <h3 v-if="datasets" class="display-1">{{ datasets.count }} dataset{{ plural }} dans le catalogue distant</h3>
    <v-list three-line>
      <v-list-tile v-for="dataset in datasets.results" :key="dataset.id">
        <v-list-tile-avatar>
          <v-icon>{{ dataset.private ? 'lock' : 'public' }}</v-icon>
        </v-list-tile-avatar>

        <v-list-tile-content>
          <v-list-tile-title>{{ dataset.title }}</v-list-tile-title>
          <v-list-tile-sub-title>{{ dataset.resources.length }} resources {{ dataset.harvestableResources ? `dont ${dataset.harvestableResources.length} indexables` : '' }}</v-list-tile-sub-title>
        </v-list-tile-content>

        <v-list-tile-action>
          <v-layout row>
            <v-btn :href="dataset.page" color="grey--text lighten-1" class="px-4" icon ripple>
              <v-icon>file_copy</v-icon>
            </v-btn>
            <v-btn :href="dataset.url" color="grey--text lighten-1" class="px-4" icon ripple>
              <v-icon>cloud</v-icon>
            </v-btn>
            <v-btn color="grey--text lighten-1" class="px-4" icon ripple @click="harvest(dataset)">
              <v-icon>file_download</v-icon>
            </v-btn>
          </v-layout>
        </v-list-tile-action>
      </v-list-tile>
    </v-list>
  </v-container>
</template>

<script>
import eventBus from '../event-bus'
const { mapState } = require('vuex')

export default {
  data: () => ({
    datasets: null,
    loading: false
  }),
  computed: {
    ...mapState(['env']),
    plural() {
      return this.datasets.count > 1 ? 's' : ''
    }
  },
  mounted() {
    this.refresh()
  },
  methods: {
    async refresh() {
      this.loading = true
      try {
        this.datasets = await this.$axios.$get(this.env.publicUrl + '/api/v1/catalogs/' + this.$route.params.id + '/datasets')
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant la récupération des jeux de données du catalogue` })
      }
      this.loading = false
    },
    async harvest(dataset) {
      this.loading = true
      try {
        const resources = await this.$axios.$post(this.env.publicUrl + '/api/v1/catalogs/' + this.$route.params.id + '/datasets/' + dataset.id)
      } catch (error) {
        eventBus.$emit('notification', { error, msg: `Erreur pendant l'import du jeu de données` })
      }
      this.$set(dataset, 'harvestableResources', resources)
      this.loading = false
    }
  }
}
</script>
