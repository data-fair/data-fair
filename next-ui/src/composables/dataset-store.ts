import { provide, inject } from 'vue'
import type { Event, Dataset } from '#api/types'
import { isRestDataset } from '#shared/types-utils'

type ExtendedDataset = Dataset & { userPermissions: string[] }

// we do not use SSR, so we can use a simple module level singleton
export type DatasetStore = ReturnType<typeof createDatasetStore>
const datasetStoreKey = Symbol('dataset-store')

const createDatasetStore = (id: string, draftMode: boolean | undefined = undefined) => {
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
    draftMode,
    dataset,
    datasetFetch,
    restDataset,
    journalFetch,
    journal,
    jsonSchemaFetch
  }
}

export const provideDatasetStore = (id: string, draftMode: boolean | undefined = undefined) => {
  const store = createDatasetStore(id, draftMode)
  provide(datasetStoreKey, store)
  return store
}

export const useDatasetStore = () => {
  const store = inject(datasetStoreKey) as DatasetStore | undefined
  if (!store) throw new Error('dataset store was not initialized')
  return store
}

export default useDatasetStore
