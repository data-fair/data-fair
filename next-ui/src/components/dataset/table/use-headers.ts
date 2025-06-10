import { type SchemaProperty } from '#api/types'

export type TableHeader = {
  key: string,
  title: string,
  tooltip?: string,
  filterable?: boolean,
  sortable?: boolean,
  property?: SchemaProperty,
  sticky?: boolean
}

export type TableHeaderWithProperty = Omit<TableHeader, 'property'> & Required<Pick<TableHeader, 'property'>>

export const useHeaders = (selectedCols: Ref<string[]>, noInteraction: boolean, edit: boolean, fixed: Ref<string | undefined>) => {
  const { dataset, imageProperty, can } = useDatasetStore()
  const { vocabulary } = useStore()

  const headers = computed(() => {
    if (!dataset.value?.schema) return
    let headers: TableHeader[] | undefined = dataset.value?.schema?.filter(p => selectedCols.value.includes(p.key)).map((p) => ({
      key: p.key,
      title: p.title || p['x-originalName'] || p.key,
      sortable:
        (!p['x-capabilities'] || p['x-capabilities'].values !== false) && (
          (p.type === 'string' && p['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry') ||
          p.type === 'number' ||
          p.type === 'integer'
        ),
      tooltip: p.description || (p['x-refersTo'] && vocabulary.value?.[p['x-refersTo']]?.description) || undefined,
      // nowrap: true,
      property: p
    }))
    if (headers) {
      if (imageProperty.value) {
        headers.unshift({ title: '', key: '_thumbnail' })
      }
      if (dataset.value?.bbox && !noInteraction) {
        headers.unshift({ title: '', key: '_map_preview' })
      }
      if (edit && (can('updateLine') || can('deleteLine'))) {
        headers.unshift({ title: '', key: '_actions', sticky: true })
      } else if (fixed.value) {
        const fixedHeader = headers.find(h => h.key === fixed.value)
        if (fixedHeader) {
          fixedHeader.sticky = true
          headers = headers.filter(h => h !== fixedHeader)
          headers.unshift(fixedHeader)
        }
      }
    }
    return headers
  })

  const headersWithProperty = computed(() => {
    return headers.value?.filter(h => !!h.property) as TableHeaderWithProperty[]
  })

  const hideHeader = (header: TableHeader) => {
    if (!selectedCols.value.length) selectedCols.value = dataset.value?.schema?.map(p => p.key) ?? []
    selectedCols.value = selectedCols.value.filter(sc => sc !== header.key)
  }
  return {
    headers,
    headersWithProperty,
    hideHeader
  }
}

export default useHeaders
