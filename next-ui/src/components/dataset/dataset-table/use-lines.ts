import { useWindowSize } from '@vueuse/core'
import { withQuery } from 'ufo'
import { useDisplay } from 'vuetify'

export const useLines = (displayMode: Ref<string>, selectedCols: Ref<string[]>) => {
  const { id, draftMode } = useDatasetStore()
  const { width: windowWidth } = useWindowSize()
  const display = useDisplay()

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
    return withQuery($apiPath + `/datasets/${id}/lines`, { draftMode, size: 20, truncate: truncate.value })
  })

  const total = ref<number>()
  const next = ref<string>()
  const results = ref<any[]>([])

  type Lines = { total: number, next?: string, results: any[] }
  let abortController: AbortController | undefined
  const fetchResults = useAsyncAction(async (reset?: boolean) => {
    if (!next.value) return
    abortController = new AbortController()
    const data = await $fetch<Lines>(next.value)
    if (reset) results.value = data.results.map(markRaw)
    else results.value.push(...data.results.map(markRaw))
    next.value = data.next
    total.value = data.total
  })

  const reset = () => {
    if (!baseFetchUrl.value) return
    next.value = baseFetchUrl.value
    total.value = undefined
    if (abortController) abortController.abort()
    fetchResults.execute(true)
  }
  watch(baseFetchUrl, reset, { immediate: true })

  return { baseFetchUrl, results, fetchResults }
}

export default useLines
