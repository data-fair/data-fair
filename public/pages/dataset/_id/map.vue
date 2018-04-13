<template lang="html">

  <v-card>
    <div id="map" :style="'height:' + mapHeight + 'px'"/>
  </v-card>

</template>

<script>
import {mapState, mapGetters} from 'vuex'
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

const polygonLayer = {
  'id': 'results_polygon',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'fill',
  'paint': {
    'fill-color': 'rgb(255, 152, 0)'
  },
  'filter': ['==', '$type', 'Polygon']
}

const lineLayer = {
  'id': 'results_line',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'line',
  'paint': {
    'line-color': 'rgb(156, 39, 176)'
  },
  'filter': ['==', '$type', 'LineString']
}

const pointLayer = {
  'id': 'results_point',
  'source': 'data-fair',
  'source-layer': 'results',
  'type': 'circle',
  'paint': {
    'circle-color': 'rgb(233, 30, 99)',
    'circle-radius': 2
  },
  'filter': ['==', '$type', 'Point']
}

export default {
  data: () => ({mapHeight: 0}),
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl'])
  },
  async mounted() {
    if (!mapboxgl) return
    /* eslint no-new:off */
    this.mapHeight = Math.max(window.innerHeight - this.$el.getBoundingClientRect().y - 60, 300)
    await new Promise(resolve => setTimeout(resolve, 0))
    this.map = new mapboxgl.Map({
      container: 'map',
      style: this.env.map.style
    })
    this.map.fitBounds(resizeBBOX(this.dataset.bbox, 1.1), {duration: 0})
    this.map.addControl(new mapboxgl.NavigationControl(), 'top-left')
    // Disable map rotation using right click + drag
    this.map.dragRotate.disable()
    // Disable map rotation using touch rotation gesture
    this.map.touchZoomRotate.disableRotation()

    // Add custom source and layers for this dataset
    this.map.once('load', () => {
      this.map.addSource('data-fair', {type: 'vector', tiles: [this.resourceUrl + '/lines?size=10000&format=pbf&xyz={x},{y},{z}']})
      this.map.addLayer(polygonLayer)
      this.map.addLayer(lineLayer)
      this.map.addLayer(pointLayer)
    })
  }
}
</script>

<style lang="css">
</style>
