import * as readApiKeyUtils from '../datasets/utils/read-api-key.js'
import * as datasetsService from '../datasets/service.js'
import debugLib from 'debug'

export const process = async function (app, dataset) {
  const debug = debugLib(`worker:rest-exporter-csv:${dataset.id}`)

  const patch = { readApiKey: { ...dataset.readApiKey } }
  patch._readApiKey = readApiKeyUtils.update(dataset.owner, patch.readApiKey, dataset._readApiKey)
  debug('renewing readApiKey', patch)
  await datasetsService.applyPatch(app, dataset, patch)
  debug('done')
}
