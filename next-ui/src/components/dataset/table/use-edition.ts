import { ExtendedResult } from '~/composables/dataset-lines'

export const useEdition = (baseFetchUrl: Ref<string | null>) => {
  const selectedResults = ref<ExtendedResult[]>([])

  watch(baseFetchUrl, () => {
    selectedResults.value = []
  })

  return {
    selectedResults
  }
}

export default useEdition
