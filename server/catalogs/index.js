const fs = require('fs-extra')
const createError = require('http-errors')
const { nanoid } = require('nanoid')
const config = require('config')
const path = require('path')
const mime = require('mime')
const moment = require('moment')
const slug = require('slugify')
const journals = require('../utils/journals')
const files = require('../utils/files')
const permissionsUtil = require('../utils/permissions')

const debug = require('debug')('catalogs')

// Dynamic loading of all modules in the current directory
fs.ensureDirSync(path.resolve(config.pluginsDir, 'catalogs'))
exports.connectors = fs.readdirSync(__dirname)
  .filter(f => f !== 'index.js')
  .map(f => ({ key: f.replace('.js', ''), ...require('./' + f) }))
  // Add all modules from another directory
  .concat(fs.readdirSync(path.resolve(config.pluginsDir, 'catalogs'))
    .map(f => ({ key: f.replace('.js', ''), ...require(path.resolve(config.pluginsDir, 'catalogs', f)) })))

exports.init = async (catalogUrl) => {
  debug('Attempt to init catalog from URL', catalogUrl)
  for (const connector of exports.connectors) {
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
exports.httpParams = async (catalog, url) => {
  const connector = exports.connectors.find(c => c.key === catalog.type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.httpParams) throw createError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)
  if (url.startsWith(catalog.url)) {
    const catalogHttpParams = await connector.httpParams(catalog)
    debug(`Use HTTP params from catalog ${JSON.stringify(catalogHttpParams)}`)
    return catalogHttpParams
  } else {
    debug(`the URL ${url} is not internal to the catalog ${catalog.url}, do not apply security parameters`)
    return {}
  }
}

exports.listDatasets = async (db, catalog, params) => {
  const connector = exports.connectors.find(c => c.key === catalog.type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw createError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)
  const datasets = await connector.listDatasets(catalog, params)
  for (const dataset of datasets.results) {
    const harvestedDatasets = await db.collection('datasets').find({
      'owner.type': catalog.owner.type,
      'owner.id': catalog.owner.id,
      origin: dataset.page
    }, { projection: { id: 1, remoteFile: 1, isMetaOnly: 1, updatedAt: 1 } }).toArray()
    dataset.harvestedDataset = harvestedDatasets.find(d => d.isMetaOnly)
    for (const resource of dataset.resources) {
      resource.harvestable = files.allowedTypes.has(resource.mime)
      resource.harvestedDataset = harvestedDatasets.find(hd => hd.remoteFile && hd.remoteFile.url === resource.url)
    }
  }
  return datasets
}

const getDatasetProps = (dataset, props = {}) => {
  if (dataset.description) props.description = dataset.description
  if (dataset.image) props.image = dataset.image
  if (dataset.frequency) props.frequency = dataset.frequency
  if (dataset.license) props.license = dataset.license
  if (dataset.page) props.origin = dataset.page
  if (dataset.keywords) props.keywords = dataset.keywords
  return props
}

const getDatasetPatch = (catalog, dataset, props = {}) => {
  const patch = getDatasetProps(dataset, props)
  patch.updatedBy = { id: catalog.owner.id, name: catalog.owner.name }
  patch.updatedAt = new Date().toISOString()
  return patch
}

const insertDataset = async (app, newDataset) => {
// try insertion until there is no conflict on id
  const baseId = newDataset.id
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await app.get('db').collection('datasets').insertOne(newDataset)
      insertOk = true
    } catch (err) {
      if (err.code !== 11000) throw err
      i += 1
      newDataset.id = `${baseId}-${i}`
    }
  }

  await journals.log(app, newDataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + newDataset.id }, 'dataset')
}

// create a simple metadata only dataset
exports.harvestDataset = async (app, catalog, datasetId) => {
  const connector = exports.connectors.find(c => c.key === catalog.type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw createError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)

  const settings = (await app.get('db').collection('settings').findOne({ type: catalog.owner.type, id: catalog.owner.id })) || {}
  settings.licenses = [].concat(config.licenses, settings.licenses || [])
  const dataset = await connector.getDataset(catalog, datasetId, settings)
  if (!dataset) throw createError(404, 'Dataset not found')

  const date = moment().toISOString()

  const harvestedDataset = await app.get('db').collection('datasets').findOne({
    'owner.type': catalog.owner.type,
    'owner.id': catalog.owner.id,
    origin: dataset.page
  }, { projection: { id: 1 } })
  if (harvestedDataset) {
    const patch = getDatasetPatch(catalog, dataset, { title: dataset.title })
    debug('apply patch to dataset', harvestedDataset.id, patch)
    if (Object.keys(patch).length) {
      await app.get('db').collection('datasets').updateOne({ id: harvestedDataset.id }, { $set: patch })
    }
  } else {
    const id = slug(dataset.title, { lower: true, strict: true })
    debug('create new metadata dataset', id)
    const newDataset = {
      id,
      title: dataset.title,
      owner: catalog.owner,
      permissions: [],
      createdBy: { id: catalog.owner.id, name: catalog.owner.name },
      createdAt: date,
      updatedBy: { id: catalog.owner.id, name: catalog.owner.name },
      updatedAt: date,
      isMetaOnly: true,
      schema: []
    }
    Object.assign(newDataset, getDatasetProps(dataset))
    await insertDataset(app, newDataset)
  }
}

// create a file dataset from the resource of a dataset on the remote portal
exports.harvestDatasetResource = async (app, catalog, datasetId, resourceId) => {
  const connector = exports.connectors.find(c => c.key === catalog.type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw createError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)

  const settings = (await app.get('db').collection('settings').findOne({ type: catalog.owner.type, id: catalog.owner.id })) || {}
  settings.licenses = [].concat(config.licenses, settings.licenses || [])
  const dataset = await connector.getDataset(catalog, datasetId, settings)
  if (!dataset) throw createError(404, 'Dataset not found')
  const resource = (dataset.resources || []).find(r => r.id === resourceId)
  if (!resource) throw createError(404, 'Resource not found')
  if (!files.allowedTypes.has(resource.mime)) throw createError(404, 'Resource format not supported')

  const date = moment().toISOString()

  const harvestedDataset = await app.get('db').collection('datasets').findOne({
    'remoteFile.url': resource.url,
    'remoteFile.catalog': catalog.id
  }, { projection: { id: 1, remoteFile: 1, updatedAt: 1 } })
  const pathParsed = path.parse(new URL(resource.url).pathname)
  const title = path.parse(resource.title).name
  const remoteFile = {
    url: resource.url,
    catalog: catalog.id,
    size: resource.size,
    mimetype: resource.mime
  }
  if (pathParsed.ext && resource.mime === mime.lookup(pathParsed.base)) {
    remoteFile.name = pathParsed.base
  } else {
    remoteFile.name = title + '.' + mime.extension(resource.mime)
  }
  if (harvestedDataset) {
    const patch = getDatasetPatch(catalog, dataset, { title: dataset.title, remoteFile, status: 'imported' })
    debug('apply patch to existing resource dataset', harvestedDataset.id, patch)
    if (Object.keys(patch).length) {
      await app.get('db').collection('datasets').updateOne({ id: harvestedDataset.id }, { $set: patch })
    }
  } else {
    const id = slug(dataset.title, { lower: true, strict: true })
    debug('create new resource dataset', id)
    const newDataset = {
      id,
      title,
      owner: catalog.owner,
      schema: [],
      remoteFile,
      createdBy: { id: catalog.owner.id, name: catalog.owner.name },
      createdAt: date,
      updatedBy: { id: catalog.owner.id, name: catalog.owner.name },
      updatedAt: date,
      status: 'imported'
    }
    Object.assign(newDataset, getDatasetProps(dataset))
    await permissionsUtil.initResourcePermissions(newDataset)
    await insertDataset(app, newDataset)
  }
}

exports.searchOrganizations = async (type, url, q) => {
  const connector = exports.connectors.find(c => c.key === type)
  if (!connector) throw createError(404, 'No connector found for catalog type ' + type)
  if (!connector.optionalCapabilities.includes('searchOrganizations')) throw createError(501, `The connector for the catalog type ${type} cannot do this action`)
  return connector.searchOrganizations(url, q)
}

exports.processPublications = async function (app, type, resource) {
  const db = app.get('db')
  const resourcesCollection = db.collection(type + 's')
  const catalogsCollection = db.collection('catalogs')
  resource.public = permissionsUtil.isPublic(type + 's', resource)
  for (const p of resource.publications) {
    if (!p.id) p.id = nanoid()
  }
  await resourcesCollection.updateOne({ id: resource.id }, { $set: { publications: resource.publications } })

  const processedPublication = resource.publications.find(p => ['waiting', 'deleted'].includes(p.status))

  async function setResult (error, nonBlocking) {
    const patch = {}

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
      patch['publications.$.publishedAt'] = new Date().toISOString()
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
    return setResult('Le catalogue n\'appartient pas au propriétaire de la resource à publier', true)
  }

  try {
    const connector = exports.connectors.find(c => c.key === catalog.type)
    if (!connector) throw createError(404, 'No connector found for catalog type ' + catalog.type)
    if (!connector.publishApplication) throw createError(501, `The connector for the catalog type ${type} cannot do this action`)
    let res

    if (processedPublication.status === 'deleted') {
      if (type === 'dataset') res = await connector.deleteDataset(catalog, resource, processedPublication)
      if (type === 'application') res = await connector.deleteApplication(catalog, resource, processedPublication)
      await journals.log(app, resource, { type: 'publication', data: `Suppression de la publication vers ${catalog.title || catalog.url}` }, type)
    } else if (processedPublication.status === 'waiting') {
      const firstPublication = !processedPublication.result
      if (type === 'dataset') res = await connector.publishDataset(catalog, resource, processedPublication)
      if (type === 'application') {
        const datasets = await getApplicationDatasets(db, resource)
        // Next line is only here for compatibility.. in next generation of apps, all datasets references should be in .datasets"
        res = await connector.publishApplication(catalog, resource, processedPublication, datasets)
      }
      if (firstPublication) await journals.log(app, resource, { type: 'publication', data: `Nouvelle publication vers ${catalog.title || catalog.url}` }, type)
      else await journals.log(app, resource, { type: 'publication', data: `Publication mise à jour vers ${catalog.title || catalog.url}` }, type)
    }
    await setResult(null, res)
  } catch (err) {
    console.warn('Error while processing publication', err)
    await journals.log(app, resource, { type: 'error', data: err.message || err }, type)
    await setResult(err.message || err)
  }
}

async function getApplicationDatasets (db, app) {
  app.configuration = app.configuration || {}
  const datasetReferences = (app.configuration.datasets || []).filter(d => !!d).map(d => d.href)
  for (const k of ['datasetUrl', 'networksDatasetUrl', 'networksMembersDatasetUrl']) {
    if (app.configuration[k]) datasetReferences.push(app.configuration[k])
  }
  return db.collection('datasets').find({ id: { $in: datasetReferences.map(r => r.split('/').pop()) } }).toArray()
}
