import { ref, watch, type InjectionKey, inject, provide } from 'vue'
import { useRoute } from 'vue-router'

export interface BreadcrumbItem {
  text: string
  to?: string | { path: string; query?: Record<string, string> }
  exact?: boolean
}

const breadcrumbsKey: InjectionKey<ReturnType<typeof createBreadcrumbs>> = Symbol('breadcrumbs')

export function createBreadcrumbs () {
  const route = useRoute()
  const items = ref<BreadcrumbItem[]>([])
  const routeName = ref<string | null>(null)

  function receive (message: { breadcrumbs?: { text: string; to?: string }[] }) {
    if (!message.breadcrumbs) return
    items.value = message.breadcrumbs.map(b => ({
      ...b,
      exact: true,
      to: b.to ? { path: b.to } : undefined
    }))
    routeName.value = (route.name as string) ?? null
  }

  function clear () {
    items.value = []
    routeName.value = null
  }

  // Clear breadcrumbs when navigating to a different route
  watch(() => route.name, () => {
    clear()
  })

  return { items, routeName, receive, clear }
}

export function provideBreadcrumbs () {
  const breadcrumbs = createBreadcrumbs()
  provide(breadcrumbsKey, breadcrumbs)
  return breadcrumbs
}

export function useBreadcrumbs () {
  const breadcrumbs = inject(breadcrumbsKey)
  if (!breadcrumbs) throw new Error('useBreadcrumbs() called without provideBreadcrumbs()')
  return breadcrumbs
}
