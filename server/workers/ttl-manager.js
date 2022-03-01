const restUtils = require('../utils/rest-datasets')

exports.process = async function (app, dataset) {
  return restUtils.applyTTL(app, dataset)
}
