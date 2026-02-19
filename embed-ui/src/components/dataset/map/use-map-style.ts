import { type AddLayerObject, type LegacyFilterSpecification, type DataDrivenPropertyValueSpecification } from 'maplibre-gl'
import { useTheme } from 'vuetify'

export const useMapStyle = (singleItem: string | undefined, selectedItem: Ref<string>) => {
  const theme = useTheme()

  const style = $uiConfig.map.style.replace('./', `${$siteUrl}/data-fair/`)

  const dataLayers = computedDeepDiff((): AddLayerObject[] => {
    const primary = theme.current.value.colors.primary
    const singleItemFilter: LegacyFilterSpecification = ['==', '_id', singleItem ?? '']
    const selectedItemFilter: LegacyFilterSpecification = ['==', '_id', selectedItem.value]
    const notSelectedItemFilter: LegacyFilterSpecification = ['!=', '_id', selectedItem.value]
    const polygonFilter: LegacyFilterSpecification = ['==', '$type', 'Polygon']
    const lineStringFilter: LegacyFilterSpecification = ['==', '$type', 'LineString']
    const pointFilter: LegacyFilterSpecification = ['==', '$type', 'Point']
    const baseLayers: AddLayerObject[] = [{
      id: 'results_polygon',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'fill',
      paint: {
        'fill-color': primary,
        'fill-opacity': selectedItem.value ? 0.1 : 0.4
      },
      filter: selectedItem.value ? ['all', polygonFilter, notSelectedItemFilter] : (singleItem ? ['all', polygonFilter, singleItemFilter] : polygonFilter)
    } as AddLayerObject, {
      id: 'results_polygon_outline',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'line',
      paint: {
        'line-color': primary,
        'line-opacity': selectedItem.value ? 0.2 : 0.7,
        'line-width': { stops: [[4, 0.5], [24, 3]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: selectedItem.value ? ['all', polygonFilter, notSelectedItemFilter] : (singleItem ? ['all', polygonFilter, singleItemFilter] : polygonFilter)
    } as AddLayerObject, {
      id: 'results_line',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'line',
      paint: {
        'line-color': primary,
        'line-opacity': selectedItem.value ? 0.2 : 0.8,
        'line-width': { stops: [[4, 1], [24, 6]] } as DataDrivenPropertyValueSpecification<number>
      },
      layout: {
        'line-cap': 'round',
        'line-join': 'round'
      },
      filter: selectedItem.value ? ['all', lineStringFilter, notSelectedItemFilter] : (singleItem ? ['all', lineStringFilter, singleItemFilter] : lineStringFilter)
    } as AddLayerObject, {
      id: 'results_point',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'circle',
      paint: {
        'circle-color': primary,
        'circle-opacity': selectedItem.value ? 0.2 : 0.8,
        'circle-radius': { stops: [[0, 1], [24, 16]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: selectedItem.value ? ['all', pointFilter, notSelectedItemFilter] : (singleItem ? ['all', pointFilter, singleItemFilter] : pointFilter)
    } as AddLayerObject]

    const selectedLayers: AddLayerObject[] = selectedItem.value
      ? [{
          id: 'results_polygon_selected',
          source: 'data-fair',
          'source-layer': 'results',
          type: 'fill',
          paint: {
            'fill-color': primary,
            'fill-opacity': 0.4
          },
          filter: ['all', polygonFilter, selectedItemFilter]
        }, {
          id: 'results_polygon_outline_selected',
          source: 'data-fair',
          'source-layer': 'results',
          type: 'line',
          paint: {
            'line-color': primary,
            'line-opacity': 0.7,
            'line-width': { stops: [[4, 0.5], [24, 3]] } as DataDrivenPropertyValueSpecification<number>
          },
          filter: ['all', polygonFilter, selectedItemFilter]
        }, {
          id: 'results_line_selected',
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
          filter: ['all', lineStringFilter, selectedItemFilter]
        }, {
          id: 'results_point_selected',
          source: 'data-fair',
          'source-layer': 'results',
          type: 'circle',
          paint: {
            'circle-color': primary,
            'circle-opacity': 0.8,
            'circle-radius': { stops: [[0, 1], [24, 16]] } as DataDrivenPropertyValueSpecification<number>
          },
          filter: ['all', pointFilter, selectedItemFilter]
        }]
      : []

    const hoverLayers: AddLayerObject[] = [{
      id: 'results_hover',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'line',
      paint: {
        'line-color': primary,
        'line-width': { stops: [[4, 1.5], [24, 9]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: singleItem ? singleItemFilter : ['==', '_id', '']
    }, {
      id: 'results_point_hover',
      source: 'data-fair',
      'source-layer': 'results',
      type: 'circle',
      paint: {
        'circle-color': primary,
        'circle-radius': { stops: [[0, 1.5], [24, 24]] } as DataDrivenPropertyValueSpecification<number>
      },
      filter: ['all', singleItem ? singleItemFilter : ['==', '_id', ''], pointFilter]
    }]

    return [...baseLayers, ...selectedLayers, ...hoverLayers]
  })

  return { style, dataLayers }
}
