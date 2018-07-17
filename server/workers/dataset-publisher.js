const catalogs = require('../catalogs')

exports.type = 'dataset'
exports.filter = {status: 'finalized', 'publications.status': 'waiting'}

exports.process = async function(app, dataset) {
  return catalogs.processPublications(app, 'dataset', dataset)
}
