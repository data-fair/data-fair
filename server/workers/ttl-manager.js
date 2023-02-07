exports.process = async function (app, dataset) {
  const restUtils = require('../utils/rest-datasets')
  return restUtils.applyTTL(app, dataset)
}
