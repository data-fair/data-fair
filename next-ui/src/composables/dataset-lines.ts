import { SchemaProperty } from '#api/types'
import { useWindowSize } from '@vueuse/core'
import { withQuery } from 'ufo'
import { useDisplay } from 'vuetify'
import truncateMiddle from 'truncate-middle'

export type ExtendedResultValue = {
  raw: number | boolean | string,
  formatted: string,
  filterable: boolean,
  displayDetail: boolean
}
export type ExtendedResult = {
  _id: string,
  _thumbnail?: string,
  _geopoint?: object,
  _owner?: string,
  values: Record<string, ExtendedResultValue | ExtendedResultValue[]>
}

export const useLines = (displayMode: Ref<string>, selectedCols: Ref<string[]>, q: Ref<string>, sort: Ref<string | undefined>, extraParams: Ref<Record<string, string>>) => {
  const { id, dataset, draftMode } = useDatasetStore()
  const { width: windowWidth } = useWindowSize()

  const display = useDisplay()
  const localeDayjs = useLocaleDayjs()

  const truncate = computed(() => {
    if (!selectedCols.value.length) return 200
    if (displayMode.value === 'list') return 200
    const minTruncate = display.mdAndUp.value ? 50 : 40
    const maxTruncate = 200
    const estimatedTruncate = windowWidth.value / selectedCols.value.length / 8 // 8px is about a char's width
    const roundedTruncate = Math.round(estimatedTruncate / 20) * 20
    let truncate = Math.min(maxTruncate, Math.max(minTruncate, roundedTruncate))
    if (displayMode.value === 'table-dense') truncate -= 10
    return truncate
  })
  const baseFetchUrl = computed(() => {
    if (!dataset.value?.schema) return null
    if (truncate.value === null) return null
    return withQuery($apiPath + `/datasets/${id}/lines`, { draftMode, size: 20, truncate: truncate.value, q: q.value || undefined, sort: sort.value || undefined, ...extraParams.value })
  })

  const total = ref<number>()
  const next = ref<string>()
  const results = ref<ExtendedResult[]>([])

  type Lines = { total: number, next?: string, results: any[] }
  let abortController: AbortController | undefined
  const fetchResults = useAsyncAction(async (reset?: boolean) => {
    if (!next.value) return
    abortController = new AbortController()
    // await new Promise(resolve => setTimeout(resolve, 2000))
    const data = await $fetch<Lines>(next.value)
    const extendedResults = []
    for (const raw of data.results) {
      const extendedResult: ExtendedResult = {
        _id: raw._id,
        _thumbnail: raw._thumbnail,
        _geopoint: raw._geopoint,
        _owner: raw._owner,
        values: {}
      }
      // TODO: preserve non property value ? like _thumbnail, etc.
      for (const property of dataset.value?.schema ?? []) {
        if (property.separator) {
          const values = raw[property.key]?.split(property.separator).map((v: string) => v.trim()) ?? []
          extendedResult.values[property.key] = values.map((v: any) => prepareExtendedResultValue(v, property, truncate.value, localeDayjs))
        } else {
          const extendedValue = prepareExtendedResultValue(raw[property.key], property, truncate.value, localeDayjs)
          if (property['x-refersTo'] === 'http://schema.org/DigitalDocument') {
            if (raw._attachment_url) {
              extendedValue.raw = raw._attachment_url
              extendedValue.formatted = truncateMiddle(raw._attachment_url.split('/').pop(), truncate.value - 4, 4)
            } else if (raw[property.key]) {
              extendedValue.formatted = truncateMiddle(raw[property.key], truncate.value - 10, 10)
            }
          }
          if (property.key === '_updatedByName' && raw._updatedBy && !raw._updatedBy.startsWith('apiKey:')) {
            extendedValue.formatted = `${$sdUrl}/api/avatars/user/${raw._updatedBy}/avatar.png`
          }
          if (property['x-refersTo'] === 'https://github.com/data-fair/lib/account' && raw[property.key]) {
            extendedValue.formatted = `${$sdUrl}/api/avatars/${raw[property.key].split(':').join('/')}/avatar.png`
          }

          extendedResult.values[property.key] = extendedValue
        }
      }
      extendedResults.push(extendedResult)
    }
    if (reset) results.value = extendedResults.map(markRaw)
    else results.value.push(...extendedResults.map(markRaw))
    next.value = data.next
    total.value = data.total
  })

  const reset = () => {
    if (!baseFetchUrl.value) return
    next.value = baseFetchUrl.value
    if (abortController) abortController.abort()
    fetchResults.execute(true)
  }
  watch(baseFetchUrl, reset, { immediate: true })

  return { baseFetchUrl, total, results, fetchResults, truncate }
}

const prepareExtendedResultValue = (value: any, property: SchemaProperty, truncate: number = 50, localeDayjs: ReturnType<typeof useLocaleDayjs>): ExtendedResultValue => {
  return {
    raw: value,
    formatted: formatValue(value, property, null, localeDayjs),
    displayDetail: shouldDisplayDetail(value, property, truncate),
    filterable: isFilterable(value, property)
  }
}

const shouldDisplayDetail = (value: any, property: SchemaProperty, truncate: number): boolean => {
  if (property['x-refersTo'] === 'http://schema.org/DigitalDocument') return false
  if (property['x-refersTo'] === 'https://schema.org/WebPage') return false
  return property.type === 'string' && !property.separator && value && truncate < value.length
}

const isFilterable = (value: any, property: SchemaProperty): boolean => {
  if (property['x-capabilities'] && property['x-capabilities'].index === false) return false
  if (property['x-refersTo'] === 'https://purl.org/geojson/vocab#geometry') return false
  if (value === undefined || value === null || value === '') return false
  if (typeof value === 'string' && (value.length > 200 || value.startsWith('{'))) return false
  return true
}

export const formatValue = (value: any, property: SchemaProperty, truncate: number | null = 50, localeDayjs: ReturnType<typeof useLocaleDayjs>): string => {
  if (value === undefined || value === null) return ''
  if (property['x-labels'] && property['x-labels']['' + value]) return property['x-labels']['' + value] as string
  if (property.format === 'date-time') {
    return localeDayjs.dayjs(value).format('lll')
    // TODO: test this and recreate the functionality if needed
    // we use parseZone to show the data in the originally stored timezone
    // return moment.parseZone(value).format('lll')
  }
  if (property.format === 'date') {
    return localeDayjs.dayjs(value).format('L')
  }
  if (property.type === 'boolean') {
    if (typeof value === 'string') return value === 'true' ? 'oui' : 'non'
    return value ? 'oui' : 'non'
  }
  if (property.type === 'number' || property.type === 'integer') return value.toLocaleString()
  if (truncate) return truncateMiddle(value + '', truncate, 0, '...')
  return value
}

export default useLines
