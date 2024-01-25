exports.process = async function (app, dataset) {
  const restUtils = require('../datasets/utils/rest')
  return restUtils.applyTTL(app, dataset)
}
