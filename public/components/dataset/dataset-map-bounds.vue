<template lang="html">
  <div
    id="map"
    :style="'height:' + mapHeight + 'px'"
  />
</template>

<i18n lang="yaml">
fr:
  search: Rechercher
  noSession: Pas de session active. Cette erreur peut subvenir si vous utilisez une extension qui bloque les cookies. Les cookies de session sont utilisés par ce service pour protéger notre infrastructure contre les abus.
  noGeoData: Aucune donnée géographique valide.
  mapError: "Erreur pendant le rendu de la carte :"
en:
  search: Search
  noSession: No active session. This error can happen if you use an extension that blocks cookies. Session cookies are used by this service to protect the infrastructure from abuse.
  noGeoData: No valid geo data
  mapError: "Error while rendering the map:"
</i18n>

<script>
import { mapState, mapGetters } from 'vuex'
import eventBus from '~/event-bus'
import bboxPolygon from '@turf/bbox-polygon'
import bbox from '@turf/bbox'

require('mapbox-gl/dist/mapbox-gl.css')

const dataLayers = [{
  id: 'bounds_polygon',
  source: 'bounds',
  type: 'line',
  paint: {
    'line-color': '#E91E63',
    'line-width': { stops: [[4, 1.5], [24, 9]] }
  }
}]

export default {
  props: ['heightMargin', 'fixedHeight'],
  data: () => ({ mapHeight: 0, query: '' }),
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    boundsGeojson () {
      console.log(this.dataset.extras)
      // this extra property is added by some importers from SIG
      if (this.dataset.extras?.geographic?.envelope) {
        return this.dataset.extras.geographic.envelope
      }

      return bboxPolygon(this.dataset.bbox)
      /* return {
        type: 'Feature',
        properties: {},
        geometry: {
          type: 'Polygon',
          // coordinates: [[[bbox[1], bbox[0]], [bbox[3], bbox[0]], [bbox[3], bbox[2]], [bbox[1], bbox[2]], [bbox[1], bbox[0]]]]
          coordinates: [[[bbox[0], bbox[1]], [bbox[2], bbox[1]], [bbox[2], bbox[3]], [bbox[0], bbox[3]], [bbox[0], bbox[1]]]]
        }
      } */
    }
  },
  async mounted () {
    let mapboxgl = null
    if (process.browser) {
      mapboxgl = await import('mapbox-gl')
    }

    if (!mapboxgl) return
    try {
      this.mapHeight = this.fixedHeight ? this.fixedHeight : Math.max(window.innerHeight, 200)

      await new Promise(resolve => setTimeout(resolve, 0))
      const style = this.env.map.style.replace('./', this.env.publicUrl + '/')
      this.map = new mapboxgl.Map({
        container: 'map',
        style,
        transformRequest: (url, resourceType) => {
          return {
            url,
            credentials: 'include' // include cookies, for data-fair sessions
          }
        },
        attributionControl: false
      }).addControl(new mapboxgl.AttributionControl({
        compact: false
      }))

      this.map.fitBounds(bbox(this.boundsGeojson), { padding: 30, duration: 0 })

      // Disable map rotation using right click + drag
      this.map.dragRotate.disable()
      // Disable map rotation using touch rotation gesture
      this.map.touchZoomRotate.disableRotation()

      // Add custom source and layers
      this.map.once('load', () => {
        this.initCustomSource()
      })
    } catch (error) {
      eventBus.$emit('notification', { error })
    }
  },
  methods: {
    initCustomSource () {
      this.map.addSource('bounds', {
        type: 'geojson',
        data: this.boundsGeojson
      })
      dataLayers.forEach(layer => this.map.addLayer(layer, this.env.map.beforeLayer))
    }
  }
}
</script>

<style lang="css">
.mapboxgl-popup-close-button {
  width: 24px;
}
.mapboxgl-popup-content {
  max-height: 300px;
  overflow-y: scroll;
  color: rgba(0, 0, 0, 0.87) !important;
}
</style>
