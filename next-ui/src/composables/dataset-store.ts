import type { Event, Dataset } from '#api/types'
import { isRestDataset } from '#shared/types-utils'

type ExtendedDataset = Dataset & { userPermissions: string[] }

// we do not use SSR, so we can use a simple module level singleton
let store: ReturnType<typeof prepareDatasetStore> | undefined

const prepareDatasetStore = (id: string, draftMode: boolean | undefined = undefined) => {
  const datasetFetch = useFetch<ExtendedDataset>($apiPath + `/datasets/${id}`)
  const dataset = ref<ExtendedDataset | null>(null)
  watch(datasetFetch.data, () => { dataset.value = datasetFetch.data.value })
  const restDataset = computed(() => {
    if (dataset.value && isRestDataset(dataset.value)) return dataset.value
  })

  const journalFetch = useFetch<Event[]>($apiPath + `/datasets/${id}/journal`, { query: { draftMode }, immediate: false, watch: false })
  const journal = ref<Event[] | null>(null)
  watch(journalFetch.data, () => { journal.value = journalFetch.data.value })

  const jsonSchemaFetch = useFetch<any>($apiPath + `/datasets/${id}/schema`, { query: { draftMode, mimeType: 'application/schema+json', extension: 'true' }, immediate: false, watch: false })

  return {
    id,
    dataset,
    datasetFetch,
    restDataset,
    journalFetch,
    journal,
    jsonSchemaFetch
  }
}

export const createDatasetStore = (id: string, draftMode: boolean | undefined = undefined) => {
  store = prepareDatasetStore(id, draftMode)
  return store
}

export const useDatasetStore = () => {
  if (!store) throw new Error('dataset store was not initialized')
  return store
}

export default useDatasetStore
