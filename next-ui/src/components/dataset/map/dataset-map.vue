<template lang="html">
  <v-card>
    <v-text-field
      v-model="editQ"
      style="position: absolute;z-index:2;width:250px;"
      placeholder="Rechercher"
      :append-inner-icon="mdiMagnify"
      variant="solo"
      color="primary"
      bg-color="white"
      hide-details
      clearable
      density="compact"
      class="ma-2"
      @keyup.enter="q = editQ"
      @click:append-inner="q = editQ"
      @click:clear="q = ''"
    />
    <div
      id="map"
      :style="'height:' + height + 'px'"
    />
  </v-card>
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  noSession: Pas de session active. Cette erreur peut subvenir si vous utilisez une extension qui bloque les cookies. Les cookies de session sont utilisés par ce service pour protéger notre infrastructure contre les abus.
  noGeoData: Aucune donnée géographique valide.
  noData: Aucune donnée à afficher
  mapError: "Erreur pendant le rendu de la carte :"
en:
  search: Search
  noSession: No active session. This error can happen if you use an extension that blocks cookies. Session cookies are used by this service to protect the infrastructure from abuse.
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

const { height, singleItem, navigationPosition, noInteraction, sampling } = defineProps({
  height: { type: Number, required: true },
  singleItem: { type: String, default: null },
  navigationPosition: { type: String as () => ControlPosition, default: 'top-right' },
  noInteraction: { type: Boolean, default: false },
  sampling: { type: String, default: null }
})

const q = defineModel<string>('q', { default: '' })
const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })

const { id, dataset } = useDatasetStore()

const tileUrl = computed(() => {
  if (!dataset.value) return undefined
  const params: Record<string, string> = { format: 'pbf' }
  if (dataset.value.schema?.find(p => p.key === '_id')) params.select = '_id'
  if (q.value) params.q = q.value
  if (dataset.value.finalizedAt) params.finalizedAt = dataset.value.finalizedAt
  if (dataset.value.draftReason) params.draft = 'true'
  if (sampling) params.sampling = sampling
  let url = withQuery($siteUrl + `/data-fair/api/v1/datasets/${id}/lines`, params)
  url += '&xyz={x},{y},{z}'
  return url
})

const fetchBBOX = useFetch<{ bbox: [number, number, number, number] }>(`${$apiPath}/datasets/${id}/lines`, {
  query: computed(() => {
    const query: Record<string, string> = { format: 'geojson', size: '0' }
    if (q.value) query.q = q.value
    if (dataset.value?.draftReason) query.draft = 'true'
    if (singleItem) query._id_eq = singleItem
    return query
  })
})

useMap(tileUrl, computed(() => singleItem), noInteraction, navigationPosition, computed(() => fetchBBOX.data.value?.bbox))

</script>

<style lang="css">
.maplibregl-popup-close-button {
  width: 24px;
}
.maplibregl-popup-content {
  max-height: 300px;
  overflow-y: scroll;
  color: rgba(0, 0, 0, 0.87) !important;
}
</style>
