<template lang="html">

  <v-card>
    <v-card v-if="dataset" class="mt-2 ml-2 px-2" style="position: absolute;z-index:2;max-width:400px;">

      <v-text-field
        v-model="query"
        style="margin-top: 8px;margin-bottom: 8px;"
        label="Rechercher"
        append-icon="search"
        hide-details
        single-line
        @keyup.enter.native="refresh"
        @click:append="refresh"/>

      <v-select
        v-if="showSelect"
        :items="dataset.schema.map(f => ({value: f.key, text: f.title || f['x-originalName'] || f.key}))"
        v-model="select"
        style="margin-top: 30px;"
        item-value="value"
        item-text="text"
        label="Choisir les champs"
        multiple
        @input="refresh"
      />
    </v-card>
    <div id="map" :style="'height:' + mapHeight + 'px'"/>
  </v-card>

</template>

<script>
import { mapState, mapGetters } from 'vuex'
import debounce from 'lodash.debounce'
import eventBus from '../event-bus'

let mapboxgl = null
if (process.browser) {
  mapboxgl = require('mapbox-gl')
  require('mapbox-gl/dist/mapbox-gl.css')
}

function resizeBBOX(bbox, ratio) {
  const d1 = bbox[2] - bbox[0]
  const d1diff = ((d1 * ratio) - d1) / 2
  const d2 = bbox[3] - bbox[1]
  const d2diff = ((d2 * ratio) - d2) / 2
  return [Math.max(bbox[0] - d1diff, -180), Math.max(bbox[1] - d2diff, -90), Math.min(bbox[2] + d1diff, 180), Math.min(bbox[3] + d2diff, 90)]
}

const dataLayers = [{
  'id': 'results_polygon',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'fill',
  'paint': {
    'fill-color': 'rgba(255, 152, 0, 0.2)',
    'fill-outline-color': 'rgba(255, 152, 0, 0.5)'
  },
  'filter': ['==', '$type', 'Polygon']
}, {
  'id': 'results_hover',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'line',
  'paint': {
    'line-color': '#E91E63',
    'line-width': { 'stops': [[4, 1.5], [24, 9]] }
  },
  'filter': ['==', '_id', '']
}, {
  'id': 'results_line',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'line',
  'paint': {
    'line-color': 'rgba(156, 39, 176, 0.5)',
    'line-width': { 'stops': [[4, 1], [24, 6]] }
  },
  layout: {
    'line-cap': 'round',
    'line-join': 'round'
  },
  'filter': ['==', '$type', 'LineString']
}, {
  'id': 'results_point',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'circle',
  'paint': {
    'circle-color': 'rgba(233, 30, 99, 0.5)',
    'circle-radius': { 'stops': [[6, 1.5], [24, 16]] }
  },
  'filter': ['==', '$type', 'Point']
}]

export default {
  props: ['heightMargin', 'showSelect'],
  data: () => ({ mapHeight: 0, query: '', select: [] }),
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    tileUrl() {
      let url = this.resourceUrl + '/lines?format=pbf&size=10000&xyz={x},{y},{z}'
      if (this.query) url += '&qs=' + encodeURIComponent(this.query)
      if (this.select.length) url += '&select=' + encodeURIComponent(this.select.join(','))
      return url
    }
  },
  async mounted() {
    if (!mapboxgl) return

    this.mapHeight = Math.max(window.innerHeight - this.$el.getBoundingClientRect().y - this.heightMargin, 300)

    // Prevent overloading the tiles with long texts, geometries, etc.
    this.select = this.dataset.schema
      .filter(field => !field['x-calculated'])
      .filter(field => field.type === 'string' && field.format === 'uri-reference')
      .map(field => field.key)

    await new Promise(resolve => setTimeout(resolve, 0))
    const style = this.env.map.style.replace('./', this.env.publicUrl + '/')
    this.map = new mapboxgl.Map({ container: 'map', style })
    this.map.on('error', (error) => {
      if (error.sourceId) eventBus.$emit('notification', { error: `Échec d'accès aux tuiles ${error.sourceId}`, msg: 'Erreur pendant le rendu de la carte:' })
      else eventBus.$emit('notification', { error, msg: 'Erreur pendant le rendu de la carte:' })
    })
    const bbox = await this.getBBox()
    this.map.fitBounds(bbox, { duration: 0 })
    this.map.addControl(new mapboxgl.NavigationControl(), 'top-right')
    // Disable map rotation using right click + drag
    this.map.dragRotate.disable()
    // Disable map rotation using touch rotation gesture
    this.map.touchZoomRotate.disableRotation()

    // Create a popup, but don't add it to the map yet.
    const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })

    const moveCallback = (e) => {
      if (!this.select.length) return
      const feature = this.map.queryRenderedFeatures(e.point).find(f => f.source === 'data-fair')
      if (!feature) return
      this.map.setFilter('results_hover', ['==', '_id', feature.properties._id])
      // Change the cursor style as a UI indicator.
      this.map.getCanvas().style.cursor = 'pointer'
      const htmlList = Object.keys(feature.properties || {})
        .filter(key => key !== '_id')
        .map(key => {
          const field = this.dataset.schema.find(f => f.key === key)
          return `<li>${field.title || field['x-originalName'] || field.key}: ${feature.properties[key]}</li>`
        })
        .join('\n')
      const html = `<ul style="list-style-type: none;padding-left: 0;">${htmlList}</ul>`

      // Populate the popup and set its coordinates
      // based on the feature found.
      popup.setLngLat(e.lngLat)
        .setHTML(html)
        .addTo(this.map)
    }

    const leaveCallback = () => {
      this.map.getCanvas().style.cursor = ''
      popup.remove()
    }

    dataLayers.forEach(layer => {
      this.map.on('mousemove', layer.id, debounce(moveCallback, 30))
      this.map.on('mouseleave', layer.id, leaveCallback)
    })

    // Add custom source and layers
    this.map.once('load', () => {
      this.initCustomSource()
    })
  },
  methods: {
    async getBBox() {
      const bbox = (await this.$axios.$get(this.resourceUrl + '/lines', { params: { format: 'geojson', size: 0, qs: this.query } })).bbox
      if (!bbox || !bbox.length) {
        return eventBus.$emit('notification', 'Aucune donnée correspondante.')
      }
      return resizeBBOX(bbox, 1.1)
    },
    async refresh() {
      // First clear layers and source to be able to change the tiles url
      dataLayers.forEach(layer => {
        if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id)
      })
      if (this.map.getSource('data-fair')) this.map.removeSource('data-fair')

      // Then add them again
      this.initCustomSource()

      // And fit box to results
      const bbox = await this.getBBox()
      this.map.fitBounds(bbox)
    },
    initCustomSource() {
      this.map.addSource('data-fair', { type: 'vector', tiles: [this.tileUrl] })
      dataLayers.forEach(layer => this.map.addLayer(layer, this.env.map.beforeLayer))
    }
  }
}
</script>

<style lang="css">
.mapboxgl-popup-close-button {
  width: 16px;
}
</style>
