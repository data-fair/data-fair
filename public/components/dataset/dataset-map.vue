<template lang="html">
  <v-card>
    <v-text-field
      v-if="dataset && !singleItem"
      v-model="query"
      light
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
    <div
      id="map"
      :style="'height:' + mapHeight + 'px'"
    />
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
require('maplibre-gl/dist/maplibre-gl.css')

const fitBoundsOpts = { maxZoom: 15, padding: 40 }

export default {
  props: ['heightMargin', 'fixedHeight', 'singleItem', 'navigationPosition'],
  data: () => ({ mapHeight: 0, query: '' }),
  computed: {
    ...mapState(['env']),
    ...mapState('dataset', ['dataset']),
    ...mapGetters('dataset', ['resourceUrl']),
    tileUrl () {
      let url = this.resourceUrl + '/lines?format=pbf&xyz={x},{y},{z}'
      // select only the prop necessary to fetch a specific line
      if (this.dataset.schema.find(p => p.key === '_id')) url += '&select=_id'
      if (this.query) url += '&q=' + encodeURIComponent(this.query)
      if (this.dataset.finalizedAt) url += '&finalizedAt=' + encodeURIComponent(this.dataset.finalizedAt)
      if (this.dataset.draftReason) url += '&draft=true'
      return url
    },
    dataLayers () {
      const primary = this.$vuetify.theme.themes.light.primary
      const itemFilter = ['==', '_id', this.singleItem]
      return [{
        id: 'results_polygon',
        source: 'data-fair',
        'source-layer': 'results',
        type: 'fill',
        paint: {
          'fill-color': primary,
          'fill-opacity': 0.4
        },
        filter: this.singleItem ? ['all', ['==', '$type', 'Polygon'], itemFilter] : ['==', '$type', 'Polygon']
      }, {
        id: 'results_polygon_outline',
        source: 'data-fair',
        'source-layer': 'results',
        type: 'line',
        paint: {
          'line-color': primary,
          'line-opacity': 0.7,
          'line-width': { stops: [[4, 0.5], [24, 3]] }
        },
        filter: this.singleItem ? ['all', ['==', '$type', 'Polygon'], itemFilter] : ['==', '$type', 'Polygon']
      }, {
        id: 'results_hover',
        source: 'data-fair',
        'source-layer': 'results',
        type: 'line',
        paint: {
          'line-color': primary,
          'line-width': { stops: [[4, 1.5], [24, 9]] }
        },
        filter: this.singleItem ? itemFilter : ['==', '_id', '']
      }, {
        id: 'results_line',
        source: 'data-fair',
        'source-layer': 'results',
        type: 'line',
        paint: {
          'line-color': primary,
          'line-opacity': 0.8,
          'line-width': { stops: [[4, 1], [24, 6]] }
        },
        layout: {
          'line-cap': 'round',
          'line-join': 'round'
        },
        filter: this.singleItem ? ['all', ['==', '$type', 'LineString'], itemFilter] : ['==', '$type', 'LineString']
      }, {
        id: 'results_point',
        source: 'data-fair',
        'source-layer': 'results',
        type: 'circle',
        paint: {
          'circle-color': primary,
          'circle-opacity': 0.8,
          'circle-radius': { stops: [[0, 1], [24, 16]] }
        },
        filter: this.singleItem ? ['all', ['==', '$type', 'Point'], itemFilter] : ['==', '$type', 'Point']
      }, {
        id: 'results_point_hover',
        source: 'data-fair',
        'source-layer': 'results',
        type: 'circle',
        paint: {
          'circle-color': primary,
          'circle-radius': { stops: [[0, 1.5], [24, 24]] }
        },
        filter: ['all', this.singleItem ? itemFilter : ['==', '_id', ''], ['==', '$type', 'Point']]
      }]
    }
  },
  async mounted () {
    let maplibregl = null
    if (process.browser) {
      maplibregl = await import('maplibre-gl')
    }

    if (!maplibregl) return
    try {
      this.mapHeight = this.fixedHeight ? this.fixedHeight : Math.max(window.innerHeight - this.$el.getBoundingClientRect().top - this.heightMargin, 300)

      const bbox = await this.getBBox()
      if (!bbox) {
        throw new Error(this.$t('noGeoData'))
      }

      const style = this.env.map.style.replace('./', this.env.publicUrl + '/')
      this.map = new maplibregl.Map({
        container: 'map',
        style,
        transformRequest: (url, resourceType) => {
          if (url.startsWith(this.env.publicUrl)) {
            // include cookies, for data-fair sessions
            return { url, credentials: 'include' }
          } else {
            return { url }
          }
        },
        attributionControl: false
      }).addControl(new maplibregl.AttributionControl({
        compact: false
      }))
      this.map.on('error', (error) => {
        if (error.sourceId) {
          // eventBus.$emit('notification', { error: `Échec d'accès aux tuiles ${error.sourceId}`, msg: 'Erreur pendant le rendu de la carte:' })
        } else if (error.error && error.error.status === 401) {
          eventBus.$emit('notification', {
            error: this.$t('noSession'),
            msg: this.$t('mapError')
          })
        } else {
          // eventBus.$emit('notification', { error: (error.error && error.error.message) || error, msg: 'Erreur pendant le rendu de la carte:' })
        }
      })
      this.map.fitBounds(bbox, { duration: 0, ...fitBoundsOpts })
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), this.navigationPosition ?? 'top-right')
      // Disable map rotation using right click + drag
      this.map.dragRotate.disable()
      // Disable map rotation using touch rotation gesture
      this.map.touchZoomRotate.disableRotation()

      if (!this.singleItem) {
        // Create a popup, but don't add it to the map yet.
        const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })

        const moveCallback = (e) => {
          const feature = this.map.queryRenderedFeatures(e.point).find(f => f.source === 'data-fair')
          if (!feature) return

          if (feature.properties._id !== undefined) {
            const itemFilter = ['==', '_id', feature.properties._id]
            this.map.setFilter('results_hover', itemFilter)
            this.map.setFilter('results_point_hover', ['all', ['==', '$type', 'Point'], itemFilter])
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

        this.dataLayers.forEach(layer => {
          this.map.on('mousemove', layer.id, debounce(moveCallback, 30))
          this.map.on('mouseleave', layer.id, leaveCallback)
          this.map.on('click', layer.id, clickCallback)
        })
      }

      // Add custom source and layers
      this.map.once('load', () => {
        this.initCustomSource()
      })
    } catch (error) {
      eventBus.$emit('notification', { error })
    }
  },
  destroyed () {
    if (this.map) this.map.remove()
  },
  methods: {
    async getBBox () {
      const params = { format: 'geojson', size: 0, q: this.query }
      if (this.dataset.draftReason) params.draft = 'true'
      if (this.singleItem) params._id_eq = this.singleItem
      return (await this.$axios.$get(this.resourceUrl + '/lines', { params })).bbox
    },
    async refresh () {
      // First clear layers and source to be able to change the tiles url
      this.dataLayers.forEach(layer => {
        if (this.map.getLayer(layer.id)) this.map.removeLayer(layer.id)
      })
      if (this.map.getSource('data-fair')) this.map.removeSource('data-fair')

      // Then add them again
      this.initCustomSource()

      // And fit box to results
      const bbox = await this.getBBox()
      if (bbox) this.map.fitBounds(bbox, fitBoundsOpts)
    },
    initCustomSource () {
      this.map.addSource('data-fair', { type: 'vector', tiles: [this.tileUrl] })
      this.dataLayers.forEach(layer => {
        this.map.addLayer(layer, this.env.map.beforeLayer)
      })
    }
  }
}
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
