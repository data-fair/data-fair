<template>
  <v-autocomplete
    v-model:search-input="search"
    :model-value="value"
    :items="datasets"
    :loading="searchDatasets.loading.value"
    no-filter
    item-title="title"
    item-value="id"
    :label="label || $t('selectDataset')"
    :placeholder="$t('search')"
    return-object
    variant="outlined"
    density="compact"
    hide-details
    style="max-width: 600px"
    clearable
    @update:model-value="dataset => {value = dataset}"
  >
    <template #item="{item}">
      <dataset-list-item
        :dataset="item"
        :dense="true"
        :show-topics="true"
        :no-link="true"
      />
    </template>
  </v-autocomplete>
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
import { type Dataset } from '#api/types'
import { type AccountKeys } from '@data-fair/lib-vue/session'
import { withQuery } from 'ufo'

const { extraParams, masterData, owner: _owner } = defineProps({
  label: { type: String, default: '' },
  extraParams: { type: Object, default: () => ({}) },
  owner: { type: Object as () => AccountKeys | null, default: null },
  masterData: { type: String, default: null }
})

const value = defineModel({ type: Object as () => Dataset })

const { account } = useSessionAuthenticated()
const { t } = useI18n()

const owner = computed(() => _owner ?? account.value)

const search = ref('')

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
    select: 'id,title,status,topics,isVirtual,isRest,isMetaOnly,file,remoteFile,originalFile,count,finalizedAt,-userPermissions,-links,-owner',
    owner: ownerFilter,
    ...extraParams
  }
  if (search.value) query.q = search.value
  return withQuery(`${$apiPath}/datasets`, query)
})

const datasets = ref<(Dataset | { header: string })[]>()

const searchDatasets = useAsyncAction(async () => {
  let items: (Dataset | { header: string })[] = []
  let refDatasets: Dataset[]
  if (value.value) items.push(value.value)
  if (remoteServicesUrl.value) {
    const remoteServicesRes = await $fetch(remoteServicesUrl.value)
    refDatasets = remoteServicesRes.results.map((r: any) => r[masterData].parent || r[masterData].dataset)
    if (refDatasets.length) {
      items.push({ header: t('masterData') })
      items = items.concat(refDatasets)
    }
  }

  const res = await $fetch<{ results: Dataset[] }>(datasetsUrl.value)

  const ownerDatasets = res.results.filter(d => !refDatasets.find(rd => rd.id === d.id))

  if (items.length && ownerDatasets.length) {
    items.push({ header: t('ownerDatasets') })
  }
  items = items.concat(ownerDatasets)

  datasets.value = items
})

watch(remoteServicesUrl, () => searchDatasets.execute())
watch(datasetsUrl, () => searchDatasets.execute())
</script>

<style>

</style>
