<template>
  <v-row v-if="dataset">
    <v-col>
      <dataset-select
        :model-value="selectedChildren"
        multiple
        :owner="dataset.owner"
        :extra-params="{ queryable: true }"
        :label="t('selectDataset')"
        @update:model-value="updateChildren"
      />
    </v-col>
  </v-row>
  <v-row v-if="childrenDatasets.length">
    <v-col
      v-for="child of childrenDatasets"
      :key="child.id"
      cols="12"
      md="6"
      lg="4"
    >
      <dataset-card :dataset="child" />
    </v-col>
  </v-row>
</template>

<i18n lang="yaml">
fr:
  selectDataset: Ajouter un jeu de données source
en:
  selectDataset: Add a source dataset
</i18n>

<script setup lang="ts">
import { withQuery } from 'ufo'
import { datasetListSelect, type ListedDataset } from './select/utils'

const { t } = useI18n()
const { dataset, patchDataset } = useDatasetStore()

const selectedChildren = computed<ListedDataset[]>(() => {
  const children = dataset.value?.virtual?.children ?? []
  return children.map((id: string) => {
    const found = childrenDatasets.value.find(d => d.id === id)
    return found ?? ({ id, title: id } as unknown as ListedDataset)
  })
})

const childrenUrl = computed(() => {
  const children = dataset.value?.virtual?.children
  if (!children?.length) return null
  return withQuery(`${$apiPath}/datasets`, {
    size: 1000,
    select: datasetListSelect,
    id: children.join(',')
  })
})
const childrenFetch = useFetch<{ results: ListedDataset[] }>(childrenUrl)
const childrenDatasets = computed(() => childrenFetch.data.value?.results ?? [])

async function updateChildren (value: ListedDataset | ListedDataset[] | undefined) {
  if (!dataset.value?.virtual) return
  const datasets = Array.isArray(value) ? value : []
  const newChildren = datasets.filter(d => d.id !== dataset.value!.id).map(d => d.id)
  await patchDataset.execute({
    virtual: { ...dataset.value.virtual, children: newChildren }
  })
}
</script>
