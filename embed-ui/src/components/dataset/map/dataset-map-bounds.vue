<template lang="html">
  <v-card>
    <div
      id="map"
      :style="'height:' + height + 'px'"
    />
  </v-card>
</template>

<i18n lang="yaml">
fr:
  noSession: Pas de session active. Cette erreur peut subvenir si vous utilisez une extension qui bloque les cookies. Les cookies de session sont utilisés par ce service pour protéger notre infrastructure contre les abus.
  noGeoData: Aucune donnée géographique valide.
  noData: Aucune donnée à afficher
  mapError: "Erreur pendant le rendu de la carte :"
en:
  noSession: No active session. This error can happen if you use an extension that blocks cookies. Session cookies are used by this service to protect the infrastructure from abuse.
  noGeoData: No valid geo data
  noData: No data to display
  mapError: "Error while rendering the map:"
</i18n>

<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import { type BBox } from 'geojson'
import maplibregl, { LayerSpecification, LngLatBoundsLike } from 'maplibre-gl'
import { useTheme } from 'vuetify'
import bbox from '@turf/bbox'
import bboxPolygon from '@turf/bbox-polygon'

const { height } = defineProps({
  height: { type: Number, required: true }
})

const q = defineModel<string>('q', { default: '' })
const editQ = ref('')
watch(q, () => { editQ.value = q.value }, { immediate: true })

const theme = useTheme()
const { dataset } = useDatasetStore()

const datasetBbox = computed(() => {
  if (!dataset.value?.bbox) return null
  // @ts-ignore
  if (dataset.value.extras?.geographic?.envelope) return bbox(dataset.value.extras.geographic.envelope)
  return dataset.value.bbox as BBox
})

const dataLayers: LayerSpecification[] = [{
  id: 'bounds_polygon',
  source: 'bounds',
  type: 'line',
  paint: {
    'line-color': theme.current.value.colors.primary,
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 24, 9]
  }
}]
const style = $uiConfig.map.style.replace('./', `${$siteUrl}/data-fair/`)

watch(datasetBbox, (box) => {
  if (!box) return
  const map = new maplibregl.Map({
    container: 'map',
    style,
    transformRequest: (url) => {
      if (url.startsWith($siteUrl)) {
      // include cookies, for data-fair sessions
        return { url, credentials: 'include' }
      } else {
        return { url }
      }
    },
    // preserveDrawingBuffer: noInteraction, // for capture ? TODO: only apply this if in a capture context ?
    attributionControl: false,
  }).addControl(new maplibregl.AttributionControl({
    compact: false
  }))

  map.fitBounds(box as LngLatBoundsLike, { padding: 30, duration: 0 })

  // Disable map rotation using right click + drag
  map.dragRotate.disable()
  // Disable map rotation using touch rotation gesture
  map.touchZoomRotate.disableRotation()

  // Add custom source and layers
  map.once('load', () => {
    map.addSource('bounds', {
      type: 'geojson',
      data: bboxPolygon(box)
    })
    dataLayers.forEach(layer => map.addLayer(layer, $uiConfig.map.beforeLayer))
  })
}, { immediate: true })

</script>

<style lang="css">
</style>
