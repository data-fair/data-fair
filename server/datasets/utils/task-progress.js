module.exports = (app, datasetId, task, nbSteps, progressCallback) => {
  let step = 0
  let lastProgress = -1
  let lastTime = new Date().getTime() - 1000
  return async (inc = 1) => {
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
      await app.publish('datasets/' + datasetId + '/task-progress', { task, progress })
    }
  }
}
