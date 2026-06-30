import { ref, watch, type Ref } from 'vue'
import { type DatasetFilter } from '~/composables/dataset/filters'

type SortRef = Ref<{ key: string, direction: 1 | -1 } | undefined>

export interface TableAnnouncerOptions {
  q: Ref<string>
  total: Ref<number | undefined>
  loading: Ref<boolean>
  sort: SortRef
  displayMode: Ref<string | undefined>
  cols: Ref<string[]>
  allCols: Ref<string[]>
  fixed: Ref<string | undefined>
  filters: Ref<DatasetFilter[]>
  headerTitleFor: (key: string) => string
  displayModeLabelFor: (mode: string) => string
  t: (key: string, values?: Record<string, unknown>, plural?: number) => string
}

/**
 * Feed a single `aria-live` string from the table's reactive state so screen readers
 * restitute result count, sort, display-mode, column visibility, column pinning
 * and filter changes (RGAA 7.5 / 7.1). Debounced so quick consecutive updates
 * collapse into the latest message.
 *
 * State-tracking watchers swallow the first emission (URL/preferences hydration
 * during component setup) so screen-reader users aren't told they "just"
 * applied filters or pinned columns that were already part of the deep link.
 */
export function useTableAnnouncer ({ q, total, loading, sort, displayMode, cols, allCols, fixed, filters, headerTitleFor, displayModeLabelFor, t }: TableAnnouncerOptions) {
  const message = ref('')

  let timeout: ReturnType<typeof setTimeout> | undefined
  const announce = (msg: string) => {
    if (timeout) clearTimeout(timeout)
    timeout = setTimeout(() => { message.value = msg }, 250)
  }

  // De-duplicate by the (total, q) settled state so spurious loading flips
  // — e.g. v-intersect re-binding on every render calling fetchResults.execute()
  // for an already-fully-loaded page — do not clobber the debounced announce.
  let lastKey = ''
  watch([total, q, loading], ([newTotal, newQ, isLoading]) => {
    if (isLoading) return
    if (newTotal === undefined) return
    const key = `${newTotal}|${newQ}`
    if (key === lastKey) return
    lastKey = key
    // vue-i18n pipe-pluralization requires the count as the 3rd positional arg.
    if (newQ) {
      announce(t('announce.searchResults', { count: newTotal, query: newQ }, newTotal))
    } else {
      announce(t('announce.results', { count: newTotal }, newTotal))
    }
  }, { immediate: true })

  let sortInitialized = false
  watch(sort, (newSort) => {
    if (!sortInitialized) {
      sortInitialized = true
      return
    }
    if (!newSort) {
      announce(t('announce.sortRemoved'))
      return
    }
    const direction = newSort.direction === 1 ? t('sortDirection.ascending') : t('sortDirection.descending')
    announce(t('announce.sort', { column: headerTitleFor(newSort.key), direction }))
  }, { immediate: true })

  watch(displayMode, (newMode, oldMode) => {
    if (!newMode || !oldMode || newMode === oldMode) return
    announce(t('announce.display', { mode: displayModeLabelFor(newMode) }))
  })

  // Track effective visible columns to announce hide/show. Seed `prevCols`
  // from the steady state — wait for a non-empty set so the asynchronous
  // schema hydration (`allCols` going from [] to [...kN]) isn't mistaken for
  // a user-driven display change.
  const effectiveCols = () => (cols.value.length ? cols.value : allCols.value)
  let prevCols: string[] | undefined
  watch([cols, allCols], () => {
    const next = effectiveCols()
    if (!prevCols) {
      if (next.length) prevCols = next
      return
    }
    if (!prevCols.length && next.length) {
      // First population once the schema arrives — initial hydration, not a user action.
      prevCols = next
      return
    }
    const removed = prevCols.filter(c => !next.includes(c))
    const added = next.filter(c => !prevCols!.includes(c))
    prevCols = next
    if (removed.length === 1 && !added.length) {
      announce(t('announce.column.hidden', { column: headerTitleFor(removed[0]) }))
    } else if (added.length === 1 && !removed.length) {
      announce(t('announce.column.shown', { column: headerTitleFor(added[0]) }))
    } else if (removed.length || added.length) {
      announce(t('announce.column.changed', { count: next.length }, next.length))
    }
  }, { immediate: true })

  let fixedInitialized = false
  let prevFixed: string | undefined
  watch(fixed, (newFixed) => {
    if (!fixedInitialized) {
      fixedInitialized = true
      prevFixed = newFixed
      return
    }
    if (newFixed && newFixed !== prevFixed) {
      announce(t('announce.column.fixed', { column: headerTitleFor(newFixed) }))
    } else if (!newFixed && prevFixed) {
      announce(t('announce.column.unfixed', { column: headerTitleFor(prevFixed) }))
    }
    prevFixed = newFixed
  }, { immediate: true })

  // Track filter state. We compare on a serialized signature so identity-only
  // changes (e.g. array reassignment by useFilters during hydration) do not
  // trigger announcements. Skip the first emission to swallow the synchronous
  // URL → filters hydration done by useFilters' `immediate: true` watcher.
  const filterKey = (f: DatasetFilter) => `${f.property.key}|${f.operator}|${f.value}`
  let prevFilters: DatasetFilter[] = []
  let filtersInitialized = false
  watch(filters, (newFilters) => {
    if (!filtersInitialized) {
      filtersInitialized = true
      prevFilters = [...newFilters]
      return
    }
    const prevKeys = prevFilters.map(filterKey)
    const nextKeys = newFilters.map(filterKey)
    if (prevKeys.join(',') === nextKeys.join(',')) return
    const added = newFilters.find(f => !prevKeys.includes(filterKey(f)))
    const removed = prevFilters.find(f => !nextKeys.includes(filterKey(f)))
    prevFilters = [...newFilters]
    if (added) {
      announce(t('announce.filter.added', {
        column: headerTitleFor(added.property.key),
        value: added.formattedValue ?? added.value
      }))
    } else if (removed) {
      announce(t('announce.filter.removed', {
        column: headerTitleFor(removed.property.key)
      }))
    }
  }, { deep: true, immediate: true })

  return { message }
}
