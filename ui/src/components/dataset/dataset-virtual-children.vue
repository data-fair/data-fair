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
  <children-action-dialog
    v-model="showOrphansDialog"
    :title="t('orphansTitle')"
    :message="t('orphansMsg')"
    :warning="t('orphansWarning', orphansCount)"
    kind="datasets"
    :loading="patchDataset.loading.value"
    :cancel-label="t('cancel')"
    :confirm-label="t('apply')"
    @confirm="confirmOrphans"
  />
</template>

<i18n lang="yaml">
fr:
  selectDataset: Ajouter un jeu de données source
  orphansTitle: Jeux de données enfants
  orphansMsg: Cette modification retire des jeux de données définis comme enfants de ce jeu virtuel, ils n'existent que dans ce cadre.
  orphansWarning: aucun jeu de données enfant retiré | Un jeu de données enfant est retiré des membres. | {count} jeux de données enfants sont retirés des membres.
  cancel: Annuler
  apply: Appliquer
en:
  selectDataset: Add a source dataset
  orphansTitle: Child datasets
  orphansMsg: This change removes datasets defined as children of this virtual dataset, they only exist within this context.
  orphansWarning: no child dataset removed | A child dataset is removed from the members. | {count} child datasets are removed from the members.
  cancel: Cancel
  apply: Apply
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

const showOrphansDialog = ref(false)
const orphansCount = ref(0)
const pendingChildren = ref<string[] | null>(null)

async function updateChildren (value: ListedDataset | ListedDataset[] | undefined) {
  if (!dataset.value?.virtual) return
  const datasets = Array.isArray(value) ? value : []
  const newChildren = datasets.filter(d => d.id !== dataset.value!.id).map(d => d.id)
  // saving can orphan datasets still defined as partOf children of this virtual dataset: offer
  // the same delete-vs-unflag choice as the deletion flow before persisting
  const partOfChildren = await $fetch<{ results: { id: string }[] }>('datasets', { query: { partOf: dataset.value.id, size: 1000, select: 'id' } })
  const orphans = partOfChildren.results.filter(c => !newChildren.includes(c.id))
  if (orphans.length) {
    orphansCount.value = orphans.length
    pendingChildren.value = newChildren
    showOrphansDialog.value = true
    return
  }
  await patchDataset.execute({
    virtual: { ...dataset.value.virtual, children: newChildren }
  })
}

const confirmOrphans = async (action?: 'delete' | 'unflag') => {
  if (!dataset.value?.virtual || pendingChildren.value === null) return
  await patchDataset.execute({
    virtual: { ...dataset.value.virtual, children: pendingChildren.value }
  }, { childrenAction: action })
  showOrphansDialog.value = false
  pendingChildren.value = null
}
</script>
