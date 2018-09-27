const fs = require('fs-extra')
const assert = require('assert')
const createError = require('http-errors')
const shortid = require('shortid')
const journals = require('../utils/journals')
const config = require('config')
const path = require('path')

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
  'suggestDatasets',
  'publishDataset',
  'publishApplication',
  'deleteDataset',
  'deleteApplication'
])
exports.connectors.forEach(c => {
  assert.deepStrictEqual(new Set(Object.keys(c)), expectedKeys, `The catalog connector ${c.key} does not have the expected exported properties (${[...expectedKeys].join(', ')}).`)
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
