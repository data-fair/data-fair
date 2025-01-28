
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import axios from '../../misc/utils/axios.js'

export const title = 'Mydatacatalogue'
export const description = 'Outil de cartographie et de catalogage de vos données'
export const docUrl = 'https://www.dawizz.fr/'
export const optionalCapabilities = [
  'apiKey',
  'publishDataset'
]

export const init = async (catalogUrl) => {
  const status = (await axios.get(new URL('api/v1/status', catalogUrl).href)).data
  if (status.status !== 'ok') throw new Error('mydatacatalogue status is not ok')
  return { url: catalogUrl, title: 'Mydatacatalogue SaaS' }
}

export const searchOrganizations = async (catalogUrl, q) => {
  return { results: [{ id: null, name: 'Organization owning API key' }] }
}

export const publishDataset = async (catalog, dataset, publication) => {
  return createNewDataset(catalog, dataset, publication)
}

export const deleteDataset = async (catalog, dataset, publication) => {
  throw httpError(501, `Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

export const publishApplication = async (catalog, application, publication, datasets) => {
  throw httpError(501, 'La publication d\'applications vers Mydatacatalogue n\'est pas disponible')
}

export const deleteApplication = async (catalog, application, publication) => {
  throw httpError(501, 'La dépublication d\'applications vers Mydatacatalogue n\'est pas disponible')
}

export const listDatasets = async (catalog, p) => {
  throw httpError(501, 'La récupération d\'une liste de jeux de données depuis Mydacatalogue n\'est pas disponible')
}

export const getDataset = async (catalog, datasetId, req) => {
  throw httpError(501, 'La récupération d\'une définition de jeu de données depuis Mydacatalogue n\'est pas disponible')
}

function datasetPageDesc (dataset) {
  const desc = dataset.description ? dataset.description + '\n\n' : ''
  return desc + 'Cette source possède un jeu de données consultable dans l\'onglet "Données".'
}

async function createNewDataset (catalog, dataset, publication) {
  const source = {
    id: `df-${dataset.id}`, // maybe weird to impose an id, but MDC is not very good with undefined ids
    title: dataset.title || (dataset.file && dataset.file.name),
    type: 'tabular-dataset',
    format: 'data-fair',
    description: datasetPageDesc(dataset),
    attributes: dataset.schema.filter(f => !f['x-calculated']).map(a => ({ id: a.key })),
    recordCount: dataset.count || 0,
    dataFairDatasetId: dataset.id,
    tags: {
      keyword: [{ id: 'data-fair', title: 'Données Data Fair', type: 'keyword' }]
    }
  }
  try {
    const res = await axios.post(new URL('api/v1/sources', catalog.url).href, source, { headers: { 'x-apiKey': catalog.apiKey } })
    if (!res.data.id || typeof res.data.id !== 'string') {
      throw httpError(501, `Erreur lors de l'envoi à ${catalog.url} : le format de retour n'est pas correct.`)
    }
    publication.targetUrl = new URL(`sources/${res.data.id}/view`, catalog.url).href
    publication.result = res.data
  } catch (err) {
    if (err.response) throw httpError(501, `Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}
