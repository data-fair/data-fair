import fs from 'fs-extra'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import { nanoid } from 'nanoid'
import config from '#config'
import mongo from '#mongo'
import standardLicenses from '../../../contract/licenses.js'
import path from 'path'
import mime from 'mime'
import moment from 'moment'
import * as journals from '../../misc/utils/journals.js'
import * as permissionsUtil from '../../misc/utils/permissions.js'
import * as datasetUtils from '../../datasets/utils/index.js'
import debugLib from 'debug'
import * as dataFairConnector from './data-fair.js'
import * as dcatConnector from './dcat.js'
import * as geonetworkConnector from './geonetwork.js'
import * as mydatacatalogueConnector from './mydatacatalogue.js'
import * as udataConnector from './udata.js'
import * as arcgisConnector from './arcgis.js'

export const connectors = [
  { key: 'data-fair', ...dataFairConnector },
  { key: 'dcat', ...dcatConnector },
  { key: 'geonetwork', ...geonetworkConnector },
  { key: 'mydatacatalogue', ...mydatacatalogueConnector },
  { key: 'udata', ...udataConnector },
  { key: 'arcgis', ...arcgisConnector }
]

const debug = debugLib('catalogs')

// Dynamic loading of all modules in the current directory
fs.ensureDirSync(path.resolve(config.pluginsDir, 'catalogs'))

export const init = async (catalogUrl) => {
  debug('Attempt to init catalog from URL', catalogUrl)
  for (const connector of connectors) {
    try {
      const catalog = await connector.init(catalogUrl)
      if (catalog.title) {
        catalog.type = connector.key
        return catalog
      }
    } catch (err) {
      // Nothing.. an error simply means that this connector is not the right one
      debug('wrong catalog type', connector.key, err)
    }
  }
}

// Used the downloader worker to get credentials (probably API key in a header)
// to fetch resources
export const httpParams = async (catalog, url) => {
  const connector = connectors.find(c => c.key === catalog.type)
  if (!connector) throw httpError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.httpParams) throw httpError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)
  if (url.startsWith(catalog.url)) {
    const catalogHttpParams = await connector.httpParams(catalog)
    debug(`Use HTTP params from catalog ${JSON.stringify(catalogHttpParams)}`)
    return catalogHttpParams
  } else {
    debug(`the URL ${url} is not internal to the catalog ${catalog.url}, do not apply security parameters`)
    return {}
  }
}

export const listDatasets = async (db, catalog, params) => {
  const connector = connectors.find(c => c.key === catalog.type)
  if (!connector) throw httpError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw httpError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)
  const settings = (await db.collection('settings').findOne({ type: catalog.owner.type, id: catalog.owner.id })) || {}
  settings.licenses = [].concat(standardLicenses, settings.licenses || [])
  const datasets = await connector.listDatasets(catalog, params, settings)
  for (const dataset of datasets.results) {
    const harvestedDatasets = await db.collection('datasets').find({
      'owner.type': catalog.owner.type,
      'owner.id': catalog.owner.id,
      origin: dataset.page
    }, { projection: { id: 1, remoteFile: 1, isMetaOnly: 1, updatedAt: 1 } }).toArray()
    dataset.harvestedDataset = harvestedDatasets.find(d => d.isMetaOnly)
    if (dataset.resources) {
      for (const resource of dataset.resources) {
        // resource.harvestable = uploadUtils.allowedTypes.has(resource.mime)
        resource.harvestedDataset = harvestedDatasets.find(hd => hd.remoteFile && hd.remoteFile.url === resource.url)
      }
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
  await datasetUtils.insertWithId(mongo.db, newDataset)
  await journals.log(app, newDataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + newDataset.id }, 'dataset')
}

export const updateAllHarvestedDatasets = async (app, catalog) => {
  const datasets = await listDatasets(mongo.db, catalog, {})
  for (const dataset of datasets.results) {
    if (dataset.harvestedDataset) {
      await harvestDataset(app, catalog, dataset.id)
    }
    for (const resource of dataset.resources) {
      if (resource.harvestedDataset) {
        await harvestDatasetResource(app, catalog, dataset.id, resource.id, false)
      }
    }
  }
}

// create a simple metadata only dataset
export const harvestDataset = async (app, catalog, datasetId) => {
  const connector = connectors.find(c => c.key === catalog.type)
  if (!connector) throw httpError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw httpError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)

  const settings = (await mongo.db.collection('settings').findOne({ type: catalog.owner.type, id: catalog.owner.id })) || {}
  settings.licenses = [].concat(standardLicenses, settings.licenses || [])
  const dataset = await connector.getDataset(catalog, datasetId, settings)
  if (!dataset) throw httpError(404, 'Dataset not found')
  if (!dataset.page) throw httpError(404, 'Dataset is missing a page link to be harvested')

  const date = moment().toISOString()

  const harvestedDataset = await mongo.db.collection('datasets').findOne({
    'owner.type': catalog.owner.type,
    'owner.id': catalog.owner.id,
    origin: dataset.page
  }, { projection: { id: 1, attachments: 1 } })
  const attachments = []
  if (dataset.resources?.length) {
    for (const resource of dataset.resources) {
      if (resource.url) {
        attachments.push({
          title: resource.title,
          type: 'url',
          url: resource.url
        })
      }
    }
  }

  if (harvestedDataset) {
    const patch = getDatasetPatch(catalog, dataset, { title: dataset.title })
    if (attachments.length) {
      for (const attachment of attachments) {
        const existingAttachment = harvestedDataset.attachments?.find(a => a.url === attachment.url)
        if (existingAttachment?.description) attachment.description = existingAttachment.description
        if (existingAttachment?.includeInCatalogPublications) attachment.includeInCatalogPublications = existingAttachment.includeInCatalogPublications
      }
      patch.attachments = attachments
    }
    debug('apply patch to dataset', harvestedDataset.id, patch)
    if (Object.keys(patch).length) {
      await mongo.db.collection('datasets').updateOne({ id: harvestedDataset.id }, { $set: patch })
    }
  } else {
    debug('create new metadata dataset', dataset.title)
    const newDataset = getDatasetProps(dataset, {
      title: dataset.title,
      owner: catalog.owner,
      createdBy: { id: catalog.owner.id, name: catalog.owner.name },
      createdAt: date,
      updatedBy: { id: catalog.owner.id, name: catalog.owner.name },
      updatedAt: date,
      isMetaOnly: true,
      schema: []
    })
    if (attachments.length) newDataset.attachments = attachments
    await permissionsUtil.initResourcePermissions(newDataset)
    await insertDataset(app, newDataset)
  }
}

// create a file dataset from the resource of a dataset on the remote portal
export const harvestDatasetResource = async (app, catalog, datasetId, resourceId, forceDownload = true) => {
  const connector = connectors.find(c => c.key === catalog.type)
  if (!connector) throw httpError(404, 'No connector found for catalog type ' + catalog.type)
  if (!connector.listDatasets) throw httpError(501, `The connector for the catalog type ${catalog.type} cannot do this action`)

  const settings = (await mongo.db.collection('settings').findOne({ type: catalog.owner.type, id: catalog.owner.id })) || {}
  settings.licenses = [].concat(standardLicenses, settings.licenses || [])
  const dataset = await connector.getDataset(catalog, datasetId, settings)
  if (!dataset) throw httpError(404, 'Dataset not found')
  const resource = (dataset.resources || []).find(r => r.id === resourceId)
  if (!resource) throw httpError(404, 'Resource not found')
  if (!resource.url) throw httpError(404, 'Resource is missing a url to be harvested')
  // if (!uploadUtils.allowedTypes.has(resource.mime)) throw httpError(404, 'Resource format not supported')

  const date = moment().toISOString()

  const harvestedDataset = await mongo.db.collection('datasets').findOne({
    'remoteFile.url': resource.url,
    'remoteFile.catalog': catalog.id
  }, { projection: { id: 1, remoteFile: 1, updatedAt: 1 } })
  const pathParsed = path.parse(new URL(resource.url).pathname)
  const title = path.parse(resource.title).name
  const remoteFile = {
    url: resource.url,
    catalog: catalog.id,
  }
  if (resource.size) {
    remoteFile.size = resource.size
  }
  if (resource.mime) {
    remoteFile.mimetype = resource.mime
  }
  if (pathParsed.ext && resource.mime === mime.lookup(pathParsed.base)) {
    remoteFile.name = pathParsed.base
  } else if (resource.mime) {
    remoteFile.name = title + '.' + mime.extension(resource.mime)
  }
  if (harvestedDataset) {
    if (harvestedDataset.remoteFile?.autoUpdate) {
      remoteFile.autoUpdate = harvestedDataset.remoteFile?.autoUpdate
    }
    if (harvestedDataset.remoteFile && harvestedDataset.remoteFile.url === remoteFile.url) {
      if (harvestedDataset.remoteFile.etag) remoteFile.etag = harvestedDataset.remoteFile.etag
      if (harvestedDataset.remoteFile.lastModified) remoteFile.lastModified = harvestedDataset.remoteFile.lastModified
    }
    const patch = getDatasetPatch(catalog, dataset, { title: dataset.title, remoteFile })
    if (harvestedDataset.remoteFile?.url !== remoteFile.url || forceDownload) patch.status = 'imported'
    debug('apply patch to existing resource dataset', harvestedDataset.id, patch)
    if (Object.keys(patch).length) {
      await mongo.db.collection('datasets').updateOne({ id: harvestedDataset.id }, { $set: patch })
    }
  } else {
    debug('create new resource dataset', title)
    const newDataset = {
      title,
      owner: catalog.owner,
      schema: [],
      remoteFile,
      createdBy: { id: catalog.owner.id, name: catalog.owner.name },
      createdAt: date,
      updatedBy: { id: catalog.owner.id, name: catalog.owner.name },
      updatedAt: date,
      dataUpdatedBy: { id: catalog.owner.id, name: catalog.owner.name },
      dataUpdatedAt: date,
      status: 'imported'
    }
    if (connector.prepareResourceDatasetHarvest) {
      connector.prepareResourceDatasetHarvest(newDataset, catalog, dataset, resource)
    }
    Object.assign(newDataset, getDatasetProps(dataset))
    await permissionsUtil.initResourcePermissions(newDataset)
    await insertDataset(app, newDataset)
  }
}

export const searchOrganizations = async (type, url, q) => {
  const connector = connectors.find(c => c.key === type)
  if (!connector) throw httpError(404, 'No connector found for catalog type ' + type)
  if (!connector.optionalCapabilities.includes('searchOrganizations')) throw httpError(501, `The connector for the catalog type ${type} cannot do this action`)
  return connector.searchOrganizations(url, q)
}

export const processPublications = async function (app, type, resource) {
  const db = mongo.db
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
    const connector = connectors.find(c => c.key === catalog.type)
    if (!connector) throw httpError(404, 'No connector found for catalog type ' + catalog.type)
    if (!connector.publishApplication) throw httpError(501, `The connector for the catalog type ${type} cannot do this action`)
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
