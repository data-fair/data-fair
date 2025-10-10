// we do not use SSR, so we can use a simple module level singleton
let navigationStoreSingleton: ReturnType<typeof createNavigationStore>

function createNavigationStore () {
  const drawer = ref(true)
  const breadcrumbs = ref<{ title: string, to?: string }[]>([])
  const breadcrumbsRouteName = ref<string | null>(null)

  return {
    drawer,
    breadcrumbs,
    breadcrumbsRouteName
  }
}

export function useNavigationStore () {
  navigationStoreSingleton = navigationStoreSingleton ?? createNavigationStore()
  return navigationStoreSingleton
}
export default useNavigationStore
