const config = require('config')
const url = require('url')
const axios = require('axios')

exports.title = 'uData'
exports.description = 'Customizable and skinnable social platform dedicated to (open)data.'
exports.docUrl = 'https://udata.readthedocs.io/en/latest/'

exports.init = async (catalogUrl) => {
  const siteInfo = (await axios.get(url.resolve(catalogUrl, 'api/1/site/'))).data
  return {url: catalogUrl, title: siteInfo.title}
}

exports.suggestOrganizations = async (catalogUrl, q) => {
  const res = await axios.get(url.resolve(catalogUrl, 'api/1/organizations/suggest/'), {params: {q}})
  return {results: res.data.map(o => ({id: o.id, name: o.name}))}
}

exports.suggestDatasets = async (catalogUrl, q) => {
  const res = await axios.get(url.resolve(catalogUrl, 'api/1/datasets/suggest/'), {params: {q}})
  console.log(res.data)
  return {results: res.data.map(o => ({id: o.id, title: o.title}))}
}

exports.publishDataset = async (catalog, dataset, publication) => {
  if (publication.addToDataset && publication.addToDataset.id) return addResourceToDataset(catalog, dataset, publication)
  else return createNewDataset(catalog, dataset, publication)
}

async function addResourceToDataset(catalog, dataset, publication) {
  // TODO: no equivalent of "private" on a resource
  const resource = {
    title: dataset.title,
    description: dataset.description,
    url: `${config.publicUrl}/dataset/${dataset.id}/description`,
    filetype: 'remote',
    extras: {
      datafairOrigin: config.publicUrl,
      datafairDatasetId: dataset.id
    }
  }
  try {
    const udataDataset = (await axios.get(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}`))).data
    const res = await axios.post(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}/resources/`), resource, {headers: {'X-API-KEY': catalog.apiKey}})
    publication.targetUrl = udataDataset.page
    publication.result = res.data
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}

async function createNewDataset(catalog, dataset, publication) {
  const udataDataset = {
    title: dataset.title,
    description: dataset.description,
    private: true,
    extras: {
      datafairOrigin: config.publicUrl,
      datafairDatasetId: dataset.id
    }
  }
  if (catalog.organization && catalog.organization.id) {
    udataDataset.organization = {id: catalog.organizationId}
  }
  try {
    const res = await axios.post(url.resolve(catalog.url, 'api/1/datasets/'), udataDataset, {headers: {'X-API-KEY': catalog.apiKey}})
    publication.targetUrl = res.data.page
    publication.result = res.data
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}
