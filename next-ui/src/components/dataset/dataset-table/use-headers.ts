import { useCurrentElement } from '@vueuse/core'

export const useHeaders = (selectedCols: Ref<string[]>, baseFetchUrl: Ref<string | null>, results: Ref<any[]>) => {
  const { dataset } = useDatasetStore()

  const headers = computed(() => {
    return dataset.value?.schema?.filter(p => selectedCols.value.includes(p.key)).map((p, i) => ({
      key: p.key,
      title: p.title || p['x-originalName'] || p.key,
      nowrap: true,
      minWidth: headerWidths.value[i] ?? 50
    }))
  })

  const headerWidths = ref<number[]>([])
  const element = useCurrentElement()
  watch(baseFetchUrl, () => {
    if (!baseFetchUrl.value) return
    headerWidths.value = []
  })
  watch(results, async () => {
    // we let the table auto-adjust column sizes, bu we prevent downsizing to improve stability
    if (!(element.value instanceof HTMLElement)) return
    element.value.querySelectorAll('.v-data-table__th').forEach((h, i) => {
      // console.log('H', h.clientWidth)
      headerWidths.value[i] = Math.max((headerWidths.value[i] ?? 50), h.clientWidth)
    })
  }, { deep: true })

  return { headers }
}

export default useHeaders
