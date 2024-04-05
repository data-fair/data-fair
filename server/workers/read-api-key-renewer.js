exports.process = async function (app, dataset) {
  const readApiKeyUtils = require('../datasets/utils/read-api-key')
  const datasetsService = require('../datasets/service')

  const debug = require('debug')(`worker:rest-exporter-csv:${dataset.id}`)

  const patch = { readApiKey: { ...dataset.readApiKey } }
  patch._readApiKey = readApiKeyUtils.update(dataset.owner, patch.readApiKey, dataset._readApiKey)
  debug('renewing readApiKey', patch)
  await datasetsService.applyPatch(app, dataset, patch)
  debug('done')
}
