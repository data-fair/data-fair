import catalogs from '../catalogs/plugins/index.js'

export const process = async function (app, dataset) {
  return catalogs.processPublications(app, 'dataset', dataset)
}
