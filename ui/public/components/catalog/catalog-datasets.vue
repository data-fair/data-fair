<template>
  <v-container fluid>
    <v-progress-linear
      v-if="loading"
      :indeterminate="true"
      height="2"
    />
    <v-row v-if="catalog && datasets && !loading">
      <v-col>
        <h3
          class="text-h5 mb-4"
          v-text="$tc('datasetsCount', datasets.count)"
        />
        <p v-text="$t('harvestDatasetsMessage')" />

        <template v-if="catalogType && catalogType.optionalCapabilities.includes('autoUpdate')">
          <v-checkbox
            :input-value="catalog.autoUpdate && catalog.autoUpdate.active"
            :label="$t('autoUpdate')"
            color="warning"
            :messages="catalog.autoUpdate && catalog.autoUpdate.nextUpdate"
            class="mb-2"
            @change="value => patchAndApplyRemoteChange({autoUpdate: {active: !!value}})"
          >
            <template #message>
              {{ $t('nextUpdate') }} {{ catalog.autoUpdate.nextUpdate | moment("from", "now") }}
            </template>
          </v-checkbox>
        </template>

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
                    :disabled="!!dataset.resources?.find(r => r.harvestedDataset)"
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
                    {{ resource.format || $t('formatUnknown') }} |
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
                      <template v-if="resource.harvestedDataset.remoteFile">
                        |
                        <catalog-dataset-auto-update
                          :dataset="resource.harvestedDataset"
                          @change="v => toggleDatasetAutoUpdate(resource.harvestedDataset, v)"
                        />
                      </template>
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
  harvestDataset: Créer un jeu de données de type "métadonnées seules"
  harvestDatasetResource: Créer un jeu de données de type "fichier distant"
  harvestedDataset: jeu de données importé (mis à jour le {updatedAt})
  noneHarvested: jeu de données non importé
  sizeUnknown: taille inconnue
  formatUnknown: format inconnu
  fetchError: Erreur pendant la récupération des jeux de données du catalogue
  importError: Erreur pendant l'import du jeu de données
  autoUpdateError: Erreur pendant la configuration de la mise à jour automatique des données
  overwriteDataset: Souhaitez vous écraser les informations précédement importées ?
  autoUpdate: Activer la mise à jour automatique des métadonnées importées. Attention les informations seront écrasées.
  nextUpdate: Prochaine mise à jour
en:
  datasetsCount: " | 1 dataset in the catalog | {count} datasets in the catalog"
  resource: resource
  harvestDataset: Create a dataset of type "metadata only"
  harvestDatasetResource: Create a dataset of type "remote file"
  harvestedDataset: harvested dataset (updated on {updatedAt})
  noneHarvested: dataset not yet harvested
  sizeUnknown: size unknown
  formatUnknown: unknown format
  fetchError: Error while fetching datasets from the catalog
  importError: Error while importing the dataset
  autoUpdateError: Error while configuring data auto-update
  overwriteDataset: Do you want to overwrite the previously imported information ?
  autoUpdate: Activate automatic update. Warning existing information will be overwritten.
  nextUpdate: Next update
</i18n>

<script>
import eventBus from '~/event-bus'
const { mapState, mapGetters, mapActions } = require('vuex')

export default {
  data: () => ({
    datasets: null,
    loading: false,
    autoUpdateKey: Math.random()
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('catalog', ['catalog']),
    ...mapGetters('catalog', ['catalogType'])
  },
  mounted () {
    this.refresh()
  },
  methods: {
    ...mapActions('catalog', ['patchAndApplyRemoteChange']),
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
    },
    async toggleDatasetAutoUpdate (dataset, active) {
      this.loading = true
      try {
        const remoteFile = { ...dataset.remoteFile }
        for (const key in remoteFile) {
          if (remoteFile[key] === null) delete remoteFile[key]
        }
        remoteFile.autoUpdate = { ...(remoteFile.autoUpdate ?? {}) }
        remoteFile.autoUpdate.active = active
        await this.$axios.$patch(`api/v1/datasets/${dataset.id}`, { remoteFile })
        await this.refresh()
      } catch (error) {
        eventBus.$emit('notification', { error, msg: this.$t('autoUpdateError') })
        this.loading = false
      }
    }
  }
}
</script>
