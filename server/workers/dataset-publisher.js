const catalogs = require('../catalogs')

exports.process = async function (app, dataset) {
  return catalogs.processPublications(app, 'dataset', dataset)
}
