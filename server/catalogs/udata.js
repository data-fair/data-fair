const config = require('config')
const url = require('url')
const axios = require('axios')
const debug = require('debug')('catalogs:udata')
exports.title = 'uData'
exports.description = 'Customizable and skinnable social platform dedicated to (open)data.'
exports.docUrl = 'https://udata.readthedocs.io/en/latest/'
exports.searchOrganization = true

exports.init = async (catalogUrl) => {
  const siteInfo = (await axios.get(url.resolve(catalogUrl, 'api/1/site/'))).data
  return { url: catalogUrl, title: siteInfo.title }
}

exports.httpParams = async (catalog) => {
  return { headers: { 'X-API-KEY': catalog.apiKey } }
}

exports.getDataset = async (catalog, datasetId) => {
  const dataset = (await axios.get(url.resolve(catalog.url, 'api/1/datasets/' + datasetId), { headers: { 'X-API-KEY': catalog.apiKey } })).data
  return prepareDatasetFromCatalog(dataset)
}

exports.listDatasets = async (catalog, params = {}) => {
  params.page_size = params.page_size || 1000
  let datasets
  if (catalog.organization) {
    datasets = (await axios.get(url.resolve(catalog.url, 'api/1/me/org_datasets'), { params, headers: { 'X-API-KEY': catalog.apiKey } })).data
      .filter(d => d.organization && d.organization.id === catalog.organization.id)
  } else {
    datasets = (await axios.get(url.resolve(catalog.url, 'api/1/me/datasets'), { headers: { 'X-API-KEY': catalog.apiKey } })).data
  }
  return {
    count: datasets.length,
    results: datasets.map(prepareDatasetFromCatalog),
  }
}

exports.suggestOrganizations = async (catalogUrl, q) => {
  const res = await axios.get(url.resolve(catalogUrl, 'api/1/organizations/suggest/'), { params: { q } })
  return { results: res.data.map(o => ({ id: o.id, name: o.name })) }
}

exports.publishDataset = async (catalog, dataset, publication) => {
  // if (publication.targetUrl) throw new Error('Publication was already done !')
  if (publication.addToDataset && publication.addToDataset.id) return addResourceToDataset(catalog, dataset, publication)
  else return createOrUpdateDataset(catalog, dataset, publication)
}

exports.deleteDataset = async (catalog, dataset, publication) => {
  if (publication.addToDataset && publication.addToDataset.id) return deleteResourceFromDataset(catalog, dataset, publication)
  else return deleteDataset(catalog, dataset, publication)
}

exports.publishApplication = async (catalog, application, publication, datasets) => {
  const udataDatasets = []
  datasets.forEach(dataset => {
    (dataset.publications || []).forEach(publication => {
      if (publication.catalog === catalog.id && publication.status === 'published') {
        udataDatasets.push(publication.result)
      }
    })
  })
  const appUrl = catalog.applicationUrlTemplate && catalog.applicationUrlTemplate.replace('{id}', application.id)

  const udataReuse = {
    title: application.title,
    description: application.description || application.title,
    private: !application.public,
    type: 'application',
    url: appUrl || `${config.publicUrl}/app/${application.id}`,
    extras: {
      datafairOrigin: config.publicUrl,
      datafairApplicationId: application.id,
    },
    datasets: udataDatasets.map(d => ({ id: d.id })),
  }
  if (catalog.organization && catalog.organization.id) {
    udataReuse.organization = { id: catalog.organization.id }
  }

  const updateReuseId = publication.result && publication.result.id
  let existingReuse
  if (updateReuseId) {
    try {
      existingReuse = (await axios.get(url.resolve(catalog.url, 'api/1/reuses/' + updateReuseId + '/'), { headers: { 'X-API-KEY': catalog.apiKey } })).data
      if (existingReuse.deleted) existingReuse = null
    } catch (err) {
      console.error('Failed to fetch existing reuse', err)
    }
  }

  try {
    let res
    if (existingReuse) {
      Object.assign(existingReuse, udataReuse)
      res = await axios.put(url.resolve(catalog.url, 'api/1/reuses/' + updateReuseId + '/'), existingReuse, { headers: { 'X-API-KEY': catalog.apiKey } })
    } else {
      res = await axios.post(url.resolve(catalog.url, 'api/1/reuses/'), udataReuse, { headers: { 'X-API-KEY': catalog.apiKey } })
    }
    publication.targetUrl = res.data.page
    publication.result = res.data
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}

exports.deleteApplication = async (catalog, application, publication) => {
  const udataReuse = publication.result
  // The dataset was never really created in udata
  if (!udataReuse) return
  try {
    await axios.delete(url.resolve(catalog.url, `api/1/reuses/${udataReuse.id}/`), { headers: { 'X-API-KEY': catalog.apiKey } })
  } catch (err) {
    // The reuse was already deleted ?
    if (!err.response || ![404, 410].includes(err.response.status)) throw err
  }
}

function prepareDatasetFromCatalog(d) {
  const dataset = {
    id: d.id,
    createdAt: d.created_at,
    deleted: d.deleted,
    title: d.title,
    page: d.page,
    url: d.uri,
    private: d.private,
    resources: d.resources.map(r => {
      const resource = {
        id: r.id,
        format: r.format,
        mime: r.mime,
        title: r.title,
        url: r.url,
        size: r.fileSize,
      }
      if (r.extras && r.extras.datafairOrigin === config.publicUrl) {
        resource.datafairDatasetId = r.extras.datafairDatasetId
      }
      return resource
    }),
  }
  if (d.extras && d.extras.datafairOrigin === config.publicUrl) {
    dataset.datafairDatasetId = d.extras.datafairDatasetId
  }
  return dataset
}

function getDatasetUrl(catalog, dataset) {
  if (catalog.datasetUrlTemplate) {
    return catalog.datasetUrlTemplate.replace('{id}', dataset.id)
  }
  return `${config.publicUrl}/dataset/${dataset.id}`
}

async function addResourceToDataset(catalog, dataset, publication) {
  // TODO: no equivalent of "private" on a resource
  const title = dataset.title
  const datasetUrl = getDatasetUrl(catalog, dataset)
  const resources = []
  if (!dataset.isMetaOnly) {
    resources.push({
      title: `${title} - Description des champs`,
      description: 'Description détaillée et types sémantiques des champs',
      url: datasetUrl,
      type: 'documentation',
      filetype: 'remote',
      format: 'Page Web',
      mime: 'text/html',
      extras: {
        datafairEmbed: 'fields',
        datafairOrigin: config.publicUrl,
        datafairDatasetId: dataset.id,
      },
    })
    resources.push({
      title: `${title} - Documentation de l'API`,
      description: 'Documentation interactive de l\'API à destination des développeurs. La description de l\'API utilise la spécification [OpenAPI 3.0.1](https://github.com/OAI/OpenAPI-Specification)',
      url: datasetUrl,
      type: 'documentation',
      filetype: 'remote',
      format: 'Page Web',
      mime: 'text/html',
      extras: {
        apidocUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/api-docs.json`,
        datafairOrigin: config.publicUrl,
        datafairDatasetId: dataset.id,
      },
    })
    resources.push({
      title: `${title} - Consultez les données`,
      description: `Consultez directement les données dans ${dataset.bbox ? 'une carte interactive' : 'un tableau'}.`,
      url: datasetUrl,
      type: 'main',
      filetype: 'remote',
      format: 'Page Web',
      mime: 'text/html',
      extras: {
        datafairEmbed: dataset.bbox ? 'map' : 'table',
        datafairOrigin: config.publicUrl,
        datafairDatasetId: dataset.id,
      },
    })
  }
  const catalogDataset = (await axios.get(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}`),
    { params: { page_size: 1000 }, headers: { 'X-API-KEY': catalog.apiKey } })).data
  if (!catalogDataset) throw new Error(`Le jeu de données ${publication.addToDataset.id} n'existe pas dans le catalogue ${catalog.url}`)
  // matchingResource will be defined if the dataset in data-fair was originally created from a ressource of the catalog's dataset
  // we use it to prevent create a duplicate
  const matchingResource = dataset.remoteFile ? catalogDataset.resources.find(r => r.url === dataset.remoteFile.url) : null
  if (!matchingResource && dataset.file) {
    resources.push({
      title: `${title}`,
      description: `Téléchargez le fichier complet au format ${dataset.originalFile.name.split('.').pop()}.`,
      url: `${config.publicUrl}/api/v1/datasets/${dataset.id}/raw`,
      type: 'main',
      filetype: 'remote',
      filesize: dataset.originalFile.size,
      mime: dataset.originalFile.mimetype,
      extras: {
        datafairOrigin: config.publicUrl,
        datafairDatasetId: dataset.id,
      },
    })
  }

  // Create new resources
  try {
    for (const resource of resources) {
      await axios.post(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}/resources/`),
        resource, { headers: { 'X-API-KEY': catalog.apiKey } })
    }
    const udataDataset = (await axios.get(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}`))).data
    publication.targetUrl = udataDataset.page
    publication.result = udataDataset
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }

  // Cleanup previous ones
  for (const existingResource of catalogDataset.resources) {
    existingResource.extras = existingResource.extras || {}
    if (existingResource.extras.datafairOrigin === config.publicUrl && existingResource.extras.datafairDatasetId === dataset.id) {
      await axios.delete(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}/resources/${existingResource.id}/`),
        { headers: { 'X-API-KEY': catalog.apiKey } })
    }
  }
}

async function createOrUpdateDataset(catalog, dataset, publication) {
  debug('Create or update dataset', dataset)
  const datasetUrl = getDatasetUrl(catalog, dataset)
  const resources = []
  if (!dataset.isMetaOnly) {
    resources.push({
      title: 'Description des champs',
      description: 'Description détaillée et types sémantiques des champs',
      url: datasetUrl,
      type: 'documentation',
      filetype: 'remote',
      format: 'Page Web',
      mime: 'text/html',
      extras: {
        datafairEmbed: 'fields',
      },
    })
    resources.push({
      title: 'Documentation de l\'API',
      description: 'Documentation interactive de l\'API à destination des développeurs. La description de l\'API utilise la spécification [OpenAPI 3.0.1](https://github.com/OAI/OpenAPI-Specification)',
      url: datasetUrl,
      type: 'documentation',
      filetype: 'remote',
      format: 'Page Web',
      mime: 'text/html',
      extras: {
        apidocUrl: `${config.publicUrl}/api/v1/datasets/${dataset.id}/api-docs.json`,
      },
    })
    resources.push({
      title: 'Consultez les données',
      description: `Consultez directement les données dans ${dataset.bbox ? 'une carte interactive' : 'un tableau'}.`,
      url: datasetUrl,
      type: 'main',
      filetype: 'remote',
      format: 'Page Web',
      mime: 'text/html',
      extras: {
        datafairEmbed: dataset.bbox ? 'map' : 'table',
      },
    })
  }
  const udataDataset = {
    title: dataset.title,
    description: dataset.description || dataset.title,
    private: !dataset.public,
    extras: {
      datafairOrigin: config.publicUrl,
      datafairDatasetId: dataset.id,
    },
    resources,
  }
  // TODO: use data-files ?
  if (dataset.file) {
    udataDataset.resources.push({
      title: `Fichier ${dataset.originalFile.name.split('.').pop()}`,
      description: `Téléchargez le fichier complet au format ${dataset.originalFile.name.split('.').pop()}.`,
      url: `${config.publicUrl}/api/v1/datasets/${dataset.id}/raw`,
      type: 'main',
      filetype: 'remote',
      filesize: dataset.originalFile.size,
      mime: dataset.originalFile.mimetype,
    })
    if (dataset.file.mimetype !== dataset.originalFile.mimetype) {
      udataDataset.resources.push({
        title: `Fichier ${dataset.file.name.split('.').pop()}`,
        description: `Téléchargez le fichier complet au format ${dataset.file.name.split('.').pop()}.`,
        url: `${config.publicUrl}/api/v1/datasets/${dataset.id}/convert`,
        type: 'main',
        filetype: 'remote',
        filesize: dataset.file.size,
        mime: dataset.file.mimetype,
      })
    }
  }

  if (catalog.organization && catalog.organization.id) {
    udataDataset.organization = { id: catalog.organization.id }
  }

  const updateDatasetId = publication.result && publication.result.id
  let existingDataset
  if (updateDatasetId) {
    try {
      existingDataset = (await axios.get(url.resolve(catalog.url, 'api/1/datasets/' + updateDatasetId + '/'), { headers: { 'X-API-KEY': catalog.apiKey } })).data
      if (existingDataset.deleted) existingDataset = null
    } catch (err) {
      console.error('Failed to fetch existing dataset', err)
    }
  }

  try {
    let res
    if (existingDataset) {
      Object.assign(existingDataset, udataDataset)
      res = await axios.put(url.resolve(catalog.url, 'api/1/datasets/' + updateDatasetId + '/'), existingDataset, { headers: { 'X-API-KEY': catalog.apiKey } })
    } else {
      res = await axios.post(url.resolve(catalog.url, 'api/1/datasets/'), udataDataset, { headers: { 'X-API-KEY': catalog.apiKey } })
    }

    if (!res.data.page || typeof res.data.page !== 'string') {
      throw new Error(`Erreur lors de l'envoi à ${catalog.url} : le format de retour n'est pas correct.`)
    }
    publication.targetUrl = res.data.page
    publication.result = res.data
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}

async function deleteResourceFromDataset(catalog, dataset, publication) {
  const udataDataset = publication.result
  // The dataset was never really created in udata
  if (!udataDataset) return
  const resources = (udataDataset.resources || []).filter(resource => {
    return resource.extras && resource.extras.datafairDatasetId === dataset.id
  })
  for (const resource of resources) {
    try {
      await axios.delete(url.resolve(catalog.url, `api/1/datasets/${udataDataset.id}/resources/${resource.id}/`), { headers: { 'X-API-KEY': catalog.apiKey } })
    } catch (err) {
      // The resource was already deleted ?
      if (!err.response || ![404, 410].includes(err.response.status)) throw err
    }
  }
}

async function deleteDataset(catalog, dataset, publication) {
  const udataDataset = publication.result
  // The dataset was never really created in udata
  if (!udataDataset) return
  try {
    await axios.delete(url.resolve(catalog.url, `api/1/datasets/${udataDataset.id}/`), { headers: { 'X-API-KEY': catalog.apiKey } })
  } catch (err) {
    // The dataset was already deleted ?
    if (!err.response || ![404, 410].includes(err.response.status)) throw err
  }
}
