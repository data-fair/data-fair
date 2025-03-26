import type { Event } from '#api/types'

// we do not use SSR, so we can use a simple module level singleton
let store: ReturnType<typeof prepareDatasetStore> | undefined

type Dataset = Record<string, any>
  & Record<'schema', { type: string, format?: string, [key: string]: any }[]> // TODO

const prepareDatasetStore = (id: string, draftMode: boolean | undefined = undefined) => {
  const datasetFetch = useFetch<Dataset>($apiPath + `/datasets/${id}`)
  const dataset = ref<Dataset | null>(null)
  watch(datasetFetch.data, () => { dataset.value = datasetFetch.data.value })

  const journalFetch = useFetch<Event[]>($apiPath + `/datasets/${id}/journal`, { query: { draftMode }, immediate: false, watch: false })
  const journal = ref<Event[] | null>(null)
  watch(journalFetch.data, () => { journal.value = journalFetch.data.value })

  return {
    id,
    dataset,
    datasetFetch,
    journalFetch,
    journal
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
