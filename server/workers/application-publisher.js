exports.process = async function (app, application) {
  const catalogs = require('../catalogs')
  return catalogs.processPublications(app, 'application', application)
}
