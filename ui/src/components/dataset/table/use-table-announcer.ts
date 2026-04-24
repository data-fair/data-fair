import { ref, watch, type Ref } from 'vue'

type SortRef = Ref<{ key: string, direction: 1 | -1 } | undefined>

export interface TableAnnouncerOptions {
  q: Ref<string>
  total: Ref<number | undefined>
  loading: Ref<boolean>
  sort: SortRef
  headerTitleFor: (key: string) => string
  t: (key: string, values?: Record<string, unknown>) => string
}

/**
 * Feed a single `aria-live` string from the table's reactive state so screen readers
 * restitute result count changes, sort changes and loading state (RGAA 7.5 / 7.1).
 * Debounced so that quick consecutive updates (search typing, fetch completion) do
 * not stack or fire mid-transition.
 */
export function useTableAnnouncer ({ q, total, loading, sort, headerTitleFor, t }: TableAnnouncerOptions) {
  const message = ref('')

  let timeout: ReturnType<typeof setTimeout> | undefined
  const announce = (msg: string) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => { message.value = msg }, 250)
  }

  watch([total, q], ([newTotal], [oldTotal]) => {
    if (loading.value) return
    if (newTotal === undefined) return
    if (q.value) {
      announce(t('announceSearchResults', { count: newTotal, query: q.value }))
    } else if (oldTotal !== undefined && newTotal !== oldTotal) {
      announce(t('announceResults', { count: newTotal }))
    }
  })

  watch(loading, (isLoading) => {
    if (isLoading) announce(t('announceLoading'))
  })

  watch(sort, (newSort) => {
    if (!newSort) return
    const direction = newSort.direction === 1 ? t('sortAscending') : t('sortDescending')
    announce(t('announceSort', { column: headerTitleFor(newSort.key), direction }))
  })

  return { message }
}
