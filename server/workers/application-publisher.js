exports.process = async function (app, application) {
  const catalogs = require('../catalogs/plugins')
  return catalogs.processPublications(app, 'application', application)
}
