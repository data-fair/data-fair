import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import mongo from '#mongo'

const updateProgress = async (app, datasetId, task, progress) => {
  await wsEmitter.emit('datasets/' + datasetId + '/task-progress', { task, progress })
  await mongo.db.collection('journals').updateOne({ type: 'dataset', id: datasetId }, { $set: { taskProgress: { task, progress } } })
}

export default (app, datasetId, task, nbSteps, progressCallback) => {
  let step = 0
  let lastProgress = -1
  let lastTime = new Date().getTime() - 1000

  return {
    async start () {
      await updateProgress(app, datasetId, task, -1)
    },
    async inc (inc = 1) {
      step += inc
      const progress = Math.min(Math.floor((step / nbSteps) * 100), 100)
      const time = new Date().getTime()
      if (progressCallback && progress > lastProgress) {
        progressCallback(progress)
      }
      // send message on websocket at most once per second
      if ((time - lastTime) < 1000) return
      // send message on websocket at least every 30s or on every percent change
      if (progress > lastProgress || (time - lastTime) > 30000) {
        lastProgress = progress
        lastTime = time
        await updateProgress(app, datasetId, task, progress)
      }
    },
    async end (error = false) {
      if (error) {
        const taskProgress = { task, progress: lastProgress, error }
        await wsEmitter.emit('datasets/' + datasetId + '/task-progress', taskProgress)
        await mongo.db.collection('journals').updateOne({ type: 'dataset', id: datasetId }, { $set: { taskProgress } })
      } else if (task === 'finalize') {
        await wsEmitter.emit('datasets/' + datasetId + '/task-progress', {})
        await mongo.db.collection('journals').updateOne({ type: 'dataset', id: datasetId }, { $unset: { taskProgress: 1 } })
      } else {
        await updateProgress(app, datasetId, task, 100)
      }
    }
  }
}
