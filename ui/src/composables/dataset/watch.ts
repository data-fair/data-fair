import type { Event } from '#api/types'
import { type TaskProgress, type DatasetStore } from './dataset-store'

export type WatchKey = 'journal' | 'info' | 'taskProgress'

export const useDatasetWatch = (datasetStore: DatasetStore, keys: WatchKey | WatchKey[]) => {
  const { sendUiNotif } = useUiNotif()
  const { id, dataset, journal, datasetFetch, draft, taskProgress } = datasetStore

  if (!Array.isArray(keys)) keys = [keys]
  const ws = useWS('/data-fair/api/')

  if (keys.includes('taskProgress')) {
    ws?.subscribe(`datasets/${id}/task-progress`, async (newTaskProgress: TaskProgress) => {
      if (newTaskProgress.task) taskProgress.value = newTaskProgress
      else taskProgress.value = undefined
    })
  }

  if (keys.includes('journal') || keys.includes('info')) {
    ws?.subscribe(`datasets/${id}/journal`, async (event: Event) => {
      if (!dataset.value) return

      if (keys.includes('info')) {
        if (event.type === 'finalize-end') {
          sendUiNotif({ type: 'success', msg: 'Le jeu de données a été traité en fonction de vos dernières modifications et est prêt à être utilisé ou édité de nouveau.' })
        }
        if (event.type === 'error') {
          sendUiNotif({ type: 'error', msg: 'Le service a rencontré une erreur pendant le traitement du jeu de données:', error: event.data })
        }
      }

      if (keys.includes('info')) {
        if (event.type === 'finalize-end' || (event.type === 'draft-cancelled' && draft)) {
          datasetFetch.refresh()
        }
      }

      if (keys.includes('journal')) {
        if (event.store) { // ignore event that is not stored, prevent different render after refresh
          if (!journal.value?.find(e => e.date === event.date)) {
            journal.value?.unshift(event)
          }
        }
      }

      // Update dataset status based on journal events for real-time progress
      const eventStates: Record<string, string> = {
        'data-updated': 'loaded',
        'store-start': 'loaded',
        'store-end': 'stored',
        'normalize-start': 'stored',
        'normalize-end': 'normalized',
        'analyze-start': 'normalized',
        'analyze-end': 'analyzed',
        'validate-start': 'analyzed',
        'validate-end': 'validated',
        'extend-start': 'validated',
        'extend-end': 'extended',
        'index-start': 'extended',
        'index-end': 'indexed',
        'finalize-start': 'indexed',
        error: 'error'
      }

      if (keys.includes('info')) {
        const newStatus = eventStates[event.type]
        if (newStatus && dataset.value) {
          dataset.value = { ...dataset.value, status: newStatus as typeof dataset.value.status }
        }
        // Refresh schema after analyze-end or extend-start (schema may have changed)
        if (event.type === 'analyze-end' || event.type === 'extend-start') {
          datasetFetch.refresh()
        }
      }
    })
  }
}
