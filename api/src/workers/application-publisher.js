import * as catalogs from '../catalogs/plugins/index.js'

export const process = async function (app, application) {
  return catalogs.processPublications(app, 'application', application)
}
