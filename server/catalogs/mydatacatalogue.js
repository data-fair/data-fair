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
  throw new Error(`La publication d'applications vers Mydatacatalogue n'est pas disponible`)
}

exports.deleteApplication = async (catalog, application, publication) => {
  throw new Error(`La dépublication d'applications vers Mydatacatalogue n'est pas disponible`)
}

exports.listDatasets = async (catalog, p) => {
  throw new Error(`La récupération d'une liste de jeux de données depuis Mydacatalogue n'est pas disponible`)
}

exports.harvestDataset = async (catalog, datasetId, req) => {
  throw new Error(`La récupération d'une définition de jeu de données depuis Mydacatalogue n'est pas disponible`)
}

function datasetPageDesc(dataset) {
  const desc = dataset.description ? dataset.description + '\n\n' : ''
  const url = `${config.publicUrl}/dataset/${dataset.id}/description`
  return desc + `Ce jeu de données a été publié depuis ${config.publicUrl}. Consultez la page ${url} pour accéder à sa description détaillée, prévisualisation, documentation d'API, etc.`
}

async function createNewDataset(catalog, dataset, publication) {
  const mdcDataset = {
    title: dataset.title,
    description: datasetPageDesc(dataset),
    attributes: dataset.schema.map(a => ({ id: a.key })),
    recordCount: dataset.count || 0,
    dataFairDatasetId: dataset.id
  }
  try {
    const res = await axios.post(url.resolve(catalog.url, 'api/v1/sources'), mdcDataset, { headers: { 'X-API-KEY': catalog.apiKey } })
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
