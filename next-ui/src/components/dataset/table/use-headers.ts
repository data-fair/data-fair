import { type SchemaProperty } from '#api/types'

export type TableHeader = {
  key: string,
  title: string,
  tooltip?: string,
  filterable?: boolean,
  sortable?: boolean,
  property?: SchemaProperty
}

export const useHeaders = (selectedCols: Ref<string[]>, noInteraction: boolean) => {
  const { dataset, imageProperty } = useDatasetStore()
  const { vocabulary } = useStore()

  const headers = computed(() => {
    const headers: TableHeader[] | undefined = dataset.value?.schema?.filter(p => selectedCols.value.includes(p.key)).map((p, i) => ({
      key: p.key,
      title: p.title || p['x-originalName'] || p.key,
      sortable:
        (!p['x-capabilities'] || p['x-capabilities'].values !== false) && (
          (p.type === 'string' && p['x-refersTo'] !== 'https://purl.org/geojson/vocab#geometry') ||
          p.type === 'number' ||
          p.type === 'integer'
        ),
      tooltip: p.description || (p['x-refersTo'] && vocabulary.value?.[p['x-refersTo']]?.description),
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
    }
    return headers
  })

  const hideHeader = (header: TableHeader) => {
    if (!selectedCols.value.length) selectedCols.value = dataset.value?.schema?.map(p => p.key)
    selectedCols.value = selectedCols.value.filter(sc => sc !== header.key)
  }
  return { headers, hideHeader }
}

export default useHeaders
