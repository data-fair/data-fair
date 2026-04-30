<template>
  <v-autocomplete
    v-model:search="search"
    :model-value="value"
    :label="label || t('selectDataset')"
    :placeholder="t('search')"
    :loading="searchDatasets.loading.value"
    :items="datasets"
    item-title="title"
    item-value="id"
    variant="outlined"
    density="compact"
    max-width="800"
    clearable
    no-filter
    hide-details
    return-object
    :multiple="multiple"
    :chips="multiple"
    :closable-chips="multiple"
    :clear-on-select="multiple"
    @update:model-value="dataset => {value = dataset}"
  >
    <template
      v-if="multiple"
      #chip="{ props: chipProps }"
    >
      <v-chip
        v-bind="chipProps"
        size="small"
      />
    </template>
    <template #item="{ props: itemProps, item }">
      <dataset-list-item
        v-bind="{ ...itemProps, title: undefined }"
        :dataset="(item as any)"
        :show-topics="true"
        :show-owner="shouldShowOwner(item as any)"
        :no-link="true"
      />
    </template>
  </v-autocomplete>
</template>

<i18n lang="yaml">
fr:
  selectDataset: Choisissez un jeu de données
  masterData: Données de référence
  ownerDatasets: Vos jeux de données
  search: Rechercher
en:
  selectDataset: Chose a dataset
  masterData: Master data
  ownerDatasets: Your datasets
  search: Search
</i18n>

<script setup lang="ts">
import type { AccountKeys } from '@data-fair/lib-vue/session'
import type { ListedDataset } from './utils'
import { withQuery } from 'ufo'
import { watchDebounced } from '@vueuse/core'

const { extraParams, masterData, owner: _owner, multiple, excludeIds } = defineProps<{
  label?: string,
  extraParams?: Record<string, any>,
  owner?: AccountKeys | null,
  masterData?: string,
  multiple?: boolean,
  excludeIds?: string[]
}>()

const value = defineModel<ListedDataset | ListedDataset[]>()

const { account } = useSessionAuthenticated()
const { t } = useI18n()

const owner = computed(() => _owner ?? account.value)

const search = ref('')

const datasetSelect = 'id,owner,title,status,topics,isVirtual,isRest,isMetaOnly,file,originalFile,count,finalizedAt,visibility,-userPermissions,-links'

watch(value, (newVal, oldVal) => {
  if (newVal == null && oldVal != null) search.value = ''
})

const selectedIds = computed(() => {
  if (!value.value) return [] as string[]
  return Array.isArray(value.value) ? value.value.map(d => d.id) : [value.value.id]
})

const remoteServicesUrl = computed(() => {
  if (!masterData) return null
  const query: Record<string, any> = {
    size: 1000,
    select: 'id,title,' + masterData,
    privateAccess: `${owner.value.type}:${owner.value.id}`,
    [masterData]: true
  }
  if (search.value) query.q = search.value
  return withQuery(`${$apiPath}/remote-services`, query)
})

const datasetsUrl = computed(() => {
  let ownerFilter = `${owner.value.type}:${owner.value.id}`
  if (owner.value.department) ownerFilter += `:${owner.value.department}`
  // WARNING: order is important here, extraParams can overwrite the owner filter
  const query: Record<string, any> = {
    size: 20,
    select: datasetSelect,
    owner: ownerFilter,
    ...extraParams
  }
  if (search.value) query.q = search.value
  return withQuery(`${$apiPath}/datasets`, query)
})

type Subheader = { type: 'subheader', title: string }
const datasets = ref<(ListedDataset | Subheader)[]>()

const sortSelectedFirst = (list: ListedDataset[]) => {
  if (!multiple) return list
  const ids = selectedIds.value
  return [...list].sort((a, b) => {
    const aSel = ids.includes(a.id) ? 0 : 1
    const bSel = ids.includes(b.id) ? 0 : 1
    return aSel - bSel
  })
}

const filterExcluded = (list: ListedDataset[]) => {
  if (!excludeIds?.length) return list
  return list.filter(d => !excludeIds.includes(d.id))
}

const searchDatasets = useAsyncAction(async () => {
  let items: (ListedDataset | Subheader)[] = []
  let refDatasets: ListedDataset[] = []
  if (!multiple && value.value && !Array.isArray(value.value)) items.push(value.value)
  if (remoteServicesUrl.value && masterData) {
    const remoteServicesRes = await $fetch(remoteServicesUrl.value)
    const refDatasetsRefs = remoteServicesRes.results.map((r: any) => r[masterData].parent || r[masterData].dataset)
    const refIds = refDatasetsRefs.map((r: any) => r?.id).filter(Boolean)
    if (refIds.length) {
      const refQuery: Record<string, any> = {
        size: 20,
        select: datasetSelect,
        id: refIds.join(','),
        queryable: true
      }
      if (search.value) refQuery.q = search.value
      const refRes = await $fetch<{ results: ListedDataset[] }>(withQuery(`${$apiPath}/datasets`, refQuery))
      refDatasets = refRes.results
    }
    if (refDatasets.length) {
      items.push({ type: 'subheader', title: t('masterData') })
      items = items.concat(sortSelectedFirst(filterExcluded(refDatasets)))
    }
  }

  const res = await $fetch<{ results: ListedDataset[] }>(datasetsUrl.value)

  const ownerDatasets = res.results.filter(d => !refDatasets.find(rd => rd.id === d.id))

  if (items.length && ownerDatasets.length) items.push({ type: 'subheader', title: t('ownerDatasets') })
  items = items.concat(sortSelectedFirst(filterExcluded(ownerDatasets)))

  datasets.value = items
})

const shouldShowOwner = (item: ListedDataset) => {
  if (!item?.owner || !owner.value) return false
  return item.owner.type !== owner.value.type ||
    item.owner.id !== owner.value.id ||
    (item.owner.department || null) !== (owner.value.department || null)
}

watchDebounced(
  [remoteServicesUrl, datasetsUrl, () => excludeIds],
  () => searchDatasets.execute(),
  { immediate: true, debounce: 250 }
)
</script>
