import type { Ref, ComputedRef, MaybeRefOrGetter } from 'vue'

type FacetValue = { count: number, value: string }
type CatalogResponse<T> = { count: number, results: T[], facets?: Record<string, FacetValue[]> }

interface UseCatalogListOptions {
  fetchUrl: ComputedRef<string>
  query: ComputedRef<Record<string, string | number | boolean | undefined>>
  facetsFields: string
  pageSize?: MaybeRefOrGetter<number>
}

export function useCatalogList<T> (options: UseCatalogListOptions) {
  const { fetchUrl, query, facetsFields, pageSize = 20 } = options

  const displayedItems = ref<T[]>([]) as Ref<T[]>
  const currentPage = ref(1)
  const totalCount = ref(0)
  const facets = ref<Record<string, FacetValue[]>>({}) as Ref<Record<string, FacetValue[]>>
  const loading = ref(false)
  let resetVersion = 0

  const hasMore = computed(() => displayedItems.value.length < totalCount.value)

  // Build full query with pagination, facets only on page 1
  const fullQuery = computed(() => {
    const q: Record<string, string | number | boolean | undefined> = {
      ...query.value,
      size: toValue(pageSize),
      page: currentPage.value,
    }
    if (currentPage.value === 1) {
      q.facets = facetsFields
    }
    return q
  })

  const catalogFetch = useFetch<CatalogResponse<T>>(fetchUrl, { query: fullQuery, watch: false, immediate: false })

  // Auto-fill: if the viewport isn't filled after loading, load more
  const autoFillPage = async () => {
    await nextTick()
    await nextTick()
    const el = document.documentElement
    if (el.clientHeight >= el.scrollHeight - 200 && hasMore.value && !loading.value) {
      await loadMore()
      await autoFillPage()
    }
  }

  const reset = async () => {
    const version = ++resetVersion
    currentPage.value = 1
    await catalogFetch.refresh()
    if (version !== resetVersion) return // stale reset, discard
    if (catalogFetch.data.value) {
      displayedItems.value = [...catalogFetch.data.value.results]
      totalCount.value = catalogFetch.data.value.count
      if (catalogFetch.data.value.facets) {
        facets.value = catalogFetch.data.value.facets
      }
    }
    await autoFillPage()
  }

  const loadMore = async () => {
    if (loading.value || !hasMore.value) return
    loading.value = true
    const version = resetVersion
    currentPage.value++
    await catalogFetch.refresh()
    if (version !== resetVersion) { loading.value = false; return }
    if (catalogFetch.data.value) {
      displayedItems.value.push(...catalogFetch.data.value.results)
      totalCount.value = catalogFetch.data.value.count
    }
    loading.value = false
  }

  // Watch query changes (excluding page) to reset
  watch(query, () => { reset() })

  // Initial load
  onMounted(() => { reset() })

  return {
    displayedItems,
    loading: computed(() => catalogFetch.loading.value || loading.value),
    totalCount,
    hasMore,
    facets,
    loadMore,
    reset,
    initialized: catalogFetch.initialized,
    error: catalogFetch.error,
  }
}
