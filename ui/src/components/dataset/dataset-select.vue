<template>
  <v-autocomplete
    v-model="model"
    :items="datasets"
    :loading="loading"
    item-title="title"
    item-value="id"
    :label="label || t('selectDataset')"
    :placeholder="t('search')"
    return-object
    variant="outlined"
    density="compact"
    hide-details
    clearable
    no-filter
    max-width="600px"
    @update:search="onSearch"
  />
</template>

<i18n lang="yaml">
fr:
  selectDataset: Choisissez un jeu de données
  search: Rechercher...
en:
  selectDataset: Chose a dataset
  search: Search...
</i18n>

<script setup lang="ts">
import { $fetch } from '~/context'

const props = withDefaults(defineProps<{
  owner?: { type: string, id: string, department?: string } | null
  label?: string
  extraParams?: Record<string, any>
}>(), {
  owner: null,
  label: '',
  extraParams: () => ({})
})

const model = defineModel<Record<string, any> | null>({ default: null })

const { t } = useI18n()
const { account } = useSession()

const effectiveOwner = computed(() => props.owner || account.value)

const loading = ref(false)
const datasets = ref<Record<string, any>[]>([])
const searchText = ref('')

let searchTimeout: ReturnType<typeof setTimeout> | null = null

function onSearch (val: string) {
  searchText.value = val ?? ''
  if (searchTimeout) clearTimeout(searchTimeout)
  searchTimeout = setTimeout(() => {
    searchDatasets()
  }, 300)
}

async function searchDatasets () {
  const owner = effectiveOwner.value
  if (!owner) return
  loading.value = true
  try {
    let ownerFilter = `${owner.type}:${owner.id}`
    if (owner.department) ownerFilter += `:${owner.department}`
    const res = await $fetch<{ results: Record<string, any>[] }>('datasets', {
      params: {
        q: searchText.value,
        size: 20,
        select: 'id,title,slug,publicationSites,requestedPublicationSites',
        owner: ownerFilter,
        ...props.extraParams
      }
    })
    datasets.value = res.results
  } finally {
    loading.value = false
  }
}

watch(effectiveOwner, () => searchDatasets())

onMounted(() => searchDatasets())
</script>
