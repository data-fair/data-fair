<template>
  <div
    id="map"
    :style="'height:' + height + 'px'"
  />
</template>

<i18n lang="yaml">
fr:
  noGeoData: Aucune donnée géographique valide.
  noData: Aucune donnée à afficher
  mapError: "Erreur pendant le rendu de la carte :"
en:
  noGeoData: No valid geo data
  noData: No data to display
  mapError: "Error while rendering the map:"
</i18n>

<script setup lang="ts">
import 'maplibre-gl/dist/maplibre-gl.css'
import { type BBox } from 'geojson'
// maplibre 6 has no default export
import * as maplibregl from 'maplibre-gl'
import { LayerSpecification, LngLatBoundsLike } from 'maplibre-gl'
import { useTheme } from 'vuetify'
import bbox from '@turf/bbox'
import bboxPolygon from '@turf/bbox-polygon'
import { useMapStyle } from './use-map-style'
import './maplibre-worker'

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
    'line-color': theme.current.value.colors.primary as string,
    'line-width': ['interpolate', ['linear'], ['zoom'], 4, 1.5, 24, 9]
  }
}]
const { style } = useMapStyle()

const { t } = useI18n()
const { sendUiNotif } = useUiNotif()

watch(datasetBbox, (box) => {
  if (!box) return
  // maplibre 6 dropped WebGL1 and THROWS GPUInitializationError from the constructor rather
  // than emitting an "error" event, so a browser without a WebGL2 context is handled here
  let map: maplibregl.Map
  try {
    map = new maplibregl.Map({
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
  } catch (error) {
    sendUiNotif({ type: 'error', error, msg: t('mapError') })
    return
  }

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
