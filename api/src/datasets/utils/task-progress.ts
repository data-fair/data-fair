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
  // name and count of the current sub-step, only set for the phases that are not covered by inc()
  let currentStep: string | undefined
  let currentCount: number | undefined

  return {
    async start () {
      await updateProgress(datasetId, task, -1)
    },
    // switch the bar to a named sub-step, optionally carrying a running count of units done
    // and a percentage. Without a percent the bar is indeterminate: the phases with no honest
    // percentage to show (index refresh, alias switch, and the indexing itself when its total
    // line count is unknown). With a percent the bar is determinate: the indexing when the
    // total IS known (REST collection count, re-index of unchanged data). Repeated calls for
    // the same step are throttled like inc(); a step change is never throttled.
    async step (step: string, count?: number, percent?: number) {
      const time = new Date().getTime()
      if (step === currentStep && (time - lastTime) < 250) return
      let progress = -1
      if (percent !== undefined) {
        // same epsilon as inc(): the percent is a quotient and can land just under an integer
        progress = Math.min(Math.floor(percent + 1e-9), 100)
        // the total can be a live count (REST partial updates): never show a receding bar
        if (step === currentStep && progress < lastProgress) progress = lastProgress
      }
      currentStep = step
      currentCount = count
      lastProgress = progress
      lastTime = time
      await updateProgress(datasetId, task, progress, step, count)
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
        // keep the step (and its count) so the UI shows which phase of the task actually
        // failed and how far it got
        const taskProgress = { task, progress: lastProgress, error, ...(currentStep ? { step: currentStep } : {}), ...(currentCount !== undefined ? { count: currentCount } : {}) }
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
