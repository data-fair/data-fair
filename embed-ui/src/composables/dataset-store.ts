import { provide, inject } from 'vue'
import type { Event, Dataset } from '#api/types'
import { isRestDataset } from '#shared/types-utils'
import type { PatchDatasetReq } from '#api-doc/datasets/patch-req/index.js'

type ExtendedDataset = Dataset & { userPermissions: string[], draftReason?: string }
export type TaskProgress = { task: string, progress: number, error?: string }

export type DatasetStore = ReturnType<typeof createDatasetStore>
export const datasetStoreKey = Symbol('dataset-store')

export const createDatasetStore = (id: string, draft?: boolean, html?: boolean) => {
  // manage case of application key prefixed to dataset id in embed page
  const keys = id.split(':')
  if (keys.length > 1) id = keys[1]

  const datasetFetch = useFetch<ExtendedDataset>($apiPath + `/datasets/${id}`, { query: { draft, html } })
  const dataset = ref<ExtendedDataset | null>(null)
  watch(datasetFetch.data, () => { dataset.value = datasetFetch.data.value })
  const restDataset = computed(() => {
    if (dataset.value && isRestDataset(dataset.value)) return dataset.value
  })

  const journalFetch = useFetch<Event[]>($apiPath + `/datasets/${id}/journal`, { query: { draft }, immediate: false, watch: false })
  const journal = ref<Event[] | null>(null)
  watch(journalFetch.data, () => { journal.value = journalFetch.data.value })
  const lastError = computed(() => journal.value?.find(e => e.type === 'error'))

  const taskProgressFetch = useFetch<TaskProgress>($apiPath + `/datasets/${id}/task-progress`, { query: { draft }, immediate: false, watch: false })
  const taskProgress = ref<TaskProgress>()
  watch(taskProgressFetch.data, () => { taskProgress.value = taskProgressFetch.data.value?.task ? taskProgressFetch.data.value : undefined })

  const jsonSchemaFetch = useFetch<any>($apiPath + `/datasets/${id}/schema`, { query: { draft, mimeType: 'application/schema+json', extension: 'true', arrays: true }, immediate: false, watch: false })

  const imageField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/image'))
  const labelField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://www.w3.org/2000/01/rdf-schema#label'))
  const descriptionField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/description'))
  const digitalDocumentField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'http://schema.org/DigitalDocument'))
  const webPageField = computed(() => dataset.value?.schema?.find(f => f['x-refersTo'] === 'https://schema.org/WebPage'))

  const canCache: Record<string, ComputedRef<boolean>> = {}
  const can = (operation: string) => {
    canCache[operation] = canCache[operation] ?? computed(() => dataset.value?.userPermissions.includes(operation))
    return canCache[operation]
  }

  const patchDataset = useAsyncAction(async (patch: PatchDatasetReq['body']) => {
    const patchedDataset = await $fetch<ExtendedDataset>(`datasets/${id}`, { method: 'PATCH', body: patch })
    dataset.value = patchedDataset
  })

  return {
    id,
    draft,
    dataset,
    datasetFetch,
    restDataset,
    journalFetch,
    journal,
    lastError,
    taskProgressFetch,
    taskProgress,
    jsonSchemaFetch,
    imageField,
    labelField,
    descriptionField,
    digitalDocumentField,
    webPageField,
    can,
    patchDataset
  }
}

export const provideDatasetStore = (id: string, draft?: boolean, html?: boolean) => {
  const store = createDatasetStore(id, draft, html)
  provide(datasetStoreKey, store)
  return store
}

export const useDatasetStore = () => {
  const store = inject(datasetStoreKey) as DatasetStore | undefined
  if (!store) throw new Error('dataset store was not initialized')
  return store
}

export default useDatasetStore
