<template>
  <v-container data-iframe-height>
    <v-row>
      <v-col
        v-if="header && dataset && fetchTotal.data.value"
        :cols="12"
        :sm="6"
      >
        <h2 class="text-headline-small my-4">
          {{ dataset.title }}
        </h2>
        <dataset-nb-results
          :total="fetchTotal.data.value.total"
          :limit="0"
          style="min-width:80px;max-width:80px;"
          class="ml-2"
        />
        <p class="mt-4">
          {{ dataset.summary }}
        </p>
      </v-col>
      <v-col
        v-if="baseUrl && fetchTotal.data.value"
        :cols="12"
        :sm="6"
        class="pa-0"
      >
        <dataset-download-results
          :base-url="baseUrl"
          :total="fetchTotal.data.value.total"
          :selected-cols="select"
        />
      </v-col>
    </v-row>
  </v-container>
</template>

<i18n lang="yaml">
</i18n>

<script setup lang="ts">
import { withQuery } from 'ufo'
import { provideDatasetStore } from '~/composables/dataset/store'

const route = useRoute<'/embed/dataset/[id]/download'>()

const { dataset } = provideDatasetStore(route.params.id, false, false)

const select = useStringsArraySearchParam('select')
const header = useBooleanSearchParam('header')
const filters = useFilters(dataset)
const conceptFilters = useConceptFilters(useReactiveSearchParams())

const baseUrl = computed(() => {
  if (!dataset.value?.schema) return null
  const params = { ...filters.queryParams.value, ...conceptFilters }
  return withQuery($apiPath + `/datasets/${dataset.value.id}/lines`, params)
})

const fetchTotal = useFetch<{ total: number }>(baseUrl, { query: { size: 0 } })
</script>
