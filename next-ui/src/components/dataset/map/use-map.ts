import maplibregl, { Map, ControlPosition, LegacyFilterSpecification, LngLatBoundsLike } from 'maplibre-gl'
import { useMapStyle } from './use-map-style'
import debounce from 'debounce'

const fitBoundsOpts = { maxZoom: 15, padding: 40 }

export const useMap = (
  tileUrl: Ref<string | undefined>,
  singleItem: Ref<string>,
  noInteraction: boolean,
  navigationPosition: ControlPosition,
  bbox: Ref<LngLatBoundsLike | undefined>
) => {
  const { sendUiNotif } = useUiNotif()
  const { t } = useI18n()
  const { style, dataLayers } = useMapStyle(singleItem)
  const { id, dataset } = useDatasetStore()

  let _map: Map
  const getMap = () => {
    if (!tileUrl.value || !bbox.value) return
    if (_map) return _map
    console.log(tileUrl.value)
    const map = _map = new maplibregl.Map({
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

    if (!noInteraction) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), navigationPosition ?? 'top-right')
    }

    // Disable map rotation using right click + drag
    map.dragRotate.disable()
    // Disable map rotation using touch rotation gesture
    map.touchZoomRotate.disableRotation()

    map.on('error', (error) => {
      console.error('dataset map preview error', error)
      sendUiNotif({ type: 'error', error, msg: t('mapError') })
    })

    map.once('load', () => { initCustomSource() })

    fitBBox({ duration: 0 })

    if (!singleItem.value) {
      // Create a popup, but don't add it to the map yet.
      const popup = new maplibregl.Popup({ closeButton: true, closeOnClick: true })

      const moveCallback = (e: any) => {
        const feature = map.queryRenderedFeatures(e.point).find(f => f.source === 'data-fair')
        if (!feature) return

        if (feature.properties._id !== undefined) {
          const itemFilter: LegacyFilterSpecification = ['==', '_id', feature.properties._id]
          map.setFilter('results_hover', itemFilter)
          map.setFilter('results_point_hover', ['all', ['==', '$type', 'Point'], itemFilter])
        }
        // Change the cursor style as a UI indicator.
        map.getCanvas().style.cursor = 'pointer'
      }

      const clickCallback = async (e: any) => {
        if (!dataset.value?.schema) return
        const feature = map.queryRenderedFeatures(e.point).find(f => f.source === 'data-fair')
        if (!feature) return

        if (feature.properties._id === undefined) return console.error('needs _id property to be able to fetch item', feature.properties)
        const qs = `_id:"${feature.properties._id}"`
        const select = dataset.value.schema
          .filter(field => !field['x-calculated'] && field['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry')
          .map(field => field.key)
          .join(',')
        const params: Record<string, string> = { qs, size: '1', select }
        if (dataset.value.draftReason) params.draft = 'true'
        const item = (await $fetch(`${$apiPath}/datasets/${id}/lines`, { params })).results[0]
        if (!item) return console.error('item not found with filter', qs)

        const htmlList = dataset.value.schema
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
          .addTo(map)
      }

      const leaveCallback = () => {
        map.getCanvas().style.cursor = ''
      }

      dataLayers.value.forEach(layer => {
        map.on('mousemove', layer.id, debounce(moveCallback, 30))
        map.on('mouseleave', layer.id, leaveCallback)
        if (!noInteraction) {
          map.on('click', layer.id, clickCallback)
        }
      })
    }

    return map
  }

  watch(bbox, () => {
    fitBBox()
  })
  const fitBBox = (extraOpts = {}) => {
    if (!bbox.value) sendUiNotif({ type: 'error', msg: t('noGeoData') })
    else if (Array.isArray(bbox.value) && !bbox.value.length) sendUiNotif({ type: 'warning', msg: t('noData') })
    else getMap()?.fitBounds(bbox.value, { ...fitBoundsOpts, ...extraOpts })
  }

  watch(tileUrl, () => {
    const map = getMap()
    if (!map) return
    // First clear layers and source to be able to change the tiles url
    dataLayers.value.forEach(layer => {
      if (map.getLayer(layer.id)) map.removeLayer(layer.id)
    })
    if (map.getSource('data-fair')) map.removeSource('data-fair')

    // Then add them again
    initCustomSource()
  })

  const initCustomSource = () => {
    if (!tileUrl.value) return
    const map = getMap()
    if (!map) return
    if (!map.loaded) return
    map.addSource('data-fair', { type: 'vector', tiles: [tileUrl.value] })
    dataLayers.value.forEach(layer => {
      map.addLayer(layer, $uiConfig.map.beforeLayer)
    })
  }
}
