<template>
  <v-row v-if="dataset">
    <v-col>
      <v-autocomplete
        v-model:search="search"
        :model-value="selectedChildren"
        :items="searchResults"
        :loading="searchAction.loading.value"
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
        max-width="600"
        chips
        closable-chips
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
  search: Rechercher
en:
  selectDataset: Add a source dataset
  search: Search
</i18n>

<script setup lang="ts">
import { withQuery } from 'ufo'
import { datasetListSelect, type ListedDataset } from './select/utils'

const { t } = useI18n()
const { dataset, patchDataset } = useDatasetStore()

const search = ref('')

// Fetch search results for autocomplete
const searchResults = ref<{ id: string, title: string }[]>([])
const searchAction = useAsyncAction(async () => {
  if (!dataset.value) return
  const owner = dataset.value.owner
  const ownerFilter = `${owner.type}:${owner.id}${owner.department ? ':' + owner.department : ''}`

  const res = await $fetch<{ results: { id: string, title: string }[] }>(withQuery(`${$apiPath}/datasets`, {
    q: search.value || undefined,
    size: 20,
    select: 'id,title',
    owner: ownerFilter,
    queryable: true
  }))
  searchResults.value = res.results.filter(d => d.id !== dataset.value!.id)
})

watch(search, () => searchAction.execute(), { immediate: true })

// Selected children as objects for autocomplete v-model
const selectedChildren = computed(() => {
  const children = dataset.value?.virtual?.children ?? []
  return children.map((id: string) => {
    const found = childrenDatasets.value.find(d => d.id === id)
    return found ? { id: found.id, title: found.title } : { id, title: id }
  })
})

// Fetch full dataset info for children cards
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

// Update children via patchDataset
async function updateChildren (datasets: { id: string, title: string }[]) {
  if (!dataset.value?.virtual) return
  const newChildren = datasets.map(d => d.id)
  await patchDataset.execute({
    virtual: { ...dataset.value.virtual, children: newChildren }
  })
}
</script>
