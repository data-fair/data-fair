export type ViewMode = 'grid' | 'list'

// the /datasets and /applications catalogs remember their view per account, the other lists do not
export const useViewMode = (scope: string) => {
  const { account } = useSession()
  const key = computed(() => {
    const a = account.value
    return a ? `${a.type}:${a.id}:${scope}:render-mode` : `df-${scope}-view`
  })
  const viewMode = ref<ViewMode>(localStorage.getItem(key.value) === 'list' ? 'list' : 'grid')
  watch(viewMode, (v) => { localStorage.setItem(key.value, v) })
  return viewMode
}
