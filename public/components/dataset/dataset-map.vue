<template lang="html">
  <v-card>
    <v-text-field
      v-if="dataset"
      v-model="query"
      class="mt-2 ml-2 mx-2"
      solo
      dense
      style="position: absolute;z-index:2;max-width:400px;"
      :label="$t('search')"
      append-icon="mdi-magnify"
      hide-details
      single-line
      @keyup.enter.native="refresh"
      @click:append="refresh"
    />
    <div id="map" :style="'height:' + mapHeight + 'px'" />
  </v-card>
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
  import debounce from 'debounce'
  import eventBus from '~/event-bus'
  require('mapbox-gl/dist/mapbox-gl.css')

  function resizeBBOX(bbox, ratio) {
    const d1 = bbox[2] - bbox[0]
    const d1diff = ((d1 * ratio) - d1) / 2
    const d2 = bbox[3] - bbox[1]
    const d2diff = ((d2 * ratio) - d2) / 2
    return [Math.max(bbox[0] - d1diff, -180), Math.max(bbox[1] - d2diff, -90), Math.min(bbox[2] + d1diff, 180), Math.min(bbox[3] + d2diff, 90)]
  }

  const dataLayers = [{
    id: 'results_polygon',
    source: 'data-fair',
    'source-layer': 'results',
    type: 'fill',
    paint: {
      'fill-color': 'rgba(255, 152, 0, 0.2)',
      'fill-outline-color': 'rgba(255, 152, 0, 0.5)',
    },
    filter: ['==', '$type', 'Polygon'],
  }, {
    id: 'results_hover',
    source: 'data-fair',
    'source-layer': 'results',
    type: 'line',
    paint: {
      'line-color': '#E91E63',
      'line-width': { stops: [[4, 1.5], [24, 9]] },
    },
    filter: ['==', '_id', ''],
  }, {
    id: 'results_line',
    source: 'data-fair',
    'source-layer': 'results',
    type: 'line',
    paint: {
      'line-color': 'rgba(156, 39, 176, 0.5)',
      'line-width': { stops: [[4, 1], [24, 6]] },
    },
    layout: {
      'line-cap': 'round',
      'line-join': 'round',
    },
    filter: ['==', '$type', 'LineString'],
  }, {
    id: 'results_point',
    source: 'data-fair',
    'source-layer': 'results',
    type: 'circle',
    paint: {
      'circle-color': 'rgba(233, 30, 99, 0.5)',
      'circle-radius': { stops: [[0, 1], [24, 16]] },
    },
    filter: ['==', '$type', 'Point'],
  }]

  export default {
    props: ['heightMargin', 'fixedHeight'],
    data: () => ({ mapHeight: 0, query: '' }),
    computed: {
      ...mapState(['env']),
      ...mapState('dataset', ['dataset']),
      ...mapGetters('dataset', ['resourceUrl']),
      tileUrl() {
        let url = this.resourceUrl + '/lines?format=pbf&xyz={x},{y},{z}'
        // select only the prop necessary to fetch a specific line
        if (this.dataset.schema.find(p => p.key === '_id')) url += '&select=_id'
        if (this.query) url += '&q=' + encodeURIComponent(this.query)
        if (this.dataset.finalizedAt) url += '&finalizedAt=' + encodeURIComponent(this.dataset.finalizedAt)
        if (this.dataset.draftReason) url += '&draft=true'
        return url
      },
    },
    async mounted() {
      let mapboxgl = null
      if (process.browser) {
        mapboxgl = await import('mapbox-gl')
      }

      if (!mapboxgl) return
      try {
        this.mapHeight = this.fixedHeight ? this.fixedHeight : Math.max(window.innerHeight - this.$el.getBoundingClientRect().top - this.heightMargin, 300)

        await new Promise(resolve => setTimeout(resolve, 0))
        const style = this.env.map.style.replace('./', this.env.publicUrl + '/')
        this.map = new mapboxgl.Map({
          container: 'map',
          style,
          transformRequest: (url, resourceType) => {
            return {
              url,
              credentials: 'include', // include cookies, for data-fair sessions
            }
          },
          attributionControl: false,
        }).addControl(new mapboxgl.AttributionControl({
          compact: false,
        }))
        this.map.on('error', (error) => {
          console.log('Map error', error)
          if (error.sourceId) {
            // eventBus.$emit('notification', { error: `Échec d'accès aux tuiles ${error.sourceId}`, msg: 'Erreur pendant le rendu de la carte:' })
          } else if (error.error && error.error.status === 401) {
            eventBus.$emit('notification', {
              error: this.$t('noSession'),
              msg: this.$t('mapError'),
            })
          } else {
            // eventBus.$emit('notification', { error: (error.error && error.error.message) || error, msg: 'Erreur pendant le rendu de la carte:' })
          }
        })
        const bbox = await this.getBBox()
        if (!bbox) {
          throw new Error(this.$t('noGeoData'))
        }
        this.map.fitBounds(bbox, { duration: 0 })
        this.map.addControl(new mapboxgl.NavigationControl(), 'top-right')
        // Disable map rotation using right click + drag
        this.map.dragRotate.disable()
        // Disable map rotation using touch rotation gesture
        this.map.touchZoomRotate.disableRotation()

        // Create a popup, but don't add it to the map yet.
        const popup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true })

        const moveCallback = (e) => {
          const feature = this.map.queryRenderedFeatures(e.point).find(f => f.source === 'data-fair')
          if (!feature) return

          if (feature.properties._id !== undefined) {
            this.map.setFilter('results_hover', ['==', '_id', feature.properties._id])
          }
          // Change the cursor style as a UI indicator.
          this.map.getCanvas().style.cursor = 'pointer'
        }

        const clickCallback = async (e) => {
          const feature = this.map.queryRenderedFeatures(e.point).find(f => f.source === 'data-fair')
          if (!feature) return

          if (feature.properties._id === undefined) return console.error('needs _id property to be able to fetch item', feature.properties)
          const qs = `_id:"${feature.properties._id}"`
          const select = this.dataset.schema
            .filter(field => !field['x-calculated'] && field['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
            .map(field => field.key)
            .join(',')
          const params = { qs, size: 1, select }
          if (this.dataset.draftReason) params.draft = 'true'
          const item = (await this.$axios.$get(this.resourceUrl + '/lines', { params })).results[0]
          if (!item) return console.error('item not found with filter', qs)

          const htmlList = this.dataset.schema
            .filter(field => !field['x-calculated'] && field['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
            .filter(field => item[field.key] !== undefined)
            .map(field => {
              return `<li>${field.title || field['x-originalName'] || field.key}: ${item[field.key]}</li>`
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
        }

        dataLayers.forEach(layer => {
          this.map.on('mousemove', layer.id, debounce(moveCallback, 30))
          this.map.on('mouseleave', layer.id, leaveCallback)
          this.map.on('click', layer.id, clickCallback)
        })

        // Add custom source and layers
        this.map.once('load', () => {
          this.initCustomSource()
        })
      } catch (error) {
        eventBus.$emit('notification', { error })
      }
    },
    methods: {
      async getBBox() {
        const params = { format: 'geojson', size: 0, q: this.query }
        if (this.dataset.draftReason) params.draft = 'true'
        const bbox = (await this.$axios.$get(this.resourceUrl + '/lines', { params })).bbox
        if (!bbox || !bbox.length) {
          return null
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
        if (bbox) this.map.fitBounds(bbox)
      },
      initCustomSource() {
        this.map.addSource('data-fair', { type: 'vector', tiles: [this.tileUrl] })
        dataLayers.forEach(layer => this.map.addLayer(layer, this.env.map.beforeLayer))
      },
    },
  }
</script>

<style lang="css">
.mapboxgl-popup-close-button {
  width: 24px;
}
.mapboxgl-popup-content {
  max-height: 300px;
  overflow-y: scroll;
}
</style>
