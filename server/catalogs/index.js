const fs = require('fs-extra')
const assert = require('assert')
const createError = require('http-errors')
const shortid = require('shortid')
const config = require('config')
const path = require('path')
const url = require('url')
const moment = require('moment')
const slug = require('slugify')
const journals = require('../utils/journals')
const files = require('../utils/files')

// Dynamic loading of all modules in the current directory
fs.ensureDirSync(path.resolve(config.pluginsDir, 'catalogs'))
exports.connectors = fs.readdirSync(__dirname)
  .filter(f => f !== 'index.js')
  .map(f => ({ key: f.replace('.js', ''), ...require('./' + f) }))
  .concat(fs.readdirSync(path.resolve(config.pluginsDir, 'catalogs'))
    .map(f => ({ key: f.replace('.js', ''), ...require(path.resolve(config.pluginsDir, 'catalogs', f)) })))

// Loosely validate connectors
const expectedKeys = new Set([
  'key',
  'title',
  'description',
  'docUrl',
  'init',
  'suggestOrganizations',
  'publishDataset',
  'publishApplication',
  'deleteDataset',
  'deleteApplication',
  'listDatasets',
  'harvestDataset',
  'httpParams'
])
exports.connectors.forEach(c => {
  try {
    assert.deepStrictEqual(new Set(Object.keys(c)), expectedKeys, `The catalog connector ${c.key} does not have the expected exported properties (${[...expectedKeys].join(', ')}).`)
  } catch (err) {
    console.error(err.message)
  }
})

exports.init = async (catalogUrl) => {
  for (let connector of exports.connectors) {
    try {
      const catalog = await connector.init(catalogUrl)
      if (catalog.title) {
        catalog.type = connector.key
        return catalog
      }
    } catch (err) {
      // Nothing.. an error simply means that this connector is not the right one
    }
  }
}

// Used the downloader worker to get credentials (probably API key in a header)
// to fetch resources
exports.httpParams = async (catalog) => {
  const connector = exports.connectors.find(c => c.key === catalog.type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.httpParams) throw createError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)
  return connector.httpParams(catalog)
}

exports.listDatasets = async (db, catalog, params) => {
  const connector = exports.connectors.find(c => c.key === catalog.type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw createError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)
  const datasets = await connector.listDatasets(catalog, params)
  for (let dataset of datasets.results) {
    for (let resource of dataset.resources) {
      resource.harvestable = files.allowedTypes.has(resource.mime)
      const harvestedDataset = await db.collection('datasets').findOne({
        'remoteFile.url': resource.url,
        'remoteFile.catalog': catalog.id
      }, { id: 1 })
      if (harvestedDataset) resource.harvestedDataset = harvestedDataset.id
    }
  }
  return datasets
}

exports.harvestDataset = async (catalog, datasetId, app) => {
  const connector = exports.connectors.find(c => c.key === catalog.type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw createError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)
  const dataset = await connector.getDataset(catalog, datasetId)
  const harvestableResources = (dataset.resources || []).filter(r => files.allowedTypes.has(r.mime))
  const newDatasets = []
  for (const resource of harvestableResources) {
    const harvestedDataset = await app.get('db').collection('datasets').findOne({
      'remoteFile.url': resource.url,
      'remoteFile.catalog': catalog.id
    }, { id: 1 })
    if (harvestedDataset) continue

    const date = moment().toISOString()
    const fileName = path.basename(url.parse(resource.url).pathname)
    const newDataset = {
      id: `${catalog.id}-${slug(dataset.title, { lower: true })}-${slug(resource.title.split('.').shift(), { lower: true })}`,
      title: resource.title.split('.').shift(),
      owner: catalog.owner,
      permissions: [],
      remoteFile: {
        name: fileName,
        url: resource.url,
        catalog: catalog.id,
        size: resource.size,
        mimetype: resource.mime
      },
      publications: [{
        catalog: catalog.id,
        status: 'waiting',
        targetUrl: dataset.page,
        addToDataset: { id: dataset.id, title: dataset.title }
      }],
      createdBy: { id: catalog.owner.id, name: catalog.owner.name },
      createdAt: date,
      updatedBy: { id: catalog.owner.id, name: catalog.owner.name },
      updatedAt: date,
      status: 'imported'
    }
    await app.get('db').collection('datasets').insertOne(newDataset)
    await journals.log(app, newDataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + newDataset.id }, 'dataset')
    newDatasets.push(newDataset)
  }
  return newDatasets
}

exports.suggestOrganizations = async (type, url, q) => {
  const connector = exports.connectors.find(c => c.key === type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + type)
  if (!connector.suggestOrganizations) throw createError(501, `The connector for the catalog type ${type} cannot do this action`)
  return connector.suggestOrganizations(url, q)
}

exports.processPublications = async function(app, type, resource) {
  const db = app.get('db')
  const resourcesCollection = db.collection(type + 's')
  const catalogsCollection = db.collection('catalogs')

  resource.publications.filter(p => !p.id).forEach(p => { p.id = shortid.generate() })
  await resourcesCollection.updateOne({ id: resource.id }, { $set: { publications: resource.publications } })

  const processedPublication = resource.publications.find(p => ['waiting', 'deleted'].includes(p.status))

  async function setResult(error, nonBlocking) {
    let patch = {}

    if ((!error || nonBlocking) && processedPublication.status === 'deleted') {
      // Deletion worked
      return resourcesCollection.updateOne(
        { id: resource.id },
        { $pull: { publications: { id: processedPublication.id } } }
      )
    }

    if (error) {
      // Publishing or deletion failed
      processedPublication.status = patch['publications.$.status'] = 'error'
      processedPublication.error = patch['publications.$.error'] = error
    } else if (processedPublication.status === 'waiting') {
      // Publishing worked
      processedPublication.status = patch['publications.$.status'] = 'published'
      patch['publications.$.result'] = processedPublication.result
      patch['publications.$.targetUrl'] = processedPublication.targetUrl
    }

    if (Object.keys(patch).length) {
      await resourcesCollection.updateOne(
        { id: resource.id, 'publications.id': processedPublication.id },
        { $set: patch }
      )
    }
  }

  const catalog = await catalogsCollection.findOne({ id: processedPublication.catalog })

  if (!catalog) {
    await journals.log(app, resource, {
      type: 'error',
      data: `Une publication fait référence à un catalogue inexistant (${processedPublication.id})`
    }, type)
    return setResult('Catalogue inexistant', true)
  }
  if (catalog.owner.type !== resource.owner.type || catalog.owner.id !== resource.owner.id) {
    await journals.log(app, resource, {
      type: 'error',
      data: `Une publication fait référence à un catalogue qui n'appartient pas au propriétaire de la resource à publier (${processedPublication.id})`
    }, type)
    return setResult(`Le catalogue n'appartient pas au propriétaire de la resource à publier`)
  }

  try {
    const connector = exports.connectors.find(c => c.key === catalog.type)
    if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
    if (!connector.publishApplication) throw createError(501, `The connector for the catalog type ${type} cannot do this action`)
    let res
    if (type === 'dataset' && processedPublication.status === 'waiting') res = await connector.publishDataset(catalog, resource, processedPublication)
    if (type === 'application' && processedPublication.status === 'waiting') {
      const datasets = await getApplicationDatasets(db, resource)
      // Next line is only here for compatibility.. in next generation of apps, all datasets references should be in .datasets"
      res = await connector.publishApplication(catalog, resource, processedPublication, datasets)
    }
    if (type === 'dataset' && processedPublication.status === 'deleted') res = await connector.deleteDataset(catalog, resource, processedPublication)
    if (type === 'application' && processedPublication.status === 'deleted') res = await connector.deleteApplication(catalog, resource, processedPublication)
    if (processedPublication.status === 'waiting') {
      await journals.log(app, resource, { type: 'publication', data: `Publication OK vers ${catalog.title || catalog.url}` }, type)
    } else {
      await journals.log(app, resource, { type: 'publication', data: `Suppression de la publication OK vers ${catalog.title || catalog.url}` }, type)
    }
    await setResult(null, res)
  } catch (err) {
    console.error('Error while processing publication', err)
    await journals.log(app, resource, { type: 'error', data: err.message || err }, type)
    await setResult(err.message || err)
  }
}

async function getApplicationDatasets(db, app) {
  app.configuration = app.configuration || {}
  const datasetReferences = (app.configuration.datasets || []).map(d => d.href);
  ['datasetUrl', 'networksDatasetUrl', 'networksMembersDatasetUrl'].forEach(k => {
    if (app.configuration[k]) datasetReferences.push(app.configuration[k])
  })
  return db.collection('datasets').find({ id: { $in: datasetReferences.map(r => r.split('/').pop()) } }).toArray()
}
