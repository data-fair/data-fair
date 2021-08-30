module.exports = (app, datasetId, task, nbSteps) => {
  let step = 0
  let lastProgress = -1
  return async (inc = 1) => {
    step += inc
    const progress = Math.min(Math.round((step / nbSteps) * 100), 100)
    if (progress > lastProgress) {
      lastProgress = progress
      await app.publish('datasets/' + datasetId + '/task-progress', { task, progress })
    }
  }
}
