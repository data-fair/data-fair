import { httpError } from '@data-fair/lib-utils/http-errors.js'
import util from 'util'
import axios from '../../misc/utils/axios.js'
import Extractor from 'html-extractor'

const htmlExtractor = new Extractor()
htmlExtractor.extract = util.promisify(htmlExtractor.extract)

export const title = 'Data Fair'
export const description = 'Visualisez, exploitez et partagez vos données en quelques clics !'
export const docUrl = 'https://data-fair.github.io/3/'
export const optionalCapabilities = [
  'apiKey',
  'publishDataset'
]

export const init = async (catalogUrl) => {
  await axios.get(new URL('api/v1/ping', catalogUrl).href)
  const html = axios.get(catalogUrl)
  const data = await htmlExtractor.extract(html)
  return { url: catalogUrl, title: data.meta.title }
}

export const searchOrganizations = async (catalogUrl, q) => {
  return { results: [{ id: null, name: 'Organization owning API key' }] }
}

export const publishDataset = async (catalog, dataset, publication) => {
  return createOrUpdateDataset(catalog, dataset, publication)
}

export const deleteDataset = async (catalog, dataset, publication) => {
  throw httpError(501, `Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

export const publishApplication = async (catalog, application, publication, datasets) => {
  throw httpError(501, 'La publication d\'applications vers Data Fair n\'est pas disponible')
}

export const deleteApplication = async (catalog, application, publication) => {
  throw httpError(501, 'La dépublication d\'applications vers Data Fair n\'est pas disponible')
}

export const listDatasets = async (catalog, params = {}) => {
  throw httpError(501, 'La récupération d\'une liste de jeux de données depuis Data Fair n\'est pas disponible')
}

export const getDataset = async (catalog, datasetId, req) => {
  throw httpError(501, 'La récupération d\'une définition de jeu de données depuis Data Fair n\'est pas disponible')
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
      res = await axios.patch(new URL('api/v1/datasets/' + updateDatasetId, catalog.url).href, remoteDataset, { headers: { 'x-apiKey': catalog.apiKey } })
    } else {
      res = await axios.post(new URL('api/v1/datasets', catalog.url).href, remoteDataset, { headers: { 'x-apiKey': catalog.apiKey } })
    }
    publication.targetUrl = new URL(`datasets/${res.data.id}`, catalog.url).href
    publication.result = res.data
  } catch (err) {
    if (err.response) throw httpError(501, `Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}
