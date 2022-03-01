const catalogs = require('../catalogs')

exports.process = async function (app, application) {
  return catalogs.processPublications(app, 'application', application)
}
