const fs = require('fs')
const assert = require('assert')
const createError = require('http-errors')
const shortid = require('shortid')
const journals = require('../utils/journals')

// Dynamic loading of all modules in the current directory
exports.connectors = fs.readdirSync(__dirname)
  .filter(f => f !== 'index.js')
  .map(f => ({key: f.replace('.js', ''), ...require('./' + f)}))

// Loosely validate connectors
const expectedKeys = new Set([
  'key',
  'title',
  'description',
  'docUrl',
  'init',
  'suggestOrganizations',
  'suggestDatasets',
  'publishDataset',
  'publishApplication',
  'deleteDataset',
  'deleteApplication'
])
exports.connectors.forEach(c => {
  assert.deepEqual(new Set(Object.keys(c)), expectedKeys, `The catalog connector ${c.key} does not have the expected exported properties (${[...expectedKeys].join(', ')}).`)
})

exports.init = async (catalogUrl) => {
  for (let connector of exports.connectors) {
    try {
      const catalog = await connector.init(catalogUrl)
      catalog.type = connector.key
      return catalog
    } catch (err) {
      // Nothing.. an error simply means that this connector is not the right one
    }
  }
}

exports.suggestOrganizations = async (type, url, q) => {
  const connector = exports.connectors.find(c => c.key === type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + type)
  return connector.suggestOrganizations(url, q)
}

exports.suggestDatasets = async (type, url, q) => {
  const connector = exports.connectors.find(c => c.key === type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + type)
  return connector.suggestDatasets(url, q)
}

exports.processPublications = async function(app, type, resource) {
  const db = app.get('db')
  const resourcesCollection = db.collection(type + 's')
  const catalogsCollection = db.collection('catalogs')

  resource.publications.filter(p => !p.id).forEach(p => { p.id = shortid.generate() })
  await resourcesCollection.updateOne({id: resource.id}, {$set: {publications: resource.publications}})

  const processedPublication = resource.publications.find(p => ['waiting', 'deleted'].includes(p.status))

  async function setResult(error) {
    let patch = {}
    if (error) {
      processedPublication.status = patch['publications.$.status'] = 'error'
      processedPublication.error = patch['publications.$.error'] = error
    } else if (processedPublication.status === 'waiting') {
      processedPublication.status = patch['publications.$.status'] = 'published'
      patch['publications.$.result'] = processedPublication.result
      patch['publications.$.targetUrl'] = processedPublication.targetUrl
    }

    if (['error', 'published'].includes(processedPublication.status)) {
      await resourcesCollection.updateOne(
        {id: resource.id, 'publications.id': processedPublication.id},
        {$set: patch}
      )
    }
    if (processedPublication.status === 'deleted') {
      await resourcesCollection.updateOne(
        {id: resource.id},
        {$pull: {publications: {id: processedPublication.id}}}
      )
    }
  }

  const catalog = await catalogsCollection.findOne({id: processedPublication.catalog})

  if (!catalog) {
    await journals.log(app, resource, {
      type: 'error',
      data: `Une publication fait référence à un catalogue inexistant (${processedPublication.id})`
    }, type)
    await setResult('Catalogue inexistant')
  }
  if (catalog.owner.type !== resource.owner.type || catalog.owner.id !== resource.owner.id) {
    await journals.log(app, resource, {
      type: 'error',
      data: `Une publication fait référence à un catalogue qui n'appartient pas au propriétaire de la resource à publier (${processedPublication.id})`
    }, type)
    await setResult(`Le catalogue n'appartient pas au propriétaire de la resource à publier`)
  }

  try {
    const connector = exports.connectors.find(c => c.key === catalog.type)
    if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
    let res
    if (type === 'dataset' && processedPublication.status === 'waiting') res = await connector.publishDataset(catalog, resource, processedPublication)
    if (type === 'application' && processedPublication.status === 'waiting') res = await connector.publishApplication(catalog, resource, processedPublication)
    if (type === 'dataset' && processedPublication.status === 'deleted') res = await connector.deleteDataset(catalog, resource, processedPublication)
    if (type === 'application' && processedPublication.status === 'deleted') res = await connector.deleteApplication(catalog, resource, processedPublication)
    if (processedPublication.status === 'waiting') {
      await journals.log(app, resource, {type: 'publication', data: `Publication OK vers ${catalog.title || catalog.url}`}, type)
    } else {
      await journals.log(app, resource, {type: 'publication', data: `Suppression de la publication OK vers ${catalog.title || catalog.url}`}, type)
    }
    await setResult(null, res)
  } catch (err) {
    await journals.log(app, resource, {type: 'error', data: err.message || err}, type)
    await setResult(err.message || err)
  }
}
