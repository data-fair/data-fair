module.exports = (app, datasetId, task, nbSteps) => {
  let step = 0
  let lastProgress = -1
  let lastTime = new Date().getTime() - 1000
  return async (inc = 1) => {
    step += inc
    const progress = Math.min(Math.round((step / nbSteps) * 100), 100)
    const time = new Date().getTime()
    // send message on websocket at most once per second and
    if ((time - lastTime) < 1000) return
    // send message on websocket at least every 30s or on every percent change
    if (progress > lastProgress || (time - lastTime) > 30000) {
      lastProgress = progress
      lastTime = time
      await app.publish('datasets/' + datasetId + '/task-progress', { task, progress })
    }
  }
}
