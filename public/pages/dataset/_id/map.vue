<template lang="html">

  <v-card>
    <v-card class="mt-3 ml-3 pl-3 pr-3" style="position: absolute;z-index:2;">
      <v-text-field
        label="Rechercher"
        v-model="query"
        @keyup.enter.native="refresh"
        :append-icon-cb="refresh"
        append-icon="search"
        hide-details
        single-line/>

      <v-select
        :items="dataset.schema.map(f => ({value: f.key, text: f.title || f['x-originalName']}))"
        item-value="value"
        item-text="text"
        v-model="select"
        label="Choisir les champs"
        multiple
        @change="refresh"
      />
    </v-card>
    <div id="map" :style="'height:' + mapHeight + 'px'"/>
  </v-card>

</template>

<script>
import {mapState, mapGetters} from 'vuex'
import eventBus from '../../../event-bus'

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
  return [bbox[0] - d1diff, bbox[1] - d2diff, bbox[2] + d1diff, bbox[3] + d2diff]
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
  'id': 'results_line',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'line',
  'paint': {
    'line-color': 'rgba(156, 39, 176, 0.5)',
    'line-width': {'stops': [[4, 1], [24, 6]]}
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
    'circle-radius': {'stops': [[6, 1], [24, 16]]}
  },
  'filter': ['==', '$type', 'Point']
}]

export default {
  data: () => ({mapHeight: 0, query: '', select: []}),
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
    this.refresh()
  },
  methods: {
    async getBBox() {
      return (await this.$axios.$get(this.resourceUrl + '/lines', {params: {format: 'geojson', size: 0, qs: this.query}})).bbox
    },
    async refresh() {
      if (!mapboxgl) return
      const bbox = await this.getBBox()
      if (!bbox || !bbox.length) {
        return eventBus.$emit('notification', {type: 'info', msg: 'Aucune donnée correspondante.'})
      }

      this.mapHeight = Math.max(window.innerHeight - this.$el.getBoundingClientRect().y - 60, 300)
      await new Promise(resolve => setTimeout(resolve, 0))
      this.map = new mapboxgl.Map({container: 'map', style: this.env.map.style})
      this.map.on('error', (error) => {
        console.log(error)
        eventBus.$emit('notification', {type: 'error', msg: 'Erreur pendant le rendu de la carte : ' + (error.message || error.status || error)})
      })
      this.map.fitBounds(resizeBBOX(bbox, 1.1), {duration: 0})
      this.map.addControl(new mapboxgl.NavigationControl(), 'top-right')
      // Disable map rotation using right click + drag
      this.map.dragRotate.disable()
      // Disable map rotation using touch rotation gesture
      this.map.touchZoomRotate.disableRotation()

      // Add custom source and layers for this dataset
      this.map.once('load', () => {
        this.map.addSource('data-fair', {type: 'vector', tiles: [this.tileUrl]})
        dataLayers.forEach(layer => this.map.addLayer(layer, this.env.map.beforeLayer))
      })

      // Create a popup, but don't add it to the map yet.
      const popup = new mapboxgl.Popup({closeButton: false, closeOnClick: false})

      const enterCallback = (e) => {
        // Change the cursor style as a UI indicator.
        this.map.getCanvas().style.cursor = 'pointer'
        const htmlList = Object.keys(e.features[0].properties || {})
          .map(key => {
            const field = this.dataset.schema.find(f => f.key === key)
            return `<li>${field.title || field['x-originalName']}: ${e.features[0].properties[key]}</li>`
          })
          .join('\n')
        const html = `<ul style="list-style-type: none;">${htmlList}</ul>`

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

      if (this.select.length) {
        dataLayers.forEach(layer => {
          this.map.on('mouseenter', layer.id, enterCallback)
          this.map.on('mouseleave', layer.id, leaveCallback)
        })
      }
    }
  }
}
</script>

<style lang="css">
</style>
