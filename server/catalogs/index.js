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
const expectedKeys = [
  'key',
  'title',
  'description',
  'docUrl',
  'init',
  'suggestOrganizations',
  'suggestDatasets',
  'publishDataset',
  'publishApplication'
]
exports.connectors.forEach(c => {
  assert.deepEqual(Object.keys(c), expectedKeys, `The catalog connector ${c.key} does not have the expected exported properties (${expectedKeys.join(', ')}).`)
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

  resource.publications.filter(p => !p.id).forEach(p => {
    p.id = shortid.generate()
  })
  await resourcesCollection.updateOne({id: resource.id}, {$set: {publications: resource.publications}})

  const waitingPublication = resource.publications.find(p => p.status === 'waiting')

  async function setResult(error) {
    let patch = {}
    if (error) {
      waitingPublication.status = patch['publications.$.status'] = 'error'
      waitingPublication.error = patch['publications.$.error'] = error
    } else {
      waitingPublication.status = patch['publications.$.status'] = 'published'
      patch['publications.$.result'] = waitingPublication.result
      patch['publications.$.targetUrl'] = waitingPublication.targetUrl
    }
    await resourcesCollection.updateOne(
      {id: resource.id, 'publications.id': waitingPublication.id},
      {$set: patch}
    )
  }

  const catalog = await catalogsCollection.findOne({id: waitingPublication.catalog})

  if (!catalog) {
    await journals.log(app, resource, {type: 'error', data: `Une publication fait référence à un catalogue inexistant (${waitingPublication.id})`}, type)
    await setResult('Catalogue inexistant')
  }

  try {
    const connector = exports.connectors.find(c => c.key === catalog.type)
    if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
    let res
    if (type === 'dataset') res = await connector.publishDataset(catalog, resource, waitingPublication)
    if (type === 'application') res = await connector.publishApplication(catalog, resource, waitingPublication)
    await journals.log(app, resource, {type: 'publication', data: `Publication OK vers ${catalog.title || catalog.url}`}, type)
    await setResult(null, res)
  } catch (err) {
    await journals.log(app, resource, {type: 'error', data: err.message || err}, type)
    await setResult(err.message || err)
  }
}
