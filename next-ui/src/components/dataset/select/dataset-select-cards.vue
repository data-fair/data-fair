<template>
  <v-container>
    <v-row>
      <v-col>
        <v-text-field
          v-model="search"
          :loading="fetchDatasets.loading.value"
          :label="label || t('selectDataset')"
          :placeholder="t('search')"
          return-object
          variant="outlined"
          density="compact"
          hide-details
          style="max-width: 600px"
          clearable
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
en:
  selectDataset: Chose a dataset
  search: Search
</i18n>

<script lang="ts" setup>
import { type AccountKeys } from '@data-fair/lib-vue/session'
import { withQuery } from 'ufo'
import { type ListedDataset, datasetListSelect } from './utils'

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

const search = ref('')

const datasetsUrl = computed(() => {
  let ownerFilter = `${owner.value.type}:${owner.value.id}`
  if (owner.value.department) ownerFilter += `:${owner.value.department}`
  // WARNING: order is important here, extraParams can overwrite the owner filter
  const query: Record<string, any> = {
    size: 20,
    select: datasetListSelect,
    owner: ownerFilter,
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
