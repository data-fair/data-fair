import type { Event } from '#api/types'
import { type DatasetStore } from './dataset-store'

export type WatchKey = 'journal' | 'info'

export const useDatasetWatch = (datasetStore: DatasetStore, keys: WatchKey | WatchKey[]) => {
  const { sendUiNotif } = useUiNotif()
  const { id, dataset, journal, datasetFetch, draftMode } = datasetStore

  if (!Array.isArray(keys)) keys = [keys]
  const ws = useWS('/data-fair/')

  if (keys.length) {
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
        if (event.type === 'finalize-end' || (event.type === 'draft-cancelled' && draftMode)) {
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

      // TODO
      // // refresh dataset with relevant parts when receiving journal event
      // if (state.eventStates[event.type] && state.dataset) {
      //   commit('patch', { status: state.eventStates[event.type] })
      // }
      // if (event.type === 'analyze-end' || event.type === 'extend-start') {
      //   const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'schema,projection,file,originalFile', draft: 'true' } })
      //   commit('patch', { schema: dataset.schema, projection: dataset.projection, file: dataset.file, originalFile: dataset.originalFile })
      // }
      // if (event.type === 'finalize-end') {
      //   const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'schema,bbox,timePeriod', draft: 'true' } })
      //   commit('patch', { schema: dataset.schema, bbox: dataset.bbox, timePeriod: dataset.timePeriod, finalizedAt: dataset.finalizedAt })
      //   if (state.jsonSchema) dispatch('fetchJsonSchema')
      // }
      // if (event.type === 'publication') {
      //   const dataset = await this.$axios.$get(`api/v1/datasets/${state.datasetId}`, { params: { select: 'publications', draft: 'true' } })
      //   commit('patch', { publications: dataset.publications })
      // }
      // if (state.api) dispatch('fetchApiDoc')
    })
  }
}
