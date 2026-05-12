import { type RestActionsSummary } from '#api/types'
import { ExtendedResult } from '~/composables/dataset/lines'

export type DatasetEdition = ReturnType<typeof createDatasetEdition>
const datasetEditionKey = Symbol('dataset-edition')

const createDatasetEdition = (baseFetchUrl: Ref<string | null>, indexedAt: Ref<string | undefined>) => {
  const { id, dataset } = useDatasetStore()
  const selectedResults = ref<ExtendedResult[]>([])

  watch(baseFetchUrl, () => {
    selectedResults.value = []
  })

  const addLineTrigger = ref(false)
  const saving = ref(false)
  // performs a _bulk_lines request and returns the operations summary.
  // per-line failures are reported in the summary (summary.nbErrors / summary.errors), not thrown — it
  // is up to the caller to display them (see dataset-rest-actions-summary). Genuine request errors
  // (permissions, malformed request, oversize+mandatory-extension…) are still thrown.
  const bulkLines = async (body: any): Promise<RestActionsSummary> => {
    saving.value = true
    try {
      let summary: RestActionsSummary
      try {
        summary = await $fetch(`datasets/${id}/_bulk_lines`, { method: 'POST', body })
      } catch (err: any) {
        // when every operation fails the endpoint answers 400 with the summary object as the body
        if (err?.data && typeof err.data === 'object' && Array.isArray(err.data.errors)) summary = err.data
        else throw err
      }
      if (summary?.indexedAt) indexedAt.value = summary.indexedAt
      return summary
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
      const res = await $fetch(`datasets/${id}/lines`, { method: 'POST', body: formData })
      indexedAt.value = res._updatedAt
    } finally {
      saving.value = false
    }
  }

  // single-line deletion uses the dedicated endpoint (matching the deleteLine permission the
  // delete buttons are gated on) — it returns 204 on success and a plain-text error otherwise,
  // so a failure naturally bubbles up through $fetch
  const removeLine = async (lineId: string) => {
    saving.value = true
    try {
      await $fetch(`datasets/${id}/lines/${lineId}`, { method: 'DELETE' })
      indexedAt.value = new Date().toISOString()
    } finally {
      saving.value = false
    }
  }

  return {
    selectedResults,
    addLineTrigger,
    saving,
    bulkLines,
    saveLine,
    removeLine
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
