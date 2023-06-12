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
          class="text-h5 mb-4"
          v-text="$tc('datasetsCount', datasets.count)"
        />
        <p v-text="$t('harvestDatasetsMessage')" />
        <v-card>
          <v-list>
            <template v-for="dataset in datasets.results">
              <v-list-item :key="dataset.id">
                <v-list-item-avatar v-if="dataset.private !== undefined">
                  <v-icon>{{ dataset.private ? 'mdi-lock' : 'mdi-lock-open' }}</v-icon>
                </v-list-item-avatar>

                <v-list-item-content>
                  <v-list-item-title>
                    <a
                      :href="dataset.page"
                      target="_blank"
                    >{{ dataset.title }}</a>
                  </v-list-item-title>
                  <v-list-item-subtitle>
                    <!--{{ $tc('resources', dataset.resources.length) }} |
                    {{ $tc('harvestable', dataset.nbHarvestable) }} |
                    <a
                      v-if="dataset.harvestedLink"
                      :href="dataset.harvestedLink"
                      target="_blank"
                    >{{ $tc('harvested', dataset.nbHarvested) }}</a>
                    <template v-else>{{ $tc('harvested', dataset.nbHarvested) }}</template>-->
                    <nuxt-link
                      v-if="dataset.harvestedDataset"
                      :to="`/dataset/${dataset.harvestedDataset.id}`"
                    >
                      {{ $t('harvestedDataset', {updatedAt: $moment(dataset.harvestedDataset.updatedAt).format('LL')}) }}
                    </nuxt-link>
                  </v-list-item-subtitle>
                </v-list-item-content>

                <v-list-item-action>
                  <confirm-menu
                    v-if="dataset.harvestedDataset"
                    yes-color="warning"
                    :text="$t('overwriteDataset')"
                    :tooltip="$t('harvestDataset')"
                    icon="mdi-download"
                    @confirm="harvestDataset(dataset)"
                  />
                  <v-btn
                    v-else
                    :disabled="!!dataset.resources.find(r => r.harvestedDataset)"
                    color="primary"
                    icon
                    ripple
                    :title="$t('harvestDataset')"
                    @click="harvestDataset(dataset)"
                  >
                    <v-icon>mdi-download</v-icon>
                  </v-btn>
                </v-list-item-action>
              </v-list-item>
              <v-list-item
                v-for="resource of dataset.resources"
                :key="dataset.id + '-' + resource.id"
                style="min-height:40px"
              >
                <v-list-item-avatar
                  v-if="dataset.private !== undefined"
                  class="my-0"
                />
                <v-list-item-content class="py-1">
                  <v-list-item-title>
                    {{ $t('resource') }} - {{ resource.title }}
                  </v-list-item-title>
                  <v-list-item-subtitle>
                    {{ resource.format }} |
                    <template v-if="resource.size">
                      {{ resource.size | bytes($i18n.locale) }}
                    </template>
                    <template v-else>
                      {{ $t('sizeUnknown') }}
                    </template>
                    <template v-if="resource.harvestedDataset">
                      |
                      <nuxt-link :to="`/dataset/${resource.harvestedDataset.id}`">
                        {{ $t('harvestedDataset', {updatedAt: $moment(resource.harvestedDataset.updatedAt).format('LL')}) }}
                      </nuxt-link>
                    </template>
                  </v-list-item-subtitle>
                </v-list-item-content>

                <v-list-item-action class="my-0">
                  <confirm-menu
                    v-if="resource.harvestedDataset"
                    yes-color="warning"
                    :text="$t('overwriteDataset')"
                    :tooltip="$t('harvestDataset')"
                    icon="mdi-download"
                    @confirm="harvestDatasetResource(dataset, resource)"
                  />
                  <v-btn
                    v-else
                    :disabled="dataset.harvestedDataset"
                    color="primary"
                    icon
                    ripple
                    :title="$t('harvestDatasetResource')"
                    @click="harvestDatasetResource(dataset, resource)"
                  >
                    <v-icon>mdi-file-download</v-icon>
                  </v-btn>
                </v-list-item-action>
              </v-list-item>
              <v-divider
                :key="'divider-' + dataset.id"
              />
            </template>
          </v-list>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  datasetsCount: " | 1 jeu de données dans le catalogue | {count} jeux de données dans le catalogue"
  resource: ressource
  harvestDatasetsMessage: Vous pouvez importer les métadonnées des jeux de données du catalogue pour les référencer dans ce service et dans vos portails. Vous pouvez également importer les ressources comme des jeux de données de type fichier pour exploiter leurs données.
  harvestDataset: Importer les métadonnées dans un jeu de données local
  harvestDatasetResource: Importer la ressource comme jeu de données local
  harvestedDataset: jeu de données importé (mis à jour le {updatedAt})
  noneHarvested: jeu de données non importé
  sizeUnknown: taille inconnue
  fetchError: Erreur pendant la récupération des jeux de données du catalogue
  importError: Erreur pendant l'import du jeu de données
  overwriteDataset: Souhaitez vous écraser les informations précédement importées ?
en:
  datasetsCount: " | 1 dataset in the catalog | {count} datasets in the catalog"
  resource: resource
  harvestDataset: Import metadata in a local dataset
  harvestDatasetResource: Import the resource as local dataset
  harvestedDataset: harvested dataset (updated on {updatedAt})
  noneHarvested: dataset not yet harvested
  sizeUnknown: size unknown
  fetchError: Error while fetching datasets from the catalog
  importError: Error while importing the dataset
  overwriteDataset: Do you want to overwrite the previously imported information ?
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
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('fetchError') })
      }
      this.loading = false
    },
    async harvestDataset (dataset) {
      this.loading = true
      try {
        await this.$axios.$post(`api/v1/catalogs/${this.$route.params.id}/datasets/${dataset.id}`)
        await this.refresh()
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('importError') })
        this.loading = false
      }
    },
    async harvestDatasetResource (dataset, resource) {
      this.loading = true
      try {
        await this.$axios.$post(`api/v1/catalogs/${this.$route.params.id}/datasets/${dataset.id}/resources/${resource.id}`)
        await this.refresh()
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('importError') })
        this.loading = false
      }
    }
  }
}
</script>
