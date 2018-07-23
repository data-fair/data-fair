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
  return {results: res.data.map(o => ({id: o.id, title: o.title}))}
}

exports.publishDataset = async (catalog, dataset, publication) => {
  if (publication.addToDataset && publication.addToDataset.id) return addResourceToDataset(catalog, dataset, publication)
  else return createNewDataset(catalog, dataset, publication)
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
  const udataReuse = {
    title: application.title,
    description: application.description + '\n\n' + appPageDesc(application),
    private: true,
    type: 'application',
    url: `${config.publicUrl}/app/${application.id}`,
    extras: {
      datafairOrigin: config.publicUrl,
      datafairApplicationId: application.id
    },
    datasets: udataDatasets.map(d => ({id: d.id}))
  }
  if (catalog.organization && catalog.organization.id) {
    udataReuse.organization = {id: catalog.organization.id}
  }
  try {
    const res = await axios.post(url.resolve(catalog.url, 'api/1/reuses/'), udataReuse, {headers: {'X-API-KEY': catalog.apiKey}})
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
    await axios.delete(url.resolve(catalog.url, `api/1/reuses/${udataReuse.id}/`), {headers: {'X-API-KEY': catalog.apiKey}})
  } catch (err) {
    // The reuse was already deleted ?
    if (!err.response || ![404, 410].includes(err.response.status)) throw err
  }
}

function datasetPageUrl(dataset) {
  return `${config.publicUrl}/dataset/${dataset.id}/description`
}

function datasetFileUrl(dataset) {
  return `${config.publicUrl}/api/v1/datasets/${dataset.id}/full`
}

function datasetPageDesc(dataset) {
  const url = datasetPageUrl(dataset)
  return `Ce jeu de données a été publié depuis [${config.publicUrl}](config.publicUrl). Consultez [sa page](${url}) pour accéder à sa description détaillée, prévisualisation, documentation d'API, etc.`
}

function appPageDesc(app) {
  const url = `${config.publicUrl}/application/${app.id}/description`
  return `Cette application a été publiée depuis [${config.publicUrl}](${config.publicUrl}). Consultez [sa page](${url}) pour accéder à sa description détaillée, documentation d'API, etc.`
}

async function addResourceToDataset(catalog, dataset, publication) {
  // TODO: no equivalent of "private" on a resource
  const resources = [{
    title: `${dataset.title} - Page sur ${config.publicUrl}`,
    description: dataset.description + '\n\n' + datasetPageDesc(dataset),
    url: datasetPageUrl(dataset),
    filetype: 'remote',
    format: 'Page Web',
    mime: 'text/html',
    extras: {
      datafairOrigin: config.publicUrl,
      datafairDatasetId: dataset.id
    }
  }, {
    title: `${dataset.title} - ${dataset.file.name}`,
    description: dataset.description + '\n\nTéléchargez le fichier complet.',
    url: datasetFileUrl(dataset),
    type: 'main',
    filetype: 'remote',
    format: 'fichier',
    filesize: dataset.file.size,
    mime: dataset.file.mimetype,
    extras: {
      datafairOrigin: config.publicUrl,
      datafairDatasetId: dataset.id
    }
  }]
  try {
    for (let resource of resources) {
      await axios.post(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}/resources/`), resource, {headers: {'X-API-KEY': catalog.apiKey}})
    }
    const udataDataset = (await axios.get(url.resolve(catalog.url, `api/1/datasets/${publication.addToDataset.id}`))).data
    publication.targetUrl = udataDataset.page
    publication.result = udataDataset
  } catch (err) {
    if (err.response) throw new Error(`Erreur lors de l'envoi à ${catalog.url} : ${JSON.stringify(err.response.data, null, 2)}`)
    else throw err
  }
}

async function createNewDataset(catalog, dataset, publication) {
  const udataDataset = {
    title: dataset.title,
    description: dataset.description + '\n\n' + datasetPageDesc(dataset),
    private: true,
    extras: {
      datafairOrigin: config.publicUrl,
      datafairDatasetId: dataset.id
    },
    resources: [{
      title: `Page sur ${config.publicUrl}`,
      description: `Accédez à la description détaillée, prévisualisation, documentation d'API, etc.`,
      url: datasetPageUrl(dataset),
      type: 'documentation',
      filetype: 'remote',
      format: 'Page Web',
      mime: 'text/html'
    }, {
      title: dataset.file.name,
      description: `Téléchargez le fichier complet.`,
      url: datasetFileUrl(dataset),
      type: 'main',
      filetype: 'remote',
      filesize: dataset.file.size,
      mime: dataset.file.mimetype
    }]
  }
  if (catalog.organization && catalog.organization.id) {
    udataDataset.organization = {id: catalog.organization.id}
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

async function deleteResourceFromDataset(catalog, dataset, publication) {
  const udataDataset = publication.result
  // The dataset was never really created in udata
  if (!udataDataset) return
  const resources = (udataDataset.resources || []).filter(resource => {
    return resource.extras && resource.extras.datafairDatasetId === dataset.id
  })
  for (let resource of resources) {
    try {
      await axios.delete(url.resolve(catalog.url, `api/1/datasets/${udataDataset.id}/resources/${resource.id}/`), {headers: {'X-API-KEY': catalog.apiKey}})
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
    await axios.delete(url.resolve(catalog.url, `api/1/datasets/${udataDataset.id}/`), {headers: {'X-API-KEY': catalog.apiKey}})
  } catch (err) {
    // The dataset was already deleted ?
    if (!err.response || ![404, 410].includes(err.response.status)) throw err
  }
}
