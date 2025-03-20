import { } from '#api/types'

// we do not use SSR, so we can use a simple module level singleton
let store: ReturnType<typeof prepareDatasetStore> | undefined

type Dataset = Record<string, any>
  & Record<'schema', { type: string, format?: string, [key: string]: any }[]> // TODO

const prepareDatasetStore = (id: string) => {
  const datasetFetch = useFetch<Dataset>($apiPath + `/datasets/${id}`)
  const dataset = ref<Dataset | null>(null)
  watch(datasetFetch.data, () => { dataset.value = datasetFetch.data.value })

  return {
    id,
    dataset,
    datasetFetch
  }
}

export const createDatasetStore = (id: string) => {
  store = prepareDatasetStore(id)
  return store
}

export const useDatasetStore = () => {
  if (!store) throw new Error('dataset store was not initialized')
  return store
}

export default useDatasetStore
