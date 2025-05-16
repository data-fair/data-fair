import { withQuery } from 'ufo'

export const useLines = () => {
  const { id, draftMode } = useDatasetStore()

  const total = ref<number>()
  const next = ref<string>()
  const results = ref<any[]>([])

  type Lines = { total: number, next?: string, results: any[] }
  let abortController: AbortController | undefined
  const fetchResults = useAsyncAction(async () => {
    if (!next.value) return
    abortController = new AbortController()
    const data = await $fetch<Lines>(next.value)
    results.value.push(...data.results.map(markRaw))
    next.value = data.next
    total.value = data.total
  })

  const reset = () => {
    next.value = withQuery($apiPath + `/datasets/${id}/lines`, { draftMode })
    total.value = undefined
    if (abortController) abortController.abort()
    fetchResults.execute()
  }
  reset()

  return { results, fetchResults, reset }
}

export default useLines
