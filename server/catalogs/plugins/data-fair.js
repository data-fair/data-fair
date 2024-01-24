const url = require('url')
const createError = require('http-errors')
const util = require('util')
const axios = require('../../misc/utils/axios')
const Extractor = require('html-extractor')
const htmlExtractor = new Extractor()
htmlExtractor.extract = util.promisify(htmlExtractor.extract)

exports.title = 'Data Fair'
exports.description = 'Visualisez, exploitez et partagez vos données en quelques clics !'
exports.docUrl = 'https://data-fair.github.io/3/'
exports.optionalCapabilities = [
  'apiKey',
  'publishDataset'
]

exports.init = async (catalogUrl) => {
  await axios.get(url.resolve(catalogUrl, 'api/v1/ping'))
  const html = axios.get(url.resolve(catalogUrl))
  const data = await htmlExtractor.extract(html)
  return { url: catalogUrl, title: data.meta.title }
}

exports.searchOrganizations = async (catalogUrl, q) => {
  return { results: [{ id: null, name: 'Organization owning API key' }] }
}

exports.publishDataset = async (catalog, dataset, publication) => {
  return createOrUpdateDataset(catalog, dataset, publication)
}

exports.deleteDataset = async (catalog, dataset, publication) => {
  throw createError(501, `Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

exports.publishApplication = async (catalog, application, publication, datasets) => {
  throw createError(501, 'La publication d\'applications vers Data Fair n\'est pas disponible')
}

exports.deleteApplication = async (catalog, application, publication) => {
  throw createError(501, 'La dépublication d\'applications vers Data Fair n\'est pas disponible')
}

exports.listDatasets = async (catalog, params = {}) => {
  throw createError(501, 'La récupération d\'une liste de jeux de données depuis Data Fair n\'est pas disponible')
}

exports.getDataset = async (catalog, datasetId, req) => {
  throw createError(501, 'La récupération d\'une définition de jeu de données depuis Data Fair n\'est pas disponible')
}

async function createOrUpdateDataset (catalog, dataset, publication) {
  const updateDatasetId = publication.result && publication.result.id
  const remoteDataset = {
    title: dataset.title || (dataset.file && dataset.file.name),
    description: dataset.description,
    schema: dataset.schema.filter(f => !f['x-calculated'])
  }

  try {
    let res
    // TODO: send actual data is dataset is of type file
    // only send it if there is some recent change ?
    if (updateDatasetId) {
      res = await axios.patch(url.resolve(catalog.url, 'api/v1/datasets/' + updateDatasetId), remoteDataset, { headers: { 'x-apiKey': catalog.apiKey } })
    } else {
      res = await axios.post(url.resolve(catalog.url, 'api/v1/datasets'), remoteDataset, { headers: { 'x-apiKey': catalog.apiKey } })
    }
    publication.targetUrl = url.resolve(catalog.url, `datasets/${res.data.id}`)
    publication.result = res.data
  } catch (err) {
    if (err.response) throw createError(501, `Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}
