exports.process = async function (app, dataset) {
  const catalogs = require('../catalogs/plugins')
  return catalogs.processPublications(app, 'dataset', dataset)
}
