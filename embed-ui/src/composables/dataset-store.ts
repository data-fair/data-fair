import { provide, inject } from 'vue'
import type { Event, Dataset } from '#api/types'
import { isRestDataset } from '#shared/types-utils'

type ExtendedDataset = Dataset & { userPermissions: string[], draftReason?: string }
export type TaskProgress = { task: string, progress: number, error?: string }

export type DatasetStore = ReturnType<typeof createDatasetStore>
export const datasetStoreKey = Symbol('dataset-store')

export const createDatasetStore = (id: string, draftMode?: boolean, html?: boolean) => {
  const datasetFetch = useFetch<ExtendedDataset>($apiPath + `/datasets/${id}`, { query: { draftMode, html } })
  const dataset = ref<ExtendedDataset | null>(null)
  watch(datasetFetch.data, () => { dataset.value = datasetFetch.data.value })
  const restDataset = computed(() => {
    if (dataset.value && isRestDataset(dataset.value)) return dataset.value
  })

  const journalFetch = useFetch<Event[]>($apiPath + `/datasets/${id}/journal`, { query: { draftMode }, immediate: false, watch: false })
  const journal = ref<Event[] | null>(null)
  watch(journalFetch.data, () => { journal.value = journalFetch.data.value })
  const lastError = computed(() => journal.value?.find(e => e.type === 'error'))

  const taskProgressFetch = useFetch<TaskProgress>($apiPath + `/datasets/${id}/task-progress`, { query: { draftMode }, immediate: false, watch: false })
  const taskProgress = ref<TaskProgress>()
  watch(taskProgressFetch.data, () => { taskProgress.value = taskProgressFetch.data.value?.task ? taskProgressFetch.data.value : undefined })

  const jsonSchemaFetch = useFetch<any>($apiPath + `/datasets/${id}/schema`, { query: { draftMode, mimeType: 'application/schema+json', extension: 'true', arrays: true }, immediate: false, watch: false })

  const imageProperty = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/image'))
  const labelField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))
  const descriptionField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/description'))
  const digitalDocumentField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument'))
  const webPageField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'https://schema.org/WebPage'))

  const canCache: Record<string, ComputedRef<boolean>> = {}
  const can = (operation: string) => {
    canCache[operation] = canCache[operation] ?? computed(() => dataset.value?.userPermissions.includes(operation))
    return canCache[operation]
  }

  return {
    id,
    draftMode,
    dataset,
    datasetFetch,
    restDataset,
    journalFetch,
    journal,
    lastError,
    taskProgressFetch,
    taskProgress,
    jsonSchemaFetch,
    imageProperty,
    labelField,
    descriptionField,
    digitalDocumentField,
    webPageField,
    can
  }
}

export const provideDatasetStore = (id: string, draftMode?: boolean, html?: boolean) => {
  const store = createDatasetStore(id, draftMode, html)
  provide(datasetStoreKey, store)
  return store
}

export const useDatasetStore = () => {
  const store = inject(datasetStoreKey) as DatasetStore | undefined
  if (!store) throw new Error('dataset store was not initialized')
  return store
}

export default useDatasetStore
