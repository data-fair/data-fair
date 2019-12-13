const config = require('config')
const url = require('url')
const axios = require('axios')

exports.title = 'Mydatacatalogue'
exports.description = 'Outil de cartographie et de catalogage de vos données'
exports.docUrl = 'https://www.dawizz.fr/'

exports.init = async (catalogUrl) => {
  await axios.get(url.resolve(catalogUrl, 'api/v1/status'))
  return { url: catalogUrl, title: 'Mydatacatalogue SaaS' }
}

exports.suggestOrganizations = async (catalogUrl, q) => {
  return { results: [{ id: null, name: 'Organization owning API key' }] }
}

exports.suggestDatasets = async (catalogUrl, q) => {
  return { results: [] }
}

exports.publishDataset = async (catalog, dataset, publication) => {
  return createNewDataset(catalog, dataset, publication)
}

exports.deleteDataset = async (catalog, dataset, publication) => {
  throw new Error(`Attention, le jeux de données n'a pas été supprimé sur ${catalog.url}, vous devez le supprimer manuellement`)
}

exports.publishApplication = async (catalog, application, publication, datasets) => {
  throw new Error('La publication d\'applications vers Mydatacatalogue n\'est pas disponible')
}

exports.deleteApplication = async (catalog, application, publication) => {
  throw new Error('La dépublication d\'applications vers Mydatacatalogue n\'est pas disponible')
}

exports.listDatasets = async (catalog, p) => {
  throw new Error('La récupération d\'une liste de jeux de données depuis Mydacatalogue n\'est pas disponible')
}

exports.harvestDataset = async (catalog, datasetId, req) => {
  throw new Error('La récupération d\'une définition de jeu de données depuis Mydacatalogue n\'est pas disponible')
}

function datasetPageDesc(dataset) {
  const desc = dataset.description ? dataset.description + '\n\n' : ''
  return desc + 'Cette source possède un jeu de données consultable dans l\'onglet "Données".'
}

async function createNewDataset(catalog, dataset, publication) {
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
    const res = await axios.post(url.resolve(catalog.url, 'api/v1/sources'), source, { headers: { 'x-apiKey': catalog.apiKey } })
    if (!res.data.id || typeof res.data.id !== 'string') {
      throw new Error(`Erreur lors de l'envoi à ${catalog.url} : le format de retour n'est pas correct.`)
    }
    publication.targetUrl = url.resolve(catalog.url, `sources/${res.data.id}/view`)
    publication.result = res.data
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}
