import * as restUtils from '../datasets/utils/rest.ts'

export const process = async function (app, dataset) {
  return restUtils.applyTTL(dataset)
}
