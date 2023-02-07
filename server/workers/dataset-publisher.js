exports.process = async function (app, dataset) {
  const catalogs = require('../catalogs')
  return catalogs.processPublications(app, 'dataset', dataset)
}
