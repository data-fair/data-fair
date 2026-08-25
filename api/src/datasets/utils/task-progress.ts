import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import mongo from '#mongo'

const updateProgress = async (datasetId: string, task: string, progress: number, step?: string, count?: number) => {
  const taskProgress: { task: string, progress: number, step?: string, count?: number } = { task, progress }
  if (step) taskProgress.step = step
  if (count !== undefined) taskProgress.count = count
  await wsEmitter.emit('datasets/' + datasetId + '/task-progress', taskProgress)
  await mongo.db.collection('journals').updateOne({ type: 'dataset', id: datasetId }, { $set: { taskProgress } })
}

// a failed task keeps its taskProgress (with error flag) so that the UI can show which task
// failed while the dataset is in error state; use this when the errored work is discarded
// without any worker running afterwards (e.g. user-initiated draft cancellation)
export const clearTaskProgress = async (datasetId: string) => {
  await wsEmitter.emit('datasets/' + datasetId + '/task-progress', {})
  await mongo.db.collection('journals').updateOne({ type: 'dataset', id: datasetId }, { $unset: { taskProgress: 1 } })
}

export default (datasetId: string, task: string, nbSteps?: number, progressCallback?: (progress: number) => void) => {
  let doneSteps = 0
  let lastProgress = -1
  let lastTime = new Date().getTime() - 1000
  // name of the current sub-step, only set for the phases that are not covered by inc()
  let currentStep: string | undefined

  return {
    async start () {
      await updateProgress(datasetId, task, -1)
    },
    // switch to an indeterminate bar labelled with a named sub-step, optionally carrying a
    // running count of units done. Used for the phases with no honest percentage to show:
    // the tail of a task (index refresh, alias switch) and the indexing itself, whose total
    // is unknown while it runs. Repeated calls for the same step are throttled like inc().
    async step (step: string, count?: number) {
      const time = new Date().getTime()
      if (step === currentStep && (time - lastTime) < 250) return
      currentStep = step
      lastProgress = -1
      lastTime = time
      await updateProgress(datasetId, task, -1, step, count)
    },
    async inc (inc = 1) {
      if (nbSteps === undefined) throw new Error('incrementing progress requires setting nbSteps')
      doneSteps += inc
      // the epsilon absorbs the float drift accumulated by summing fractional incs (both
      // stream callers divide: 100/count per REST line, chunk/size per file byte range).
      // The final sum lands on 99.999999999998 about as often as on 100.000000000002, and
      // a bare floor() would turn a fully consumed stream into a permanent 99%.
      const progress = Math.min(Math.floor((doneSteps / nbSteps) * 100 + 1e-9), 100)
      const time = new Date().getTime()
      if (progressCallback && progress > lastProgress) {
        progressCallback(progress)
      }
      // send message on websocket at least every 250ms or on every percent change, except
      // for the terminal 100% which must never be throttled away: the last inc of a stream
      // almost always lands less than 250ms after the previous one, and none of the progress
      // instances created inside the workers calls end() (only the outer one in workers/index.ts
      // does, once the whole task is over), so there is nothing to write the 100 afterwards.
      if (progress !== 100 && (time - lastTime) < 250) return
      // send message on websocket at least every 30s or on every percent change
      if (progress > lastProgress || (time - lastTime) > 30000) {
        lastProgress = progress
        lastTime = time
        await updateProgress(datasetId, task, progress)
      }
    },
    async end (error = false, finalTask = false) {
      if (error) {
        // keep the step so the UI shows which phase of the task actually failed
        const taskProgress = { task, progress: lastProgress, error, ...(currentStep ? { step: currentStep } : {}) }
        await wsEmitter.emit('datasets/' + datasetId + '/task-progress', taskProgress)
        await mongo.db.collection('journals').updateOne({ type: 'dataset', id: datasetId }, { $set: { taskProgress } })
      } else if (task === 'finalize' || finalTask) {
        await clearTaskProgress(datasetId)
      } else {
        await updateProgress(datasetId, task, 100)
      }
    }
  }
}
