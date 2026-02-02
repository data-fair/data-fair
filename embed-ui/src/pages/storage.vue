<template lang="html">
  <v-container>
    <v-row>
      <v-col>
        <h2 class="mb-2">
          {{ t('statistics') }}
        </h2>
        <v-sheet :loading="!stats">
          <v-data-table
            :loading="statsFetch.loading.value"
            :loading-text="t('loading')"
            :headers="headers"
            :items="stats ? [stats] : []"
            hide-default-footer
          >
            <template #item="{item}">
              <tr>
                <td>
                  {{ item.limits.nb_datasets.consumption.toLocaleString() }}
                  <template v-if="item.limits.nb_datasets.limit !== -1">
                    / {{ item.limits.nb_datasets.limit.toLocaleString() }} {{ t('allowed') }}
                  </template>
                </td>
                <td>
                  {{ formatBytes(item.limits.indexed_bytes.consumption, locale) }}
                  <template v-if="item.limits.indexed_bytes.limit !== -1">
                    / {{ formatBytes(item.limits.indexed_bytes.limit, $i18n.locale) }} {{ t('allowed') }}
                  </template>
                </td>
                <td>
                  {{ formatBytes(item.limits.store_bytes.consumption, $i18n.locale) }}
                  <template v-if="item.limits.store_bytes.limit !== -1">
                    / {{ formatBytes(item.limits.store_bytes.limit, $i18n.locale) }} {{ t('allowed') }}
                  </template>
                </td>
                <td>{{ item.applications.toLocaleString() }}</td>
              </tr>
            </template>
          </v-data-table>
        </v-sheet>

        <h2 class="my-3">
          {{ t('details') }}
        </h2>

        <v-select
          v-model="storageType"
          :items="[{value: 'indexed', title: t('indexedBytes')}, {value: 'stored', title: t('storedBytes')}]"
          style="max-width: 300px"
          :label="t('storageType')"
          variant="outlined"
          hide-details
          density="compact"
        />

        <storage-treemap
          v-if="stats && datasets"
          :stats="stats"
          :datasets="{count: datasets.count, results: datasets.results.slice(0, 15)}"
          :storage-type="storageType"
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

<script lang="ts" setup>
import type { Dataset } from '#api/types'
import type { DataTableHeader } from 'vuetify'

const storageType = ref('indexed')

const { account } = useSessionAuthenticated()
const { t, locale } = useI18n()

const datasetsQuery = computed(() => ({
  size: 10000,
  owner: `${account.value.type}:${account.value.id}`,
  select: 'id,title,storage,-userPermissions,-links',
  sort: storageType.value === 'indexed' ? 'storage.indexed.size:-1' : 'storage.size:-1'
}))
const datasetsFetch = useFetch<{ results: Dataset[], count: number }>($apiPath + '/datasets', { query: datasetsQuery })
const datasets = computed(() => datasetsFetch.data.value)
const statsFetch = useFetch<any>($apiPath + '/stats')
const stats = computed(() => statsFetch.data.value)

const headers = computed<DataTableHeader[]>(() => ([
  { title: t('nbDatasets'), value: 'datasets', sortable: false },
  { title: t('indexedBytes'), value: 'indexedBytes', sortable: false },
  { title: t('storedBytes'), value: 'storedBytes', sortable: false },
  { title: t('nbApplications'), value: 'applications', sortable: false }
]))

</script>

<style lang="css">
</style>
