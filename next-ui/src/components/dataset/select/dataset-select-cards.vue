<template>
  <v-container>
    <v-row>
      <v-col
        cols="12"
        sm="6"
        md="9"
      >
        <v-text-field
          v-model="editSearch"
          :loading="fetchDatasets.loading.value"
          :label="label || t('selectDataset')"
          :placeholder="t('search')"
          :append-inner-icon="mdiMagnify"
          return-object
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 600px"
          clearable
          @keyup.enter="search = editSearch"
          @click:append-inner="search = editSearch"
          @click:clear="search = ''"
        />
      </v-col>
      <v-col
        cols="12"
        sm="6"
        md="3"
      >
        <v-select
          v-model="sort"
          :label="t('sortBy')"
          :items="sorts"
          variant="outlined"
          density="compact"
          hide-details
        />
      </v-col>
    </v-row>
    <v-row>
      <v-col
        v-for="dataset of datasets"
        :key="dataset.id"
        cols="12"
        md="6"
        lg="4"
      >
        <dataset-card
          :dataset="dataset"
          @click="value = dataset"
        />
      </v-col>
    </v-row>

    <v-row
      v-if="datasets.length"
      v-intersect:quiet="(intersect: boolean) => intersect && !fetchDatasets.loading.value && next && fetchDatasets.execute()"
      align="center"
      class="my-0"
    >
    &nbsp;
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
fr:
  selectDataset: Choisissez un jeu de données
  search: Rechercher
  sortBy: trier par
  sortDataUpdatedAtAsc: données plus ancienne
  sortDataUpdatedAtDesc: données plus récente
  sortTitleAsc: ordre alphabétique
  sortTitleDesc: ordre alphabétique inversé
en:
  selectDataset: Chose a dataset
  search: Search
  sortBy: sort by
  childDataset: Aggregated dataset
  sortDataUpdatedAtAsc: data older
  sortDataUpdatedAtDesc: data newer
  sortTitleAsc: alphabetic order
  sortTitleDesc: reverse alphabetic order
</i18n>

<script lang="ts" setup>
import { type AccountKeys } from '@data-fair/lib-vue/session'
import { withQuery } from 'ufo'
import { type ListedDataset, datasetListSelect } from './utils'
import { mdiMagnify } from '@mdi/js'

const { extraParams, owner: _owner } = defineProps({
  label: { type: String, default: '' },
  extraParams: { type: Object, default: () => ({}) },
  owner: { type: Object as () => AccountKeys | null, default: null },
  masterData: { type: String, default: null }
})

const value = defineModel({ type: Object as () => ListedDataset })

const { account } = useSessionAuthenticated()
const { t } = useI18n()

const owner = computed(() => _owner ?? account.value)

const editSearch = ref('')
const search = ref('')

const sorts = [
  { value: 'dataUpdatedAt:-1', title: t('sortDataUpdatedAtDesc') },
  { value: 'dataUpdatedAt:1', title: t('sortDataUpdatedAtAsc') },
  { value: 'title:1', title: t('sortTitleAsc') },
  { value: 'title:-1', title: t('sortTitleDesc') },
]
const sort = ref('dataUpdatedAt:-1')

const datasetsUrl = computed(() => {
  let ownerFilter = `${owner.value.type}:${owner.value.id}`
  if (owner.value.department) ownerFilter += `:${owner.value.department}`
  // WARNING: order is important here, extraParams can overwrite the owner filter
  const query: Record<string, any> = {
    size: 20,
    select: datasetListSelect,
    owner: ownerFilter,
    sort: sort.value,
    ...extraParams
  }
  if (search.value) query.q = search.value
  return withQuery(`${$apiPath}/datasets`, query)
})

const datasets = ref<ListedDataset[]>([])
const page = ref(1)
const total = ref<number>()
const next = computed(() => {
  if (total.value !== undefined && datasets.value.length >= total.value) return null
  return withQuery(datasetsUrl.value, { page: page.value })
})

const fetchDatasets = useAsyncAction(async (reset: boolean = false) => {
  if (reset) {
    page.value = 1
    total.value = undefined
  }
  if (!next.value) return
  const { results, count } = await $fetch<{ results: ListedDataset[], count: number }>(next.value)
  total.value = count
  page.value += 1
  if (reset) datasets.value = results
  else datasets.value.push(...results)
})

watch(datasetsUrl, () => {
  fetchDatasets.execute(true)
}, { immediate: true })
</script>

<style>

</style>
