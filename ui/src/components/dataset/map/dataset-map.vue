<template>
  <div style="position: relative">
    <v-text-field
      v-if="search && !noInteraction"
      v-model="editQ"
      :label="t('search')"
      style="position:absolute;z-index:2;"
      variant="outlined"
      color="primary"
      bg-color="surface"
      density="compact"
      width="250"
      class="ma-2"
      hide-details
      single-line
      clearable
      @keyup.enter="q = editQ"
      @click:clear="q = ''"
    >
      <template #append-inner>
        <v-btn
          :icon="mdiMagnify"
          :title="t('searchSubmit')"
          density="comfortable"
          size="small"
          variant="text"
          @click="q = editQ"
        />
      </template>
    </v-text-field>
    <div
      id="map"
      :style="'height:' + height + 'px'"
    />
  </div>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  searchSubmit: Lancer la recherche
  noGeoData: Aucune donnée géographique valide.
  noData: Aucune donnée à afficher
  mapError: "Erreur pendant le rendu de la carte :"
en:
  search: Search
  searchSubmit: Submit search
  noGeoData: No valid geo data
  noData: No data to display
  mapError: "Error while rendering the map:"
</i18n>

<script setup lang="ts">
import { mdiMagnify } from '@mdi/js'
import 'maplibre-gl/dist/maplibre-gl.css'
import { withQuery } from 'ufo'
import { useMap } from './use-map'
import { type ControlPosition } from 'maplibre-gl'

const { t } = useI18n()
const { search, height, selectable, navigationPosition, noInteraction, sampling, cols } = defineProps({
  search: { type: Boolean, default: true },
  height: { type: Number, required: true },
  navigationPosition: { type: String as () => ControlPosition, default: 'top-right' },
  noInteraction: { type: Boolean, default: false },
  selectable: { type: Boolean, default: false },
  sampling: { type: String, default: null },
  cols: { type: Array as () => string[], default: () => [] }
})

const { id, dataset } = useDatasetStore()
const { queryParams: filtersQueryParams } = useFilters(dataset, { excludeKeys: ['_id_eq'] })
const conceptFilters = useConceptFilters(useReactiveSearchParams())

const q = defineModel<string>('q', { default: '' })
const selectedItem = defineModel<string>('selectedItem', { default: '' })
const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })

const commonParams = computed(() => {
  const params = { ...filtersQueryParams.value, ...conceptFilters }
  if (q.value) params.q = q.value
  if (dataset.value?.draftReason) params.draft = 'true'
  if (dataset.value?.finalizedAt) params.finalizedAt = dataset.value.finalizedAt
  return params
})

const tileUrl = computed(() => {
  if (!dataset.value) return undefined
  const params: Record<string, string> = { format: 'pbf', ...commonParams.value }
  if (dataset.value.schema?.find(p => p.key === '_id')) params.select = '_id'
  if (sampling) params.sampling = sampling
  let url = withQuery($siteUrl + `/data-fair/api/v1/datasets/${id}/lines`, params)
  url += '&xyz={x},{y},{z}'
  return url
})

const fetchBBOX = useFetch<{ bbox: [number, number, number, number] }>(`${$apiPath}/datasets/${id}/lines`, {
  query: computed(() => {
    const query: Record<string, string> = { format: 'geojson', size: '0', ...commonParams.value }
    if (selectedItem.value) query._id_eq = selectedItem.value
    return query
  })
})

useMap(tileUrl, selectable, selectedItem, noInteraction, cols, navigationPosition, computed(() => fetchBBOX.data.value?.bbox))

</script>

<style lang="css">
.maplibregl-popup-close-button {
  width: 24px;
}
.maplibregl-popup-content {
  max-height: 300px;
  overflow-y: scroll;
  color: rgba(0, 0, 0, 0.87);
}
</style>
