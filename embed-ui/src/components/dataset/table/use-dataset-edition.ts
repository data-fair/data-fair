import { ExtendedResult } from '~/composables/dataset-lines'

export type DatasetEdition = ReturnType<typeof createDatasetEdition>
const datasetEditionKey = Symbol('dataset-edition')

const createDatasetEdition = (baseFetchUrl: Ref<string | null>, indexedAt: Ref<string | undefined>) => {
  const { id, dataset } = useDatasetStore()
  const selectedResults = ref<ExtendedResult[]>([])

  watch(baseFetchUrl, () => {
    selectedResults.value = []
  })

  const saving = ref(false)
  const bulkLines = async (body: any) => {
    saving.value = true
    try {
      const res = await $fetch(`${$apiPath}/datasets/${id}/_bulk_lines`, { method: 'POST', body })
      if (res.indexedAt) indexedAt.value = res.indexedAt
    } finally {
      saving.value = false
    }
  }

  const saveLine = async (line: any, file?: File) => {
    if (!dataset.value?.schema) return
    saving.value = true
    try {
      const formData = new FormData()
      if (file) formData.append('attachment', file)
      const body: Record<string, any> = { }
      dataset.value.schema.filter(f => !f['x-calculated'] && !f['x-extension']).forEach(f => {
        if (line[f.key] !== null && line[f.key] !== undefined) body[f.key] = line[f.key]
      })

      if (line._id) {
        body._id = line._id
        body._action = 'update'
      } else {
        body._action = 'create'
      }
      formData.append('_body', JSON.stringify(body))
      const res = await $fetch(`/datasets/${id}/lines`, { method: 'POST', body: formData })
      indexedAt.value = res._updatedAt
    } finally {
      saving.value = false
    }
  }

  return {
    selectedResults,
    saving,
    bulkLines,
    saveLine
  }
}

export const provideDatasetEdition = (baseFetchUrl: Ref<string | null>, indexedAt: Ref<string | undefined>) => {
  const store = createDatasetEdition(baseFetchUrl, indexedAt)
  provide(datasetEditionKey, store)
  return store
}

export const useDatasetEdition = () => {
  const store = inject(datasetEditionKey) as DatasetEdition | undefined
  if (!store) throw new Error('dataset edition was not initialized')
  return store
}

export default useDatasetEdition
