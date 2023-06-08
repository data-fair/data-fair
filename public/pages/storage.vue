<template lang="html">
  <v-container v-if="initialized">
    <v-row>
      <v-col>
        <template v-if="authorized">
          <h2 class="mb-2">
            {{ $t('statistics') }}
          </h2>
          <v-sheet :loading="!stats">
            <v-data-table
              :loading="!stats"
              :loading-text="$t('loading')"
              :headers="headers"
              :items="stats ? [stats] : []"
              hide-default-footer
            >
              <template #item="{item}">
                <tr>
                  <td>
                    {{ item.limits.nb_datasets.consumption.toLocaleString() }}
                    <template v-if="item.limits.nb_datasets.limit !== -1">
                      / {{ item.limits.nb_datasets.limit.toLocaleString() }} {{ $t('allowed') }}
                    </template>
                  </td>
                  <td>
                    {{ item.limits.indexed_bytes.consumption | bytes($i18n.locale) }}
                    <template v-if="item.limits.indexed_bytes.limit !== -1">
                      / {{ item.limits.indexed_bytes.limit | bytes($i18n.locale) }} {{ $t('allowed') }}
                    </template>
                  </td>
                  <td>
                    {{ item.limits.store_bytes.consumption | bytes($i18n.locale) }}
                    <template v-if="item.limits.store_bytes.limit !== -1">
                      / {{ item.limits.store_bytes.limit | bytes($i18n.locale) }} {{ $t('allowed') }}
                    </template>
                  </td>
                  <td>{{ item.applications.toLocaleString() }}</td>
                </tr>
              </template>
            </v-data-table>
          </v-sheet>

          <h2 class="my-3">
            {{ $t('details') }}
          </h2>

          <v-select
            v-model="storageType"
            :items="[{value: 'indexed', text: $t('indexedBytes')}, {value: 'stored', text: $t('storedBytes')}]"
            style="max-width: 300px"
            :label="$t('storageType')"
            outlined
            hide-details
            dense
            @change="fetchDatasets"
          />

          <storage-treemap
            v-if="stats && datasets"
            :stats="stats"
            :datasets="{count: datasets.count, results: datasets.results.slice(0, 15)}"
            :storage-mode="storageType"
            class="mt-2"
          />

          <storage-details
            v-if="datasets"
            :datasets="datasets.results"
          />
          <v-progress-linear
            v-else
            :height="2"
            indeterminate
          />
        </template>

        <layout-not-authorized v-else />
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  nbDatasets: Nombre de jeux de données
  storedBytes: Données stockées
  indexedBytes: Données indexées
  nbApplications: Nombre d'applications
  statistics: Statistiques
  details: Détail par jeu de données
  loading: Chargement en cours...
  allowed: autorisés
  storageType: Trier par catégorie de stockage
en:
  nbDatasets: Number of datasets
  storedBytes: Stored data
  indexedBytes: Indexed data
  nbApplications: Number of applications
  statistics: Statistics
  details: Details per dataset
  loading: Loading...
  allowed: allowed
  storageType: Sort by storage type
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'

export default {
  middleware: ['auth-required'],
  data: () => ({
    datasets: null,
    stats: null,
    storageType: 'indexed'
  }),
  computed: {
    ...mapState(['env']),
    ...mapState('session', ['user', 'initialized']),
    ...mapGetters('session', ['activeAccount']),
    authorized () {
      return !!this.user
    },
    headers () {
      return [
        { text: this.$t('nbDatasets'), value: 'datasets', sortable: false },
        { text: this.$t('indexedBytes'), value: 'indexedBytes', sortable: false },
        { text: this.$t('storedBytes'), value: 'storedBytes', sortable: false },
        { text: this.$t('nbApplications'), value: 'applications', sortable: false }
      ]
    }
  },
  async created () {
    if (!this.authorized) return
    await this.fetchDatasets()
    this.stats = await this.$axios.$get('api/v1/stats')
  },
  methods: {
    async fetchDatasets () {
      this.datasets = (await this.$axios.$get('api/v1/datasets', {
        params: {
          size: 10000,
          owner: `${this.activeAccount.type}:${this.activeAccount.id}`,
          select: 'id,title,storage',
          raw: true,
          sort: this.storageType === 'indexed' ? 'storage.indexed.size:-1' : 'storage.size:-1'
        }
      }))
    }
  }
}
</script>

<style lang="css">
</style>
