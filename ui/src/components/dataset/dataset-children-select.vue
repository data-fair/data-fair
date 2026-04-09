<template>
  <v-autocomplete
    v-model:search="search"
    :model-value="null"
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
    @update:model-value="addChild"
  >
    <template #item="{ item, props: itemProps }">
      <v-list-subheader v-if="item.raw._header">
        {{ item.raw._header }}
      </v-list-subheader>
      <v-list-item
        v-else
        v-bind="itemProps"
      >
        <template #append>
          <v-chip
            v-if="item.raw.owner && showOwner(item.raw)"
            size="x-small"
            variant="tonal"
            class="ml-2"
          >
            {{ item.raw.owner.name || item.raw.owner.id }}
          </v-chip>
        </template>
      </v-list-item>
    </template>
  </v-autocomplete>

  <!-- Selected children chips -->
  <div
    v-if="modelValue.length"
    class="d-flex flex-wrap ga-1 mt-2"
  >
    <v-chip
      v-for="(child, i) in modelValue"
      :key="child.id"
      size="small"
      closable
      @click:close="removeChild(i)"
    >
      {{ child.title }}
    </v-chip>
  </div>
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

watch(search, () => searchAction.execute())

const items = computed(() => {
  const selected = props.modelValue
  const result: any[] = []

  const filteredRef = refDatasets.value.filter(d => !selected.find(c => c.id === d.id))
  const filteredOwner = ownerDatasets.value.filter(d => !selected.find(c => c.id === d.id))

  if (filteredRef.length) {
    result.push({ _header: t('masterData'), id: '_header_master', title: t('masterData') })
    result.push(...filteredRef)
  }
  if (filteredRef.length && filteredOwner.length) {
    result.push({ _header: t('ownerDatasets'), id: '_header_owner', title: t('ownerDatasets') })
  }
  result.push(...filteredOwner)

  return result
})

function showOwner (dataset: any) {
  if (!account.value || !dataset.owner) return false
  return dataset.owner.type !== account.value.type ||
    dataset.owner.id !== account.value.id ||
    (dataset.owner.department || null) !== (account.value.department || null)
}

function addChild (dataset: any) {
  if (!dataset?.id || dataset._header) return
  emit('update:modelValue', [...props.modelValue, { id: dataset.id, title: dataset.title }])
  search.value = ''
}

function removeChild (index: number) {
  const updated = [...props.modelValue]
  updated.splice(index, 1)
  emit('update:modelValue', updated)
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
