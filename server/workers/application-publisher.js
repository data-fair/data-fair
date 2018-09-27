const catalogs = require('../catalogs')

exports.type = 'application'
exports.filter = { 'publications.status': { $in: ['waiting', 'deleted'] } }

exports.process = async function(app, application) {
  return catalogs.processPublications(app, 'application', application)
}
