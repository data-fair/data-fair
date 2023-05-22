<template>
  <v-container fluid>
    <v-progress-linear
      v-if="loading"
      :indeterminate="true"
      height="2"
    />
    <v-row v-if="datasets && !loading">
      <v-col>
        <h3
          class="text-h4 mb-4"
          v-text="$tc('datasetsCount', datasets.count)"
        />
        <v-card>
          <v-list three-line>
            <v-list-item
              v-for="dataset in datasets.results"
              :key="dataset.id"
            >
              <v-list-item-avatar>
                <v-icon>{{ dataset.private ? 'mdi-lock' : 'mdi-public' }}</v-icon>
              </v-list-item-avatar>

              <v-list-item-content>
                <v-list-item-title>
                  <a
                    :href="dataset.page"
                    target="_blank"
                  >{{ dataset.title }}</a>
                </v-list-item-title>
                <v-list-item-subtitle>
                  {{ $tc('resources', dataset.resources.length) }} |
                  {{ $tc('harvestable', dataset.nbHarvestable) }} |
                  {{ $tc('harvested', dataset.nbHarvested) }}
                </v-list-item-subtitle>
              </v-list-item-content>

              <v-list-item-action>
                <v-btn
                  :disabled="dataset.nbHarvestable === dataset.nbHarvested"
                  color="primary"
                  class="mr-3"
                  icon
                  ripple
                  :title="$t('harvest')"
                  @click="harvest(dataset)"
                >
                  <v-icon>mdi-file-download</v-icon>
                </v-btn>
              </v-list-item-action>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasetsCount: " | 1 jeu de données dans le catalogue | {count} jeux de données dans le catalogue"
  resources: "Pas de ressource dans le catalogue | 1 ressource dans le catalogue | {count} ressources dans le catalogue"
  harvestable: "aucune importable | 1 importable | {count} importables"
  harvested: "aucune déjà importée | 1 déjà importée | {count} déjà importée"
  harvest: Importer les ressources comme jeux de données locaux
  fetchError: Erreur pendant la récupération des jeux de données du catalogue
  importError: Erreur pendant l'import du jeu de données
en:
  datasetsCount: " | 1 dataset in the catalog | {count} datasets in the catalog"
  resources: " | 1 resource in the catalog | {count} resources in the catalog"
  harvestable: "none harvestable | 1 harvestable | {count} harvestable"
  harvested: "none harvested | 1 harvested | {count} harvested"
  harvest: Import the resources as local datasets
  fetchError: Error while fetching datasets from the catalog
  importError: Error while importing the dataset
</i18n>

<script>
import eventBus from '~/event-bus'
const { mapState } = require('vuex')

export default {
  data: () => ({
    datasets: null,
    loading: false
  }),
  computed: {
    ...mapState(['env'])
  },
  mounted () {
    this.refresh()
  },
  methods: {
    async refresh () {
      this.loading = true
      try {
        this.datasets = await this.$axios.$get('api/v1/catalogs/' + this.$route.params.id + '/datasets')
        this.datasets.results.forEach(d => {
          d.nbHarvestable = (d.resources || []).filter(r => r.harvestable).length
          d.nbHarvested = (d.resources || []).filter(r => !!r.harvestedDataset).length
        })
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('fetchError') })
      }
      this.loading = false
    },
    async harvest (dataset) {
      this.loading = true
      try {
        await this.$axios.$post('api/v1/catalogs/' + this.$route.params.id + '/datasets/' + dataset.id)
        await this.refresh()
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('importError') })
        this.loading = false
      }
    }
  }
}
</script>
