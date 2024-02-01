exports.process = async function (app, dataset) {
  const restUtils = require('../datasets/utils/rest')
  const datasetUtils = require('../datasets/utils')
  const datasetsService = require('../datasets/service')

  const debug = require('debug')(`worker:rest-initializer:${dataset.id}`)
  const db = app.get('db')

  const patch = { status: 'analyzed' }
  await restUtils.initDataset(db, dataset)

  if (dataset.initFrom) {
    // TODO init from another dataset
    patch.initFrom = null
  }

  await datasetsService.applyPatch(app, dataset, patch)
  if (!dataset.draftReason) await datasetUtils.updateStorage(app, dataset)
  debug('done')
}
