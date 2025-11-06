import { type AddLayerObject, type LegacyFilterSpecification, type DataDrivenPropertyValueSpecification } from 'maplibre-gl'
import { useTheme } from 'vuetify'

export const useMapStyle = (singleItem: Ref<string>) => {
  const theme = useTheme()

  const style = $uiConfig.map.style.replace('./', `${$siteUrl}/data-fair/`)

  const dataLayers = computed((): AddLayerObject[] => {
    const primary = theme.current.value.colors.primary
    const itemFilter: LegacyFilterSpecification = ['==', '_id', singleItem.value]
    const polygonFilter: LegacyFilterSpecification = ['==', '$type', 'Polygon']
    const lineStringFilter: LegacyFilterSpecification = ['==', '$type', 'LineString']
    const pointFilter: LegacyFilterSpecification = ['==', '$type', 'Point']
    return [{
      id: 'results_polygon',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'fill',
      paint: {
        'fill-color': primary,
        'fill-opacity': 0.4
      },
      filter: singleItem.value ? ['all', polygonFilter, itemFilter] : polygonFilter
    }, {
      id: 'results_polygon_outline',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'line',
      paint: {
        'line-color': primary,
        'line-opacity': 0.7,
        'line-width': { stops: [[4, 0.5], [24, 3]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: singleItem.value ? ['all', polygonFilter, itemFilter] : polygonFilter
    }, {
      id: 'results_hover',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'line',
      paint: {
        'line-color': primary,
        'line-width': { stops: [[4, 1.5], [24, 9]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: singleItem.value ? itemFilter : ['==', '_id', '']
    }, {
      id: 'results_line',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'line',
      paint: {
        'line-color': primary,
        'line-opacity': 0.8,
        'line-width': { stops: [[4, 1], [24, 6]] } as DataDrivenPropertyValueSpecification<number>
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      filter: singleItem.value ? ['all', lineStringFilter, itemFilter] : lineStringFilter
    }, {
      id: 'results_point',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'circle',
      paint: {
        'circle-color': primary,
        'circle-opacity': 0.8,
        'circle-radius': { stops: [[0, 1], [24, 16]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: singleItem.value ? ['all', pointFilter, itemFilter] : pointFilter
    }, {
      id: 'results_point_hover',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'circle',
      paint: {
        'circle-color': primary,
        'circle-radius': { stops: [[0, 1.5], [24, 24]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: ['all', singleItem.value ? itemFilter : ['==', '_id', ''], pointFilter]
    }]
  })

  return { style, dataLayers }
}
