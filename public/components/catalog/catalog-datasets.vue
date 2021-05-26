<template>
  <v-container fluid>
    <v-progress-linear
      v-if="loading"
      :indeterminate="true"
      height="2"
    />
    <v-row v-if="datasets && !loading">
      <v-col>
        <h3 class="text-h4 mb-4">
          {{ datasets.count }} {{ datasets.count > 1 ? 'jeux de données' : 'jeu de données' }} dans le catalogue
        </h3>
        <v-card>
          <v-list three-line>
            <v-list-item
              v-for="dataset in datasets.results"
              :key="dataset.id"
            >
              <v-list-item-avatar>
                <v-icon>{{ dataset.private ? 'lock' : 'public' }}</v-icon>
              </v-list-item-avatar>

              <v-list-item-content>
                <v-list-item-title>
                  <a
                    :href="dataset.page"
                    target="_blank"
                  >{{ dataset.title }}</a>
                </v-list-item-title>
                <v-list-item-subtitle>
                  Ressources :
                  {{ dataset.resources.length }} dans le catalogue |
                  {{ dataset.nbHarvestable }} {{ dataset.nbHarvestable > 1 ? 'importables' : 'importable' }} |
                  {{ dataset.nbHarvested }} {{ dataset.nbHarvested > 1 ? 'déjà importées' : 'déjà importée' }}
                </v-list-item-subtitle>
              </v-list-item-content>

              <v-list-item-action>
                <v-btn
                  :disabled="dataset.nbHarvestable === dataset.nbHarvested"
                  color="primary"
                  class="mr-3"
                  icon
                  ripple
                  title="Importer les ressources comme jeux de données indexés"
                  @click="harvest(dataset)"
                >
                  <v-icon>file_download</v-icon>
                </v-btn>
              </v-list-item-action>
            </v-list-item>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script>
  import eventBus from '~/event-bus'
  const { mapState } = require('vuex')

  export default {
    data: () => ({
      datasets: null,
      loading: false,
    }),
    computed: {
      ...mapState(['env']),
    },
    mounted() {
      this.refresh()
    },
    methods: {
      async refresh() {
        this.loading = true
        try {
          this.datasets = await this.$axios.$get('api/v1/catalogs/' + this.$route.params.id + '/datasets')
          this.datasets.results.forEach(d => {
            d.nbHarvestable = (d.resources || []).filter(r => r.harvestable).length
            d.nbHarvested = (d.resources || []).filter(r => !!r.harvestedDataset).length
          })
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant la récupération des jeux de données du catalogue' })
        }
        this.loading = false
      },
      async harvest(dataset) {
        this.loading = true
        try {
          await this.$axios.$post('api/v1/catalogs/' + this.$route.params.id + '/datasets/' + dataset.id)
          await this.refresh()
        } catch (error) {
          eventBus.$emit('notification', { error, msg: 'Erreur pendant l\'import du jeu de données' })
          this.loading = false
        }
      },
    },
  }
</script>
