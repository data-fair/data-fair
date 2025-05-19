export const useHeaders = (selectedCols: Ref<string[]>) => {
  const { dataset } = useDatasetStore()

  const headers = computed(() => {
    return dataset.value?.schema?.filter(p => selectedCols.value.includes(p.key)).map((p, i) => ({
      key: p.key,
      title: p.title || p['x-originalName'] || p.key,
      nowrap: true,
    }))
  })
  return { headers }
}

export default useHeaders
