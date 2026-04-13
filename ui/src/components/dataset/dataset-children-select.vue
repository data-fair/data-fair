<template>
  <v-autocomplete
    v-model="internalModel"
    v-model:search="search"
    :label="t('children')"
    :placeholder="t('search')"
    :loading="searchAction.loading.value"
    :items="items"
    item-title="title"
    item-value="id"
    class="mt-4"
    variant="outlined"
    density="compact"
    max-width="500"
    no-filter
    hide-no-data
    return-object
    hide-details
    multiple
    chips
    closable-chips
    clear-on-select
  >
    <template #chip="{ props: chipProps }">
      <v-chip
        v-bind="chipProps"
        size="small"
      />
    </template>
    <template #item="{ internalItem, props: itemProps }">
      <v-list-item v-bind="itemProps">
        <template #append>
          <v-chip
            v-if="internalItem.raw.owner && showOwner(internalItem.raw)"
            size="x-small"
            variant="tonal"
            class="ml-2"
          >
            {{ internalItem.raw.owner.name || internalItem.raw.owner.id }}
          </v-chip>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>
</template>

<script setup lang="ts">
import { withQuery } from 'ufo'

export interface VirtualChild {
  id: string
  title: string
}

const props = defineProps<{
  modelValue: VirtualChild[]
}>()

const emit = defineEmits<{
  'update:modelValue': [value: VirtualChild[]]
}>()

const { t } = useI18n()
const { account } = useSessionAuthenticated()

const search = ref('')
const ownerDatasets = ref<any[]>([])
const refDatasets = ref<any[]>([])

const internalModel = computed({
  get: () => props.modelValue,
  set: (val: any[]) => {
    emit('update:modelValue', val.map(d => ({ id: d.id, title: d.title })))
  }
})

const select = 'id,owner,title,schema,status,attachmentsAsImage'

const searchAction = useAsyncAction(async () => {
  if (!account.value) return

  // Query remote-services for master data datasets
  const remoteServicesRes = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/remote-services`, {
    q: search.value,
    size: 1000,
    select: 'id,title,virtualDatasets',
    privateAccess: `${account.value.type}:${account.value.id}`,
    virtualDatasets: true
  }))

  if (remoteServicesRes.results.length) {
    const parentIds = remoteServicesRes.results.map(r => r.virtualDatasets?.parent?.id).filter(Boolean)
    if (parentIds.length) {
      const refDatasetsRes = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/datasets`, {
        q: search.value,
        size: 20,
        select,
        id: parentIds.join(','),
        queryable: true
      }))
      refDatasets.value = refDatasetsRes.results
    } else {
      refDatasets.value = []
    }
  } else {
    refDatasets.value = []
  }

  // Query owner's datasets
  const datasetsRes = await $fetch<{ results: any[] }>(withQuery(`${$apiPath}/datasets`, {
    q: search.value,
    size: 20,
    select,
    owner: `${account.value.type}:${account.value.id}`,
    queryable: true
  }))
  ownerDatasets.value = datasetsRes.results
})

watch(search, () => searchAction.execute(), { immediate: true })

const items = computed(() => {
  const selected = props.modelValue
  const result: any[] = []

  if (refDatasets.value.length) {
    result.push({ type: 'subheader', title: t('masterData') })
    result.push(...refDatasets.value.filter(d => selected.some(c => c.id === d.id)))
    result.push(...refDatasets.value.filter(d => !selected.some(c => c.id === d.id)))
  }
  if (refDatasets.value.length && ownerDatasets.value.length) {
    result.push({ type: 'subheader', title: t('ownerDatasets') })
  }
  result.push(...ownerDatasets.value.filter(d => selected.some(c => c.id === d.id)))
  result.push(...ownerDatasets.value.filter(d => !selected.some(c => c.id === d.id)))

  return result
})

function showOwner (dataset: any) {
  if (!account.value || !dataset.owner) return false
  return dataset.owner.type !== account.value.type ||
    dataset.owner.id !== account.value.id ||
    (dataset.owner.department || null) !== (account.value.department || null)
}
</script>

<i18n lang="yaml">
fr:
  children: Jeux enfants
  search: Rechercher
  masterData: Données de référence
  ownerDatasets: Vos jeux de données
en:
  children: Children datasets
  search: Search
  masterData: Master data
  ownerDatasets: Your datasets
</i18n>
