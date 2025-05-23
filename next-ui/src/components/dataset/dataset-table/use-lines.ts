import { SchemaProperty } from '#api/types'
import { useWindowSize } from '@vueuse/core'
import { withQuery } from 'ufo'
import { useDisplay } from 'vuetify'
import truncateMiddle from 'truncate-middle'

export const useLines = (displayMode: Ref<string>, selectedCols: Ref<string[]>, q: Ref<string>) => {
  const { id, dataset, draftMode } = useDatasetStore()
  const { width: windowWidth } = useWindowSize()

  const display = useDisplay()
  const localeDayjs = useLocaleDayjs()

  const truncate = computed(() => {
    if (!selectedCols.value.length) return null
    if (displayMode.value === 'list') return 200
    const minTruncate = display.mdAndUp.value ? 50 : 40
    const maxTruncate = 200
    const estimatedTruncate = windowWidth.value / selectedCols.value.length / 8 // 8px is about a char's width
    const roundedTruncate = Math.round(estimatedTruncate / 20) * 20
    return Math.min(maxTruncate, Math.max(minTruncate, roundedTruncate))
  })
  const baseFetchUrl = computed(() => {
    if (truncate.value === null) return null
    return withQuery($apiPath + `/datasets/${id}/lines`, { draftMode, size: 20, truncate: truncate.value, q: q.value || undefined })
  })

  const total = ref<number>()
  const next = ref<string>()
  const results = ref<any[]>([])

  type Lines = { total: number, next?: string, results: any[] }
  let abortController: AbortController | undefined
  const fetchResults = useAsyncAction(async (reset?: boolean) => {
    if (!next.value) return
    abortController = new AbortController()
    // await new Promise(resolve => setTimeout(resolve, 2000))
    const data = await $fetch<Lines>(next.value)
    for (const result of data.results) {
      result.__formatted = {}
      for (const property of dataset.value?.schema ?? []) {
        result.__formatted[property.key] = formatValue(result[property.key], property, null, localeDayjs)
      }
    }
    if (reset) results.value = data.results.map(markRaw)
    else results.value.push(...data.results.map(markRaw))
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

  return { baseFetchUrl, total, results, fetchResults }
}

export const formatValue = (value: any, property: SchemaProperty, truncate: number | null = 50, localeDayjs: ReturnType<typeof useLocaleDayjs>): string => {
  if (Array.isArray(value)) return value.map(v => formatValue(v, property, truncate, localeDayjs)).join(', ')
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
