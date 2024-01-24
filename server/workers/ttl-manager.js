exports.process = async function (app, dataset) {
  const restUtils = require('../misc/utils/rest-datasets')
  return restUtils.applyTTL(app, dataset)
}
