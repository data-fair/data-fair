<template>
  <v-row>
    <v-col>
      <v-autocomplete
        v-model:search="search"
        :model-value="value"
        :items="datasetsFetch.data.value?.results"
        :loading="datasetsFetch.loading.value"
        multiple
        no-filter
        item-title="title"
        item-value="id"
        :label="t('selectDataset')"
        :placeholder="t('search')"
        return-object
        variant="outlined"
        density="compact"
        hide-details
        style="max-width: 600px"
        clearable
        @update:model-value="datasets => {value = datasets.map(d => ({ id: d.id, title: d.title }))}"
      />
    </v-col>
  </v-row>
  <v-row v-if="completedDatasetsUrl && completedDatasetsFetch.data.value">
    <v-col
      v-for="dataset of completedDatasetsFetch.data.value.results"
      :key="dataset.id"
      cols="12"
      md="6"
      lg="4"
    >
      <dataset-card :dataset="dataset" />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  selectDataset: Choisissez un jeu de données
  lines: "aucune ligne | 1 ligne | {count} lignes"
  error: En erreur
  masterData: Données de référence
  ownerDatasets: Vos jeux de données
en:
  selectDataset: Chose a dataset
  lines: "no line | 1 line | {count} lines"
  error: Error status
  masterData: Master data
  ownerDatasets: Your datasets
</i18n>

<script lang="ts" setup>
import { withQuery } from 'ufo'
import { datasetListSelect, type ListedDataset } from './select/utils'

const value = defineModel({ type: Object as () => { id: string, title: string }[] })

const { t } = useI18n()

const datasetStore = useDatasetStore()

const search = ref('')

const datasetsQueryParams = computed(() => {
  const dataset = datasetStore.dataset.value
  if (!dataset) return
  let ownerFilter = `${dataset.owner.type}:${dataset.owner.id}`
  if (dataset.owner.department) ownerFilter += `:${dataset.owner.department}`
  // WARNING: order is important here, extraParams can overwrite the owner filter
  const query: Record<string, any> = {
    size: 20,
    select: datasetListSelect,
    owner: ownerFilter
  }
  return query
})
const datasetsUrl = computed(() => {
  const query = { ...datasetsQueryParams.value }
  if (search.value) query.q = search.value
  return withQuery(`${$apiPath}/datasets`, query)
})

const datasetsFetch = useFetch<{ results: { id: string, title: string }[] }>(datasetsUrl)

const completedDatasetsUrl = computed(() => {
  const query = { ...datasetsQueryParams.value }
  if (!value.value?.length) return null
  query.id = value.value.map(d => d.id).join(',')
  return withQuery(`${$apiPath}/datasets`, query)
})
const completedDatasetsFetch = useFetch<{ results: ListedDataset[] }>(completedDatasetsUrl)

</script>

<style>

</style>
