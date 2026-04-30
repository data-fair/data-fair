import type { MaybeRefOrGetter } from 'vue'
import { type SchemaProperty } from '#api/types'
import type { ExtendedResult } from '../../../composables/dataset/lines'

export type SyntheticColumn = {
  key: string
  title: string
  titleHint?: string
  position?: 'first' | 'last'
  sticky?: boolean
  render: (row: ExtendedResult) => {
    text: string
    title?: string
    class?: string
  }
}

export type TableHeader = {
  key: string,
  cssKey?: string,
  title: string,
  tooltip?: string,
  filterable?: boolean,
  sortable?: boolean,
  property?: SchemaProperty,
  sticky?: boolean,
  synthetic?: SyntheticColumn
}

export type TableHeaderWithProperty = Omit<TableHeader, 'property'> & Required<Pick<TableHeader, 'property'>>

export const useHeaders = (
  selectedCols: Ref<string[]>,
  noInteraction: boolean,
  edit: boolean,
  selectable: boolean,
  fixed: Ref<string | undefined>,
  syntheticColumns?: MaybeRefOrGetter<SyntheticColumn[]>,
  headerKeys?: MaybeRefOrGetter<boolean>
) => {
  const { dataset, imageField, can } = useDatasetStore()
  const { vocabulary } = useStore()

  const headers = computed(() => {
    if (!dataset.value?.schema) return
    const useKeyAsTitle = toValue(headerKeys) === true
    let headers: TableHeader[] | undefined = dataset.value?.schema?.filter(p => selectedCols.value.includes(p.key)).map((p) => ({
      key: p.key,
      cssKey: p.key.replace(/\./g, '__'),
      title: useKeyAsTitle ? p.key : (p.title || p['x-originalName'] || p.key),
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
      if (imageField.value) {
        headers.unshift({ title: '', key: '_thumbnail' })
      }
      if (dataset.value?.bbox && !noInteraction) {
        headers.unshift({ title: '', key: '_map_preview' })
      }
      if (selectable || (edit && (can('updateLine') || can('deleteLine') || selectable))) {
        headers.unshift({ title: '', key: '_actions', sticky: true })
      } else if (fixed.value) {
        const fixedHeader = headers.find(h => h.key === fixed.value)
        if (fixedHeader) {
          fixedHeader.sticky = true
          headers = headers.filter(h => h !== fixedHeader)
          headers.unshift(fixedHeader)
        }
      }
      const synth = toValue(syntheticColumns)
      if (synth && synth.length) {
        for (const col of synth) {
          const header: TableHeader = {
            key: col.key,
            cssKey: col.key.replace(/\./g, '__'),
            title: col.title,
            tooltip: col.titleHint,
            sticky: col.sticky,
            synthetic: col
          }
          if (col.position === 'first') headers.unshift(header)
          else headers.push(header)
        }
      }
    }
    return headers
  })

  const headersWithProperty = computed(() => {
    return headers.value?.filter(h => !!h.property) as TableHeaderWithProperty[]
  })

  return {
    headers,
    headersWithProperty
  }
}

export default useHeaders
