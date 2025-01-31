import * as restUtils from '../datasets/utils/rest.js'

export const process = async function (app, dataset) {
  return restUtils.applyTTL(app, dataset)
}
