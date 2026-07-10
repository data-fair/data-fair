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

// transform a schema key into a string usable in a CSS selector (id/class/activator) ;
// keys can contain dots but also slashes, accents, spaces, etc. that would break querySelector
const toCssKey = (key: string) => key.replace(/[^a-zA-Z0-9_-]/g, '__')

// the calculated columns the table shows and lets the user pick ; the others are internals (_id, _i,
// _rand, _geopoint...) or the _*Name companions of _updatedBy / _owner, whose readable name is already
// displayed in the tooltip of the account avatar
export const visibleCalculatedCols = ['_updatedAt', '_updatedBy', '_owner']
export const isVisibleCol = (property: SchemaProperty) => !property['x-calculated'] || visibleCalculatedCols.includes(property.key)

export const useHeaders = (
  selectedCols: Ref<string[]>,
  noInteraction: boolean,
  edit: boolean,
  selectable: boolean,
  fixed: Ref<string | undefined>,
  syntheticColumns?: MaybeRefOrGetter<SyntheticColumn[]>,
  headerKeys?: MaybeRefOrGetter<boolean>,
  // shorter labels for some columns, whose schema title describes the data rather than reading well as
  // a header ; keyed by column key, they never leave the table (the schema itself is untouched)
  titleOverrides?: MaybeRefOrGetter<Record<string, string>>
) => {
  const { dataset, imageField, can } = useDatasetStore()
  const { vocabulary } = useStore()

  const headers = computed(() => {
    if (!dataset.value?.schema) return
    const useKeyAsTitle = toValue(headerKeys) === true
    const overrides = toValue(titleOverrides)
    const headerTitle = (p: SchemaProperty) => {
      if (useKeyAsTitle) return p.key
      if (overrides && Object.hasOwn(overrides, p.key)) return overrides[p.key]
      return p.title || p['x-originalName'] || p.key
    }
    let headers: TableHeader[] | undefined = dataset.value?.schema?.filter(p => selectedCols.value.includes(p.key)).map((p) => ({
      key: p.key,
      cssKey: toCssKey(p.key),
      title: headerTitle(p),
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
      // the _actions column hosts the per-row edit/delete buttons and the add-line button (single-line
      // write permissions) as well as the bulk selection checkboxes (bulkLines). Show it as soon as the
      // user holds any of these permissions; each button inside is then gated on its own permission.
      const canEditLines = edit && (can('bulkLines').value || can('createLine').value || can('updateLine').value || can('deleteLine').value)
      if (selectable || canEditLines) {
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
            cssKey: toCssKey(col.key),
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
