const { Writable } = require('stream')
const express = require('express')
const ajv = require('ajv')()
const util = require('util')
const path = require('path')
const fs = require('fs-extra')
const moment = require('moment')
const createError = require('http-errors')
const pump = util.promisify(require('pump'))
const mongodb = require('mongodb')
const config = require('config')
const chardet = require('chardet')
const slug = require('slugify')
const sanitizeHtml = require('sanitize-html')
const CronJob = require('cron').CronJob
const journals = require('../utils/journals')
const esUtils = require('../utils/es')
const filesUtils = require('../utils/files')
const datasetAPIDocs = require('../../contract/dataset-api-docs')
const privateDatasetAPIDocs = require('../../contract/dataset-private-api-docs')
const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const datasetUtils = require('../utils/dataset')
const virtualDatasetsUtils = require('../utils/virtual-datasets')
const restDatasetsUtils = require('../utils/rest-datasets')
const visibilityUtils = require('../utils/visibility')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const extensions = require('../utils/extensions')
const attachments = require('../utils/attachments')
const geo = require('../utils/geo')
const tiles = require('../utils/tiles')
const cache = require('../utils/cache')
const cacheHeaders = require('../utils/cache-headers')
const webhooks = require('../utils/webhooks')
const outputs = require('../utils/outputs')
const limits = require('../utils/limits')
const locks = require('../utils/locks')
const datasetPatchSchema = require('../../contract/dataset-patch')
const validatePatch = ajv.compile(datasetPatchSchema)
const datasetPostSchema = require('../../contract/dataset-post')
const validatePost = ajv.compile(datasetPostSchema.properties.body)
const debugFiles = require('debug')('files')
const thumbor = require('../utils/thumbor')
const datasetFileSample = require('../utils/dataset-file-sample')
const { bulkSearchStreams } = require('../utils/master-data')
const { syncDataset: syncRemoteService } = require('./remote-services')
const baseTypes = new Set(['text/csv', 'application/geo+json'])

const router = express.Router()

function clean (publicUrl, dataset, thumbnail, draft = false) {
  thumbnail = thumbnail || '300x200'
  if (draft) datasetUtils.mergeDraft(dataset)
  dataset.public = permissions.isPublic('datasets', dataset)
  dataset.visibility = visibilityUtils.visibility(dataset)
  delete dataset.permissions
  dataset.description = dataset.description ? sanitizeHtml(dataset.description) : ''
  dataset.previews = datasetUtils.previews(dataset)
  findUtils.setResourceLinks(dataset, 'dataset', publicUrl)
  if (dataset.image && dataset.public) {
    dataset.thumbnail = thumbor.thumbnail(dataset.image, thumbnail)
  }
  if (dataset.image && publicUrl !== config.publicUrl) {
    dataset.image = dataset.image.replace(config.publicUrl, publicUrl)
  }
  return dataset
}

const checkStorage = (overwrite, indexed = false) => asyncWrap(async (req, res, next) => {
  if (process.env.NO_STORAGE_CHECK === 'true') return next()
  if (!req.get('Content-Length')) throw createError(411, 'Content-Length is mandatory')
  const contentLength = Number(req.get('Content-Length'))
  if (Number.isNaN(contentLength)) throw createError(400, 'Content-Length is not a number')
  const estimatedContentSize = contentLength - 210

  const owner = req.dataset ? req.dataset.owner : usersUtils.owner(req)
  if (config.defaultLimits.datasetStorage !== -1 && config.defaultLimits.datasetStorage < estimatedContentSize) {
    throw createError(413, 'Vous avez atteint la limite de votre espace de stockage pour ce jeu de données.')
  }
  if (config.defaultLimits.datasetIndexed !== -1 && config.defaultLimits.datasetIndexed < estimatedContentSize) {
    throw createError(413, 'Vous dépassez la taille de données indexées autorisée pour ce jeu de données.')
  }
  const remaining = await limits.remaining(req.app.get('db'), owner)
  if (overwrite && req.dataset && req.dataset.storage) {
    // ignore the size of the dataset we are overwriting
    if (remaining.storage !== -1) remaining.storage += req.dataset.storage.size
    if (remaining.indexed !== -1) remaining.indexed += req.dataset.storage.size
  }
  const storageOk = remaining.storage === -1 || ((remaining.storage - estimatedContentSize) >= 0)
  const indexedOk = !indexed || remaining.indexed === -1 || ((remaining.indexed - estimatedContentSize) >= 0)
  if (!storageOk || !indexedOk) {
    try {
      await pump(
        req,
        new Writable({
          write (chunk, encoding, callback) {
          // do nothing wa just want to drain the request
            callback()
          }
        })
      )
    } catch (err) {
      console.error('Failure to drain request that was rejected for exceeding storage limit', err)
    }
    if (!storageOk) throw createError(429, 'Vous avez atteint la limite de votre espace de stockage.')
    if (!indexedOk) throw createError(429, 'Vous avez atteint la limite de votre espace de données indexées.')
  }
  next()
})

// check if the endpoint is called from an application with an unauthenticated readOnly application key
const applicationKey = asyncWrap(async (req, res, next) => {
  const referer = req.headers.referer || req.headers.referrer
  if (referer) {
    const refererUrl = new URL(referer)
    const key = refererUrl && refererUrl.searchParams && refererUrl.searchParams.get('key')
    if (key) {
      const applicationKeys = await req.app.get('db').collection('applications-keys').findOne({ 'keys.id': key })
      if (applicationKeys) {
        const filter = {
          id: applicationKeys._id,
          'owner.type': req.dataset.owner.type,
          'owner.id': req.dataset.owner.id,
          'configuration.datasets.href': `${config.publicUrl}/api/v1/datasets/${req.dataset.id}`
        }
        const matchingApplication = await req.app.get('db').collection('applications').count(filter)
        if (matchingApplication) req.bypassPermission = true
      }
    }
  }
  next()
})

// create short ids for extensions that will be used as prefix of the properties ids in the schema
// try to make something both readable and with little conflict risk (but not 0 risk)
const prepareExtensions = (req, extensions, oldExtensions = []) => {
  extensions
    .filter(e => !e.shortId && !e.propertyPrefix)
    .forEach(e => {
      const oldExtension = oldExtensions.find(oldE => oldE.remoteService === e.remoteService && oldE.action === e.action)
      if (oldExtension) {
        // do not reprocess already assigned shortIds / propertyPrefixes to prevent compatibility break
        if (oldExtension.shortId) e.shortId = oldExtension.shortId
        if (oldExtension.propertyPrefix) e.propertyPrefix = oldExtension.propertyPrefix
      } else {
        // only apply to new extensions to prevent compatibility break
        let propertyPrefix = e.action.toLowerCase();
        ['masterdata', 'find', 'bulk', 'search'].forEach(term => { propertyPrefix = propertyPrefix.replace(term, '') });
        [':', '-', '.', ' '].forEach(char => { propertyPrefix = propertyPrefix.replace(char, '_') })
        if (propertyPrefix.startsWith('post')) propertyPrefix = propertyPrefix.replace('post', '')
        e.propertyPrefix = propertyPrefix.replace(/__/g, '_').replace(/^_/, '').replace(/_$/, '')
        e.propertyPrefix = '_' + e.propertyPrefix

        // TODO: also check if there is a conflict with an existing calculate property ?
      }
    })
  const propertyPrefixes = extensions.filter(e => !!e.propertyPrefix).map(e => e.propertyPrefix)
  if (propertyPrefixes.length !== [...new Set(propertyPrefixes)].length) {
    throw createError(400, req.__('errors.extensionShortIdConflict'))
  }
}

// Get the list of datasets
router.get('', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const datasets = req.app.get('db').collection('datasets')
  const filterFields = {
    concepts: 'schema.x-refersTo',
    'field-type': 'schema.type',
    'field-format': 'schema.format',
    children: 'virtual.children',
    services: 'extensions.remoteService',
    status: 'status',
    topics: 'topics.id',
    publicationSites: 'publicationSites'
  }
  const facetFields = {
    ...filterFields,
    topics: 'topics'
  }
  const nullFacetFields = ['publicationSites']
  const extraFilters = []
  if (req.query.bbox === 'true') {
    extraFilters.push({ bbox: { $ne: null } })
  }
  if (req.query.queryable === 'true') {
    extraFilters.push({ isMetaOnly: { $ne: true } })
    extraFilters.push({ finalizedAt: { $ne: null } })
  }
  const query = findUtils.query(req, Object.assign({
    filename: 'originalFile.name',
    ids: 'id',
    id: 'id',
    rest: 'isRest',
    virtual: 'isVirtual',
    metaOnly: 'isMetaOnly'
  }, filterFields), null, extraFilters)
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select)
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? datasets.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    datasets.countDocuments(query)
  ]
  if (req.query.facets) {
    mongoQueries.push(datasets.aggregate(findUtils.facetsQuery(req, facetFields, filterFields, nullFacetFields, extraFilters)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list('datasets', r, req.user)
    clean(req.publicBaseUrl, r, req.query.thumbnail)
  })
  facets = findUtils.parseFacets(facets, nullFacetFields)
  res.json({ count, results, facets })
}))

// Shared middleware to apply a lock on the modified resource
const lockDataset = (_shouldLock = true) => asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  const shouldLock = typeof _shouldLock === 'function' ? _shouldLock(req.body, req.query) : _shouldLock
  if (!shouldLock) return next()
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    const lockKey = `dataset:${req.params.datasetId}`
    const ack = await locks.acquire(db, lockKey)
    if (ack) {
      res.on('close', () => locks.release(db, lockKey).catch(err => console.error('failure to release dataset lock', err)))
      return next()
    } else {
      // dataset found but locked : we cannot safely work on it, wait a little while before failing
      await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
    }
  }
  throw createError(409, 'Le jeu de données n\'est pas dans un état permettant l\'opération demandée.')
})
// Shared middleware to read dataset in db
// also checks that the dataset is in a state compatible with some action
// supports waiting a little bit to be a little permissive with the user
const readDataset = (_acceptedStatuses, preserveDraft, ignoreDraft) => asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  const acceptedStatuses = typeof _acceptedStatuses === 'function' ? _acceptedStatuses(req.body) : _acceptedStatuses
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    req.dataset = req.resource = await db.collection('datasets')
      .findOne({ id: req.params.datasetId }, { projection: { _id: 0 } })
    if (!req.dataset) return res.status(404).send('Dataset not found')
    // in draft mode the draft is automatically merged and all following operations use dataset.draftReason to adapt
    if (preserveDraft) {
      req.dataset.prod = { ...req.dataset }
    }
    if ((preserveDraft || req.query.draft === 'true') && req.dataset.draft) {
      Object.assign(req.dataset, req.dataset.draft)
      if (!req.dataset.draft.finalizedAt) delete req.dataset.finalizedAt
      if (!req.dataset.draft.bbox) delete req.dataset.bbox
    }
    if (!preserveDraft) {
      delete req.dataset.draft
    }

    req.resourceType = 'datasets'
    if (
      req.dataset.status !== 'draft' &&
      (req.isNewDataset || !acceptedStatuses || acceptedStatuses.includes(req.dataset.status))
    ) return next()

    if (req.dataset.status === 'draft' && ignoreDraft) return next()

    // dataset found but not in proper state.. wait a little while
    await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
  }
  throw createError(409, `Le jeu de données n'est pas dans un état permettant l'opération demandée. État courant : ${req.dataset.status}.`)
})

router.use('/:datasetId/permissions', readDataset(), permissions.router('datasets', 'dataset', async (req, patchedDataset) => {
  // this callback function is called when the resource becomes public
  const db = req.app.get('db')
  for (const publicationSite of patchedDataset.publicationSites || []) {
    webhooks.trigger(db, 'dataset', patchedDataset, { type: `published:${publicationSite}` })
    for (const topic of patchedDataset.topics || []) {
      webhooks.trigger(db, 'dataset', patchedDataset, { type: `published-topic:${publicationSite}:${topic.id}` })
    }
  }
}))

// retrieve a dataset by its id
router.get('/:datasetId', readDataset(), applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.dataset.userPermissions = permissions.list('datasets', req.dataset, req.user)
  res.status(200).send(clean(req.publicBaseUrl, req.dataset, req.query.thumbnail))
})

// retrieve only the schema.. Mostly useful for easy select fields
router.get('/:datasetId/schema', readDataset(), applicationKey, permissions.middleware('readSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
  let schema = req.dataset.schema
  if (req.query.mimeType === 'application/tableschema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-tableschema.json"`)
    schema = datasetUtils.tableSchema(schema)
  } else if (req.query.mimeType === 'application/schema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-schema.json"`)
    schema = datasetUtils.jsonSchema(schema, req.publicBaseUrl)
  } else {
    schema.forEach(field => {
      field.label = field.title || field['x-originalName'] || field.key
    })
    if (req.query.type) {
      const types = req.query.type.split(',')
      schema = schema.filter(field => types.includes(field.type))
    }
    if (req.query.format) {
      const formats = req.query.format.split(',')
      schema = schema.filter(field => formats.includes(field.format))
    }
    if (req.query.enum === 'true') {
      schema = schema.filter(field => !!field.enum)
    }
    if (req.query.calculated === 'false') {
      schema = schema.filter(field => !field['x-calculated'])
    }
  }
  res.status(200).send(schema)
})

// Update a dataset's metadata
router.patch('/:datasetId', lockDataset((patch) => {
  return !!(patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)
}), readDataset((patch) => {
  // accept different statuses of the dataset depending on the content of the patch
  if (patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection) {
    return ['finalized', 'error']
  } else {
    return null
  }
}), permissions.middleware('writeDescription', 'write'), asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const patch = req.body
  if (!validatePatch(patch)) return res.status(400).send(validatePatch.errors)

  // Changed a previously failed dataset, retry everything.
  // Except download.. We only try it again if the fetch failed.
  if (req.dataset.status === 'error') {
    if (req.dataset.isVirtual) patch.status = 'indexed'
    else if (req.dataset.isRest) patch.status = 'analyzed'
    else if (req.dataset.remoteFile && !req.dataset.originalFile) patch.status = 'imported'
    else if (!baseTypes.has(req.dataset.originalFile.mimetype)) patch.status = 'uploaded'
    else patch.status = 'loaded'
  }

  // Ignore patch that doesn't bring actual change
  Object.keys(patch).forEach(patchKey => {
    if (JSON.stringify(patch[patchKey]) === JSON.stringify(req.dataset[patchKey])) { delete patch[patchKey] }
  })
  if (Object.keys(patch).length === 0) return res.status(200).send(clean(req.publicBaseUrl, req.dataset))

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }

  if (patch.extensions) prepareExtensions(req, patch.extensions, req.dataset.extensions)
  if (patch.extensions || req.dataset.extensions) {
    patch.schema = await extensions.prepareSchema(db, patch.schema || req.dataset.schema, patch.extensions || req.dataset.extensions)
  }

  // Re-publish publications
  if (!patch.publications && req.dataset.publications && req.dataset.publications.length) {
    req.dataset.publications.filter(p => p.status !== 'deleted').forEach(p => { p.status = 'waiting' })
    patch.publications = req.dataset.publications
  }

  // manage automatic export of REST datasets into files
  if (patch.exports && patch.exports.restToCSV) {
    if (patch.exports.restToCSV.active) {
      const job = new CronJob(config.exportRestDatasets.cron, () => {})
      patch.exports.restToCSV.nextExport = job.nextDates().toISOString()
    } else {
      delete patch.exports.restToCSV.nextExport
      if (await fs.pathExists(datasetUtils.exportedFileName(req.dataset, '.csv'))) {
        await fs.remove(datasetUtils.exportedFileName(req.dataset, '.csv'))
      }
    }
    patch.exports.restToCSV.lastExport = req.dataset?.exports?.restToCSV?.lastExport
  }

  if (req.dataset.isVirtual) {
    if (patch.schema || patch.virtual) {
      patch.schema = await virtualDatasetsUtils.prepareSchema(db, { ...req.dataset, ...patch })
      patch.status = 'indexed'
    }
  } else if (patch.extensions) {
    // extensions have changed, trigger full re-indexing
    patch.status = 'analyzed'
    if (req.dataset.isRest && req.dataset.extensions) {
      const removedExtensions = req.dataset.extensions.filter(e => !patch.extensions.find(pe => e.remoteService === pe.remoteService && e.action === pe.action))
      if (removedExtensions.length) {
        await restDatasetsUtils.collection(db, req.dataset).updateMany({},
          { $unset: removedExtensions.reduce((a, re) => { a[extensions.getExtensionKey(re)] = ''; return a }, {}) }
        )
        await datasetUtils.updateStorage(db, req.dataset)
      }
    }
  } else if (patch.projection && (!req.dataset.projection || patch.projection.code !== req.dataset.projection.code)) {
    // geo projection has changed, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (patch.schema && geo.geoFieldsKey(patch.schema) !== geo.geoFieldsKey(req.dataset.schema)) {
    // geo concepts haved changed, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.separator !== f.separator))) {
    // some separator has changed on a field, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.ignoreDetection !== f.ignoreDetection))) {
    // some ignoreDetection param has changed on a field, trigger full analysis / re-indexing
    patch.status = 'loaded'
  } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.ignoreIntegerDetection !== f.ignoreIntegerDetection))) {
    // some ignoreIntegerDetection param has changed on a field, trigger full analysis / re-indexing
    patch.status = 'loaded'
  } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.timeZone !== f.timeZone))) {
    // some timeZone has changed on a field, trigger full re-indexing
    patch.status = 'analyzed'
  } else if (req.dataset.isRest && patch.schema && req.dataset.schema.find(df => !df['x-calculated'] && !df['x-extension'] && !patch.schema.find(f => f.key === df.key))) {
    // some property was removed in rest dataset, trigger full re-indexing
    const deleteFields = req.dataset.schema.filter(df => !df['x-calculated'] && !df['x-extension'] && !patch.schema.find(f => f.key === df.key))
    await restDatasetsUtils.collection(db, req.dataset).updateMany({},
      { $unset: deleteFields.reduce((a, df) => { a[df.key] = ''; return a }, {}) }
    )
    await datasetUtils.updateStorage(db, req.dataset)
    patch.status = 'analyzed'
  } else if (patch.schema) {
    try {
      // this method will routinely throw errors
      // we just try in case elasticsearch considers the new mapping compatible
      // so that we might optimize and reindex only when necessary
      await esUtils.updateDatasetMapping(req.app.get('es'), { id: req.dataset.id, schema: patch.schema })
      patch.status = 'indexed'
    } catch (err) {
      // generated ES mappings are not compatible, trigger full re-indexing
      patch.status = 'analyzed'
    }
  } else if (patch.thumbnails || patch.masterData) {
    // just change finalizedAt so that cache is invalidated, but the worker doesn't relly need to work on the dataset
    patch.finalizedAt = (new Date()).toISOString()
  }

  const previousPublicationSites = req.dataset.publicationSites || []
  const previousTopics = req.dataset.topics || []

  await datasetUtils.applyPatch(db, req.dataset, patch)

  // send webhooks/notifs based on changes during this patch
  const newPublicationSites = req.dataset.publicationSites || []
  const newTopics = req.dataset.topics || []
  for (const publicationSite of newPublicationSites) {
    // send a notification either because the publicationSite was added, or because the visibility changed
    if (!previousPublicationSites.includes(publicationSite)) {
      webhooks.trigger(db, 'dataset', req.dataset, { type: `published:${publicationSite}` })
      for (const topic of newTopics) {
        webhooks.trigger(db, 'dataset', req.dataset, { type: `published-topic:${publicationSite}:${topic.id}` })
      }
    }
  }
  for (const topic of newTopics) {
    // send a notification either because the topic was added
    if (!previousTopics.find(t => t.id === topic.id)) {
      for (const publicationSite of newPublicationSites) {
        webhooks.trigger(db, 'dataset', req.dataset, { type: `published-topic:${publicationSite}:${topic.id}` })
      }
    }
  }

  await syncRemoteService(db, req.dataset)

  res.status(200).json(clean(req.publicBaseUrl, req.dataset))
}))

// Change ownership of a dataset
router.put('/:datasetId/owner', readDataset(), permissions.middleware('changeOwner', 'admin'), asyncWrap(async (req, res) => {
  // Must be able to delete the current dataset, and to create a new one for the new owner to proceed
  if (!req.user.adminMode) {
    if (req.body.type === 'user' && req.body.id !== req.user.id) return res.status(403).send()
    if (req.body.type === 'organization') {
      const userOrg = req.user.organizations.find(o => o.id === req.body.id)
      if (!userOrg) return res.status(403).send()
      if (![config.contribRole, config.adminRole].includes(userOrg.role)) return res.status(403).send()
    }
  }

  const patch = {
    owner: req.body,
    updatedBy: { id: req.user.id, name: req.user.name },
    updatedAt: moment().toISOString()
  }
  const patchedDataset = (await req.app.get('db').collection('datasets')
    .findOneAndUpdate({ id: req.params.datasetId }, { $set: patch }, { returnDocument: 'after' })).value

  // Move all files
  try {
    await fs.move(datasetUtils.dir(req.dataset), datasetUtils.dir(patchedDataset))
  } catch (err) {
    console.error('Error while moving dataset directory', err)
  }

  await syncRemoteService(req.app.get('db'), patchedDataset)

  res.status(200).json(clean(req.publicBaseUrl, patchedDataset))
}))

// Delete a dataset
router.delete('/:datasetId', readDataset(null, null, true), permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  await datasetUtils.delete(req.app.get('db'), req.app.get('es'), req.dataset)
  await syncRemoteService(req.app.get('db'), { ...req.dataset, masterData: null })
  await datasetUtils.updateNbDatasets(req.app.get('db'), req.dataset.owner)
  res.sendStatus(204)
}))

const initNew = async (db, req) => {
  const dataset = { ...req.body }
  dataset.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  dataset.createdAt = dataset.updatedAt = date
  dataset.createdBy = dataset.updatedBy = { id: req.user.id, name: req.user.name }
  dataset.permissions = []
  dataset.schema = dataset.schema || []
  if (dataset.extensions) {
    prepareExtensions(req, dataset.extensions)
    dataset.schema = await extensions.prepareSchema(db, dataset.schema, dataset.extensions)
  }
  return dataset
}

const setFileInfo = async (db, file, attachmentsFile, dataset, draft, res) => {
  const patch = {
    dataUpdatedBy: dataset.updatedBy,
    dataUpdatedAt: dataset.updatedAt
  }
  if (file) {
    patch.originalFile = {
      name: file.originalname,
      size: file.size,
      mimetype: file.mimetype
    }
  }

  if (!dataset.id) {
    const baseTitle = dataset.title || path.parse(file.originalname).name.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).join(' ')
    const baseId = slug(baseTitle, { lower: true, strict: true })
    dataset.id = baseId
    dataset.title = baseTitle
    let i = 1; let dbExists = false; let fileExists = false
    do {
      if (i > 1) {
        dataset.id = baseId + i
        dataset.title = baseTitle + ' ' + i
      }
      // better to check file as well as db entry in case of file currently uploading
      dbExists = await db.collection('datasets').countDocuments({ id: dataset.id })
      fileExists = await fs.exists(datasetUtils.dir(dataset))
      i += 1
    } while (dbExists || fileExists)

    if (draft) {
      dataset.status = 'draft'
      patch.draftReason = { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon' }
    }

    await fs.ensureDir(datasetUtils.dir({ ...dataset, ...patch }))
    await fs.move(file.path, datasetUtils.originalFileName({ ...dataset, ...patch }))
  } else {
    if (draft) {
      patch.draftReason = { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant' }
    }
  }
  dataset.title = dataset.title || file.title

  // in draft mode this file replacement will occur later, when draft is validated
  if (!draft) {
    const oldOriginalFileName = dataset.originalFile && datasetUtils.originalFileName({ ...dataset, ...patch, originalFile: dataset.originalFile })
    const newOriginalFileName = datasetUtils.originalFileName({ ...dataset, ...patch })
    if (oldOriginalFileName && oldOriginalFileName !== newOriginalFileName) {
      await fs.remove(oldOriginalFileName)
    }
  }

  if (file && !baseTypes.has(file.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    patch.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    patch.status = 'loaded'
    if (file) {
      patch.file = patch.originalFile
      const fileName = datasetUtils.fileName({ ...dataset, ...patch })
      // Try to prevent weird bug with NFS by forcing syncing file before sampling
      const fd = await fs.open(fileName, 'r')
      await fs.fsync(fd)
      await fs.close(fd)
      const fileSample = await datasetFileSample({ ...dataset, ...patch })
      debugFiles(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${fileName}`)
      patch.file.encoding = chardet.detect(fileSample)
      debugFiles(`Detected encoding ${patch.file.encoding} for file ${fileName}`)
    }
  }

  if (draft && !file && !await fs.pathExists(datasetUtils.fileName({ ...dataset, ...patch }))) {
    // this happens if we upload only the attachments, not the data file itself
    // in this case copy the one from prod
    await fs.copy(datasetUtils.fileName(dataset), datasetUtils.fileName({ ...dataset, ...patch }))
  }
  if (draft && !attachmentsFile && await fs.pathExists(datasetUtils.attachmentsDir(dataset)) && !await fs.pathExists(datasetUtils.attachmentsDir({ ...dataset, ...patch }))) {
    // this happens if we upload only the main data file and not the attachments
    // in this case copy the attachments directory from prod
    await fs.copy(datasetUtils.attachmentsDir(dataset), datasetUtils.attachmentsDir({ ...dataset, ...patch }))
  }

  if (attachmentsFile) {
    await attachments.replaceAllAttachments({ ...dataset, ...patch }, attachmentsFile)
  }

  if (draft) {
    dataset.draft = patch
  } else {
    Object.assign(dataset, patch)
  }
  return dataset
}

// Create a dataset by uploading data
const beforeUpload = asyncWrap(async (req, res, next) => {
  if (!req.user) return res.status(401).send()
  const owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(owner, 'datasets', 'post', req.user, req.app.get('db'))) return res.sendStatus(403)
  if ((await limits.remaining(req.app.get('db'), owner)).nbDatasets === 0) {
    return res.status(429).send('Vous avez atteint votre nombre maximal de jeux de données autorisés.')
  }
  next()
})
router.post('', beforeUpload, checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fixFormBody(validatePost), asyncWrap(async (req, res) => {
  req.files = req.files || []
  debugFiles('POST datasets uploaded some files', req.files)
  try {
    const db = req.app.get('db')

    let dataset
    // After uploadFile, req.files contains the metadata of an uploaded file, and req.body the content of additional text fields
    const datasetFile = req.files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
    const attachmentsFile = req.files.find(f => f.fieldname === 'attachments')
    if (datasetFile) {
      if (req.body.isVirtual) throw createError(400, 'Un jeu de données virtuel ne peut pas être initialisé avec un fichier')
      // TODO: do this in a worker instead ?
      const datasetPromise = setFileInfo(db, datasetFile, attachmentsFile, await initNew(db, req), req.query.draft === 'true', res)
      await Promise.race([datasetPromise, new Promise(resolve => setTimeout(resolve, 5000))])
      // send header at this point, if we are not finished processing files
      // asyncWrap keepalive option will keep request alive
      res.writeHeader(201, { 'Content-Type': 'application/json' })
      res.write(' ')
      try {
        dataset = await datasetPromise
      } catch (err) {
        // should not happen too often, but sometimes we get an error after sending the 201 status
        // we return an error object nevertheless, better than to do nothing
        res.send({ error: err.message })
        throw err
      }
      const lockKey = `dataset:${dataset.id}`
      const ack = await locks.acquire(db, lockKey)
      if (ack) res.on('close', () => locks.release(db, lockKey).catch(err => console.error('failure to release dataset lock', err)))
      await db.collection('datasets').insertOne(dataset)
      await datasetUtils.updateStorage(db, dataset)
    } else if (req.body.isVirtual) {
      if (!req.body.title) throw createError(400, 'Un jeu de données virtuel doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données virtuel ne peut pas avoir de pièces jointes')
      if (!validatePost(req.body)) {
        throw createError(400, JSON.stringify(validatePost.errors))
      }
      dataset = await initNew(db, req)
      dataset.virtual = dataset.virtual || { children: [] }
      dataset.schema = await virtualDatasetsUtils.prepareSchema(db, dataset)
      dataset.status = 'indexed'
      const baseId = slug(req.body.title).toLowerCase()
      await datasetUtils.insertWithBaseId(db, dataset, baseId, res)
    } else if (req.body.isRest) {
      if (!req.body.title) throw createError(400, 'Un jeu de données éditable doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données éditable ne peut pas être créé avec des pièces jointes')
      if (!validatePost(req.body)) {
        throw createError(400, JSON.stringify(validatePost.errors))
      }
      dataset = await initNew(db, req)
      dataset.rest = dataset.rest || {}
      dataset.schema = dataset.schema || []
      // the dataset will go through a first index/finalize steps, not really necessary
      // but this way everything will be initialized (journal, index)
      dataset.status = 'analyzed'
      const baseId = slug(req.body.title).toLowerCase()
      await datasetUtils.insertWithBaseId(db, dataset, baseId, res)
      await restDatasetsUtils.initDataset(db, dataset)
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { status: 'analyzed' } })
    } else if (req.body.isMetaOnly) {
      if (!req.body.title) throw createError(400, 'Un jeu de données métadonnées doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données métadonnées ne peut pas être créé avec des pièces jointes')
      if (!validatePost(req.body)) {
        throw createError(400, JSON.stringify(validatePost.errors))
      }
      dataset = await initNew(db, req)
      const baseId = slug(req.body.title).toLowerCase()
      await datasetUtils.insertWithBaseId(db, dataset, baseId, res)
    } else {
      throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "éditable" ou "métadonnées"')
    }

    delete dataset._id

    await datasetUtils.updateNbDatasets(req.app.get('db'), dataset.owner)
    await journals.log(req.app, dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id }, 'dataset')
    await syncRemoteService(db, dataset)
    res.status(201).send(clean(req.publicBaseUrl, dataset, null, req.query.draft === 'true'))
  } catch (err) {
    // Wrapped the whole thing in a try/catch to remove files in case of failure
    for (const file of req.files) {
      await fs.remove(file.path)
    }
    throw err
  }
}, { keepalive: true }))

// PUT or POST with an id to create or update an existing dataset data
const attemptInsert = asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (!req.user) return res.status(401).send()

  const newDataset = await initNew(db, req)
  newDataset.id = req.params.datasetId

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newDataset.owner, 'datasets', 'post', req.user, db)) {
    try {
      await req.app.get('db').collection('datasets').insertOne(newDataset)
      req.isNewDataset = true
      if ((await limits.remaining(req.app.get('db'), newDataset.owner)).nbDatasets === 0) {
        return res.status(429, 'Vous avez atteint votre nombre maximal de jeux de données autorisés.')
      }
      await datasetUtils.updateNbDatasets(req.app.get('db'), newDataset.owner)
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
const updateDataset = asyncWrap(async (req, res) => {
  const draft = req.query.draft === 'true'
  req.files = req.files || []
  debugFiles('PUT datasets uploaded some files', req.files)
  try {
    const db = req.app.get('db')
    // After uploadFile, req.files contains the metadata of an uploaded file, and req.body the content of additional text fields
    const datasetFile = req.files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
    const attachmentsFile = req.files.find(f => f.fieldname === 'attachments')
    if (!datasetFile && !attachmentsFile && !req.dataset.isVirtual && !req.dataset.isRest && !req.dataset.isMetaOnly) throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "éditable" ou "métadonnées seules"')
    if (datasetFile && (req.dataset.isVirtual || req.dataset.isRest || req.dataset.isMetaOnly)) throw createError(400, 'Un jeu de données est soit initialisé avec un fichier soit déclaré "virtuel" ou "éditable" ou "métadonnées seules"')
    if (req.dataset.isVirtual && !req.dataset.title) throw createError(400, 'Un jeu de données virtuel doit être créé avec un titre')
    if (req.dataset.isRest && !req.dataset.title) throw createError(400, 'Un jeu de données éditable doit être créé avec un titre')
    if (req.dataset.isMetaOnly && !req.dataset.title) throw createError(400, 'Un jeu de données métadonnées seules doit être créé avec un titre')
    if (req.dataset.isVirtual && attachmentsFile) throw createError(400, 'Un jeu de données virtuel ne peut pas avoir des pièces jointes')
    if (req.dataset.isRest && attachmentsFile) throw createError(400, 'Un jeu de données éditable ne peut pas être créé avec des pièces jointes')
    if (req.dataset.isMetaOnly && attachmentsFile) throw createError(400, 'Un jeu de données métadonnées seules ne peut pas être créé avec des pièces jointes')

    let dataset = req.dataset
    req.body.schema = req.body.schema || dataset.schema || []
    if (req.body.extensions) {
      prepareExtensions(req, req.body.extensions, dataset.extensions)
      req.body.schema = await extensions.prepareSchema(db, req.body.schema, req.body.extensions)
    }

    req.body.updatedBy = { id: req.user.id, name: req.user.name }
    req.body.updatedAt = moment().toISOString()

    if (datasetFile || attachmentsFile) {
      // send header at this point, then asyncWrap keepalive option will keep request alive while we process files
      // TODO: do this in a worker instead ?
      res.writeHeader(req.isNewDataset ? 201 : 200, { 'Content-Type': 'application/json' })
      res.write(' ')

      dataset = await setFileInfo(db, datasetFile, attachmentsFile, { ...dataset, ...req.body }, req.query.draft === 'true', res)
      if (req.query.skipAnalysis === 'true') req.body.status = 'analyzed'
    } else if (dataset.isVirtual) {
      const { isVirtual, updatedBy, updatedAt, ...patch } = req.body
      if (!validatePatch(patch)) {
        throw createError(400, validatePatch.errors)
      }
      req.body.virtual = req.body.virtual || { children: [] }
      req.body.schema = await virtualDatasetsUtils.prepareSchema(db, { ...dataset, ...req.body })
      req.body.status = 'indexed'
    } else if (dataset.isRest) {
      const { isRest, updatedBy, updatedAt, ...patch } = req.body
      if (!validatePatch(patch)) {
        throw createError(400, validatePatch.errors)
      }
      req.body.rest = req.body.rest || {}
      if (req.isNewDataset) {
        await restDatasetsUtils.initDataset(db, { ...dataset, ...req.body })
        dataset.status = 'analyzed'
      } else {
        try {
          // this method will routinely throw errors
          // we just try in case elasticsearch considers the new mapping compatible
          // so that we might optimize and reindex only when necessary
          await esUtils.updateDatasetMapping(req.app.get('es'), { id: req.dataset.id, schema: req.body.schema })
          // Back to indexed state if schema did not change in significant manner
          req.body.status = 'indexed'
        } catch (err) {
          // generated ES mappings are not compatible, trigger full re-indexing
          req.body.status = 'analyzed'
        }
      }
    }
    if (draft) {
      delete dataset.draftReason
      Object.assign(dataset.draft, req.body)
    } else {
      Object.assign(dataset, req.body)
    }
    await db.collection('datasets').replaceOne({ id: req.params.datasetId }, dataset)
    if (req.isNewDataset) await journals.log(req.app, dataset, { type: 'dataset-created' }, 'dataset')
    else if (!dataset.isRest && !dataset.isVirtual) {
      await journals.log(
        req.app,
        req.query.draft === 'true' ? datasetUtils.mergeDraft({ ...dataset }) : dataset,
        { type: 'data-updated' }, 'dataset')
    }
    await Promise.all([
      datasetUtils.updateStorage(db, dataset),
      syncRemoteService(db, dataset)
    ])
    res.status(req.isNewDataset ? 201 : 200).send(clean(req.publicBaseUrl, dataset, null, req.query.draft === 'true'))
  } catch (err) {
    // Wrapped the whole thing in a try/catch to remove files in case of failure
    for (const file of req.files) {
      await fs.remove(file.path)
    }
    throw err
  }
}, { keepalive: true })
router.post('/:datasetId', lockDataset(), attemptInsert, readDataset(['finalized', 'error']), permissions.middleware('writeData', 'write'), checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fixFormBody(validatePost), updateDataset)
router.put('/:datasetId', lockDataset(), attemptInsert, readDataset(['finalized', 'error']), permissions.middleware('writeData', 'write'), checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fixFormBody(validatePost), updateDataset)

// validate the draft
router.post('/:datasetId/draft', lockDataset(), readDataset(['finalized'], true), permissions.middleware('validateDraft', 'write'), asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (!req.dataset.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  const patch = {
    ...req.dataset.draft,
    updatedAt: moment().toISOString(),
    updatedBy: { id: req.user.id, name: req.user.name }
  }
  if (req.dataset.draft.dataUpdatedAt) {
    patch.dataUpdatedAt = patch.updatedAt
    patch.dataUpdatedBy = patch.updatedBy
  }
  delete patch.status
  delete patch.finalizedAt
  delete patch.draftReason
  delete patch.count
  delete patch.bbox
  delete patch.storage
  const patchedDataset = (await db.collection('datasets').findOneAndUpdate({ id: req.params.datasetId },
    { $set: patch, $unset: { draft: '' } },
    { returnDocument: 'after' }
  )).value
  if (req.dataset.prod.originalFile) await fs.remove(datasetUtils.originalFileName(req.dataset.prod))
  if (req.dataset.prod.file) {
    await fs.remove(datasetUtils.fileName(req.dataset.prod))
    await fs.remove(datasetUtils.fullFileName(req.dataset.prod))
    webhooks.trigger(db, 'dataset', patchedDataset, { type: 'data-updated' })

    // WARNING, this functionality is kind of a duplicate of the UI in dataset-schema.vue
    for (const field of req.dataset.prod.schema) {
      if (field['x-calculated']) continue
      const patchedField = patchedDataset.schema.find(pf => pf.key === field.key)
      if (!patchedField) {
        webhooks.trigger(db, 'dataset', patchedDataset, {
          type: 'breaking-change',
          body: require('i18n').getLocales().reduce((a, locale) => {
            a[locale] = req.__({ phrase: 'breakingChanges.missing', locale }, { title: patchedDataset.title, key: field.key })
            return a
          }, {})
        })
        continue
      }
      if (patchedField.type !== field.type) {
        webhooks.trigger(db, 'dataset', patchedDataset, {
          type: 'breaking-change',
          body: require('i18n').getLocales().reduce((a, locale) => {
            a[locale] = req.__({ phrase: 'breakingChanges.type', locale }, { title: patchedDataset.title, key: field.key })
            return a
          }, {})
        })
        continue
      }
      const format = (field.format && field.format !== 'uri-reference') ? field.format : null
      const patchedFormat = (patchedField.format && patchedField.format !== 'uri-reference') ? patchedField.format : null
      if (patchedFormat !== format) {
        webhooks.trigger(db, 'dataset', patchedDataset, {
          type: 'breaking-change',
          body: require('i18n').getLocales().reduce((a, locale) => {
            a[locale] = req.__({ phrase: 'breakingChanges.type', locale }, { title: patchedDataset.title, key: field.key })
            return a
          }, {})
        })
        continue
      }
    }
  }
  await fs.ensureDir(datasetUtils.dir(patchedDataset))
  await fs.move(datasetUtils.originalFileName(req.dataset), datasetUtils.originalFileName(patchedDataset))
  if (await fs.pathExists(datasetUtils.attachmentsDir(req.dataset))) {
    await fs.remove(datasetUtils.attachmentsDir(patchedDataset))
    await fs.move(datasetUtils.attachmentsDir(req.dataset), datasetUtils.attachmentsDir(patchedDataset))
  }

  const statusPatch = { status: baseTypes.has(req.dataset.originalFile.mimetype) ? 'analyzed' : 'uploaded' }
  const statusPatchedDataset = (await db.collection('datasets').findOneAndUpdate({ id: req.params.datasetId },
    { $set: statusPatch },
    { returnDocument: 'after' }
  )).value
  await journals.log(req.app, statusPatchedDataset, { type: 'draft-validated' }, 'dataset')

  await esUtils.delete(req.app.get('es'), req.dataset)
  await datasetUtils.updateStorage(db, statusPatchedDataset)
  return res.send(statusPatchedDataset)
}))

// cancel the draft
router.delete('/:datasetId/draft', lockDataset(), readDataset(['finalized', 'error'], true), permissions.middleware('cancelDraft', 'write'), asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (!req.dataset.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  await journals.log(req.app, req.dataset, { type: 'draft-cancelled' }, 'dataset')
  const patchedDataset = (await db.collection('datasets')
    .findOneAndUpdate({ id: req.params.datasetId }, { $unset: { draft: '' } }, { returnDocument: 'after' })).value
  await fs.remove(datasetUtils.dir(req.dataset))
  await esUtils.delete(req.app.get('es'), req.dataset)
  await datasetUtils.updateStorage(db, patchedDataset)
  return res.send(patchedDataset)
}))

// CRUD operations for REST datasets
function isRest (req, res, next) {
  if (!req.dataset.isRest) {
    return res.status(501)
      .send('Les opérations de modifications sur les lignes sont uniquement accessibles pour les jeux de données de type REST.')
  }
  next()
}
router.get('/:datasetId/lines/:lineId', readDataset(), isRest, permissions.middleware('readLine', 'read', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readLine))
router.post('/:datasetId/lines', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.createLine))
router.put('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.updateLine))
router.patch('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.patchLine))
router.post('/:datasetId/_bulk_lines', lockDataset((body, query) => query.lock === 'true'), readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('bulkLines', 'write'), checkStorage(false), restDatasetsUtils.uploadBulk, asyncWrap(restDatasetsUtils.bulkLines))
router.delete('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('deleteLine', 'write'), asyncWrap(restDatasetsUtils.deleteLine))
router.get('/:datasetId/lines/:lineId/revisions', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('readLineRevisions', 'read', 'readDataAPI'), asyncWrap(restDatasetsUtils.readLineRevisions))
router.delete('/:datasetId/lines', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('deleteAllLines', 'write'), asyncWrap(restDatasetsUtils.deleteAllLines))
router.post('/:datasetId/_sync_attachments_lines', lockDataset((body, query) => query.lock === 'true'), readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('bulkLines', 'write'), asyncWrap(restDatasetsUtils.syncAttachmentsLines))

// Specifc routes for datasets with masterData functionalities enabled
router.get('/:datasetId/master-data/single-searchs/:singleSearchId', readDataset(), permissions.middleware('readLines', 'read', 'readDataAPI'), asyncWrap(async (req, res) => {
  const singleSearch = req.dataset.masterData && req.dataset.masterData.singleSearchs && req.dataset.masterData.singleSearchs.find(ss => ss.id === req.params.singleSearchId)
  if (!singleSearch) return res.status(404).send(`Recherche unitaire "${req.params.singleSearchId}" inconnue`)

  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)

  let esResponse
  let select = singleSearch.output.key
  if (singleSearch.label) select += ',' + singleSearch.label.key
  try {
    esResponse = await esUtils.search(req.app.get('es'), req.dataset,
      { q: req.query.q, size: req.query.size, q_mode: 'complete', select })
  } catch (err) {
    await manageESError(req, err)
  }
  const result = {
    total: esResponse.hits.total.value,
    results: esResponse.hits.hits.map(hit => {
      const item = esUtils.prepareResultItem(hit, req.dataset, req.query)
      let label = item[singleSearch.output.key]
      if (singleSearch.label && item[singleSearch.label.key]) label += ` (${item[singleSearch.label.key]})`
      return { output: item[singleSearch.output.key], label, score: item._score || undefined }
    })
  }
  res.send(result)
}))
router.post('/:datasetId/master-data/bulk-searchs/:bulkSearchId', readDataset(), permissions.middleware('bulkSearch', 'read'), asyncWrap(async (req, res) => {
  // no buffering nor caching of this response in the reverse proxy
  res.setHeader('X-Accel-Buffering', 'no')
  await pump(
    req,
    ...await bulkSearchStreams(req.app.get('db'), req.app.get('es'), req.dataset, req.get('Content-Type'), req.params.bulkSearchId, req.query.select),
    res
  )
}))

// Error from ES backend should be stored in the journal
async function manageESError (req, err) {
  console.error(`elasticsearch query error ${req.dataset.id}`, err)
  const message = esUtils.errorMessage(err)

  // We used to store an error on the data whenever a dataset encoutered an elasticsearch error
  // but this can end up storing too many errors when the cluster is in a bad state
  // revert to simply logging
  // if (req.dataset.status === 'finalized' && err.statusCode >= 404 && errBody.type !== 'search_phase_execution_exception') {
  // await req.app.get('db').collection('datasets').updateOne({ id: req.params.datasetId }, { $set: { status: 'error' } })
  // await journals.log(req.app, req.dataset, { type: 'error', data: message })
  // }
  throw createError(err.status, message)
}

// Read/search data for a dataset
router.get('/:datasetId/lines', readDataset(), applicationKey, permissions.middleware('readLines', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  if (req.query && req.query.page && req.query.size && req.query.page * req.query.size > 10000) {
    return res.status(404).send('You can only access the first 10 000 elements.')
  }

  const db = req.app.get('db')

  // used later to count items in a tile or tile's neighbor
  async function countWithCache (query) {
    const { hash, value } = await cache.get(db, {
      type: 'tile-count',
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query
    })
    if (!config.cache.disabled && value !== null) return value
    const newValue = await esUtils.count(req.app.get('es'), req.dataset, query)
    cache.set(db, hash, newValue)
    return newValue
  }

  // if the output format is geo make sure geoshape is present
  // also manage a default content for geo tiles
  if (['geojson', 'mvt', 'vt', 'pbf'].includes(req.query.format)) {
    req.query.select = (req.query.select ? req.query.select : tiles.defaultSelect(req.dataset).join(','))
    if (!req.query.select.includes('_geoshape') && req.dataset.schema.find(p => p.key === '_geoshape')) req.query.select += ',_geoshape'
    if (!req.query.select.includes('_geoshape')) req.query.select += ',_geopoint'
  }
  if (req.query.format === 'wkt') {
    if (req.dataset.schema.find(p => p.key === '_geoshape')) req.query.select = '_geoshape'
    else req.query.select = '_geopoint'
  }

  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(db, req.dataset)

  // geojson format benefits from bbox info
  let bboxPromise
  if (req.query.format === 'geojson') {
    bboxPromise = esUtils.bboxAgg(req.app.get('es'), req.dataset, { ...req.query })
  }

  const sampling = req.query.sampling || 'neighbors'
  if (!['max', 'neighbors'].includes(sampling)) return res.status(400).send('Sampling can be "max" or "neighbors"')

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)

  let xyz
  if (vectorTileRequested) {
    // default is 20 for other format, but we want filled tiles by default
    req.query.size = req.query.size || '10000'
    // sorting by rand provides more homogeneous distribution in tiles
    req.query.sort = req.query.sort || '_rand'
    if (!req.query.xyz) return res.status(400).send('xyz parameter is required for vector tile format.')
    xyz = req.query.xyz.split(',').map(Number)
  }

  // Is the tile cached ?
  let cacheHash
  if (vectorTileRequested && !config.cache.disabled) {
    const { hash, value } = await cache.get(db, {
      type: 'tile',
      sampling,
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query: req.query
    })
    if (value) {
      res.type('application/x-protobuf')
      res.setHeader('x-tilesmode', 'cache')
      res.throttleEnd('static')
      return res.status(200).send(value.buffer)
    }
    cacheHash = hash
  }

  if (vectorTileRequested) {
    res.setHeader('x-tilesmode', 'es')

    const requestedSize = req.query.size ? Number(req.query.size) : 20
    if (requestedSize > 10000) throw createError(400, '"size" cannot be more than 10000')
    if (sampling === 'neighbors') {
      // count docs in neighboring tiles to perform intelligent sampling
      try {
        const mainCount = await countWithCache(req.query)
        if (mainCount === 0) return res.status(204).send()
        if (mainCount <= requestedSize / 20) {
          // no sampling on low density tiles
          req.query.size = requestedSize
        } else {
          const neighborsCounts = await Promise.all([
            // the 4 that share an edge
            countWithCache({ ...req.query, xyz: [xyz[0] - 1, xyz[1], xyz[2]].join(',') }),
            countWithCache({ ...req.query, xyz: [xyz[0] + 1, xyz[1], xyz[2]].join(',') }),
            countWithCache({ ...req.query, xyz: [xyz[0], xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache({ ...req.query, xyz: [xyz[0], xyz[1] + 1, xyz[2]].join(',') }),
            // Using corners also yields better results
            countWithCache({ ...req.query, xyz: [xyz[0] - 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache({ ...req.query, xyz: [xyz[0] + 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache({ ...req.query, xyz: [xyz[0] - 1, xyz[1] + 1, xyz[2]].join(',') }),
            countWithCache({ ...req.query, xyz: [xyz[0] + 1, xyz[1] + 1, xyz[2]].join(',') })
          ])
          const maxCount = Math.max(mainCount, ...neighborsCounts)
          const sampleRate = requestedSize / Math.max(requestedSize, maxCount)
          const sizeFilter = mainCount * sampleRate
          req.query.size = Math.min(sizeFilter, requestedSize)
        }
      } catch (err) {
        await manageESError(req, err)
      }
    }
  }

  let esResponse
  try {
    esResponse = await esUtils.search(req.app.get('es'), req.dataset, req.query, req.publicBaseUrl)
  } catch (err) {
    await manageESError(req, err)
  }
  if (req.query.format === 'geojson') {
    const geojson = geo.result2geojson(esResponse)
    geojson.bbox = (await bboxPromise).bbox
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.geojson"`)
    res.throttleEnd()
    webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded-filter' })
    return res.status(200).send(geojson)
  }

  if (req.query.format === 'wkt') {
    const wkt = geo.result2wkt(esResponse)
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.wkt"`)
    res.throttleEnd()
    webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded-filter' })
    return res.status(200).send(wkt)
  }

  if (vectorTileRequested) {
    const tile = tiles.geojson2pbf(geo.result2geojson(esResponse), xyz)
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
    res.throttleEnd()
    return res.status(200).send(tile)
  }

  const result = { total: esResponse.hits.total.value }
  if (req.query.collapse) result.totalCollapse = esResponse.aggregations.totalCollapse.value
  result.results = esResponse.hits.hits.map(hit => {
    return esUtils.prepareResultItem(hit, req.dataset, req.query)
  })

  if (req.query.format === 'csv') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.csv"`)
    // add BOM for excel, cf https://stackoverflow.com/a/17879474
    res.write('\ufeff')
    const csvStreams = outputs.result2csv(req.dataset, req.query)
    const streamPromise = pump(
      ...csvStreams,
      res.throttle('dynamic'),
      res
    )
    for (const line of result.results) {
      await new Promise((resolve, reject) => {
        csvStreams[0].write(line, (err) => {
          if (err) reject(err)
          resolve(err)
        })
      })
    }
    csvStreams[0].end()
    await streamPromise
    webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded-filter' })
    return
  }

  if (req.query.format === 'xlsx') {
    res.throttleEnd()
    const sheet = outputs.results2sheet(req.dataset, req.query, result.results)
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.xlsx"`)
    res.status(200).send(sheet)
    webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded-filter' })
    return
  }
  if (req.query.format === 'ods') {
    res.throttleEnd()
    const sheet = outputs.results2sheet(req.dataset, req.query, result.results, 'ods')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.ods"`)
    res.status(200).send(sheet)
    webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded-filter' })
    return
  }

  res.throttleEnd()
  res.status(200).send(result)
}))

// Special geo aggregation
router.get('/:datasetId/geo_agg', readDataset(), applicationKey, permissions.middleware('getGeoAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  res.throttleEnd()
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  const db = req.app.get('db')

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)
  // Is the tile cached ?
  let cacheHash
  if (vectorTileRequested && !config.cache.disabled) {
    const { hash, value } = await cache.get(db, {
      type: 'tile-geoagg',
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query: req.query
    })
    if (value) return res.status(200).send(value.buffer)
    cacheHash = hash
  }
  let result
  try {
    result = await esUtils.geoAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }

  if (req.query.format === 'geojson') {
    const geojson = geo.aggs2geojson(result)
    geojson.bbox = (await esUtils.bboxAgg(req.app.get('es'), req.dataset, { ...req.query })).bbox
    return res.status(200).send(geojson)
  }

  if (vectorTileRequested) {
    if (!req.query.xyz) return res.status(400).send('xyz parameter is required for vector tile format.')
    const tile = tiles.geojson2pbf(geo.aggs2geojson(result), req.query.xyz.split(',').map(Number))
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
    return res.status(200).send(tile)
  }

  res.status(200).send(result)
}))

// Standard aggregation to group items by value and perform an optional metric calculation on each group
router.get('/:datasetId/values_agg', readDataset(), applicationKey, permissions.middleware('getValuesAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  res.throttleEnd()
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  const db = req.app.get('db')

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)
  // Is the tile cached ?
  let cacheHash
  if (vectorTileRequested && !config.cache.disabled) {
    const { hash, value } = await cache.get(db, {
      type: 'tile-valuesagg',
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query: req.query
    })
    if (value) return res.status(200).send(value.buffer)
    cacheHash = hash
  }

  let result
  try {
    result = await esUtils.valuesAgg(req.app.get('es'), req.dataset, req.query, vectorTileRequested || req.query.format === 'geojson')
  } catch (err) {
    await manageESError(req, err)
  }

  if (req.query.format === 'geojson') {
    const geojson = geo.aggs2geojson(result)
    geojson.bbox = (await esUtils.bboxAgg(req.app.get('es'), req.dataset, { ...req.query })).bbox
    return res.status(200).send(geojson)
  }

  if (vectorTileRequested) {
    if (!req.query.xyz) return res.status(400).send('xyz parameter is required for vector tile format.')
    const tile = tiles.geojson2pbf(geo.aggs2geojson(result), req.query.xyz.split(',').map(Number))
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
    return res.status(200).send(tile)
  }

  res.status(200).send(result)
}))

// Simpler values list and filter (q is applied only to the selected field, not all fields)
// mostly useful for selects/autocompletes on values
router.get('/:datasetId/values/:fieldKey', readDataset(), applicationKey, permissions.middleware('getValues', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  res.throttleEnd()
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.values(req.app.get('es'), req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple metric aggregation to calculate some value (sum, avg, etc.)
router.get('/:datasetId/metric_agg', readDataset(), applicationKey, permissions.middleware('getMetricAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  res.throttleEnd()
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.metricAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple words aggregation for significant terms extraction
router.get('/:datasetId/words_agg', readDataset(), applicationKey, permissions.middleware('getWordsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  res.throttleEnd()
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.wordsAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Get max value of a field
router.get('/:datasetId/max/:fieldKey', readDataset(), applicationKey, permissions.middleware('getMaxAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.maxAgg(req.app.get('es'), req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Get min value of a field
router.get('/:datasetId/min/:fieldKey', readDataset(), applicationKey, permissions.middleware('getMinAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased, asyncWrap(async (req, res) => {
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.minAgg(req.app.get('es'), req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// For datasets with attached files
router.get('/:datasetId/attachments/*', readDataset(), applicationKey, permissions.middleware('downloadAttachment', 'read', 'readDataFiles'), cacheHeaders.noCache, (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
  // the transform stream option was patched into "send" module using patch-package
  res.download(path.resolve(datasetUtils.attachmentsDir(req.dataset), filePath), null, { transformStream: res.throttle('static') })
})

// Direct access to data files
router.get('/:datasetId/data-files', readDataset(), permissions.middleware('listDataFiles', 'read'), asyncWrap(async (req, res, next) => {
  res.send(await datasetUtils.dataFiles(req.dataset))
}))
router.get('/:datasetId/data-files/*', readDataset(), permissions.middleware('downloadDataFile', 'read', 'readDataFiles'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable data file path')
  webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded' })
  // the transform stream option was patched into "send" module using patch-package
  res.download(path.resolve(datasetUtils.dir(req.dataset), filePath), null, { transformStream: res.throttle('static') })
}))

// Special attachments referenced in dataset metadatas
router.post('/:datasetId/metadata-attachments', readDataset(), permissions.middleware('postMetadataAttachment', 'write'), checkStorage(false), attachments.metadataUpload(), asyncWrap(async (req, res, next) => {
  req.body.size = (await fs.promises.stat(req.file.path)).size
  req.body.updatedAt = moment().toISOString()
  await datasetUtils.updateStorage(req.app.get('db'), req.dataset)
  res.status(200).send(req.body)
}))
router.get('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('downloadMetadataAttachment', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
  // the transform stream option was patched into "send" module using patch-package
  res.download(path.resolve(datasetUtils.metadataAttachmentsDir(req.dataset), filePath), null, { transformStream: res.throttle('static') })
})
router.delete('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('deleteMetadataAttachment', 'write'), asyncWrap(async (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
  await fs.remove(path.join(datasetUtils.metadataAttachmentsDir(req.dataset), filePath))
  await datasetUtils.updateStorage(req.app.get('db'), req.dataset)
  res.status(204).send()
}))

// Download the full dataset in its original form
router.get('/:datasetId/raw', readDataset(), permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  // a special case for superadmins.. handy but quite dangerous for the db load
  if (req.dataset.isRest && req.user.adminMode) {
    req.query.select = req.query.select || ['_id'].concat(req.dataset.schema.filter(f => !f['x-calculated']).map(f => f.key)).join(',')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.csv"`)
    // add BOM for excel, cf https://stackoverflow.com/a/17879474
    res.write('\ufeff')
    await pump(
      ...await restDatasetsUtils.readStreams(req.app.get('db'), req.dataset),
      ...outputs.result2csv(req.dataset, req.query),
      res
    )
    return
  }
  if (!req.dataset.originalFile) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')
  // the transform stream option was patched into "send" module using patch-package
  res.download(datasetUtils.originalFileName(req.dataset), null, { transformStream: res.throttle('static') })
  webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded' })
}))

// Download the dataset in various formats
router.get('/:datasetId/convert', readDataset(), permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, (req, res, next) => {
  if (!req.dataset.file) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')

  // the transform stream option was patched into "send" module using patch-package
  res.download(datasetUtils.fileName(req.dataset), null, { transformStream: res.throttle('static') })
  webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded' })
})

// Download the full dataset with extensions
// TODO use ES scroll functionality instead of file read + extensions
router.get('/:datasetId/full', readDataset(), permissions.middleware('downloadFullData', 'read', 'readDataFiles'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  if (await fs.exists(datasetUtils.fullFileName(req.dataset))) {
    res.download(datasetUtils.fullFileName(req.dataset), null, { transformStream: res.throttle('static') })
  } else {
    res.download(datasetUtils.fileName(req.dataset), null, { transformStream: res.throttle('static') })
  }
  webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded' })
}))

router.get('/:datasetId/api-docs.json', readDataset(), permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased, (req, res) => {
  res.send(datasetAPIDocs(req.dataset, req.publicBaseUrl).api)
})

router.get('/:datasetId/private-api-docs.json', readDataset(), permissions.middleware('readPrivateApiDoc', 'readAdvanced'), cacheHeaders.noCache, (req, res) => {
  res.send(privateDatasetAPIDocs(req.dataset, req.publicBaseUrl, req.user))
})

router.get('/:datasetId/journal', readDataset(), permissions.middleware('readJournal', 'read'), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'dataset',
    id: req.params.datasetId,
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id
  })
  if (!journal) return res.send([])
  delete journal.owner
  journal.events.reverse()
  journal.events.forEach(e => {
    if (e.data) e.data = sanitizeHtml(e.data)
  })
  res.json(journal.events)
}))

// Special route with very technical informations to help diagnose bugs, broken indices, etc.
router.get('/:datasetId/_diagnose', readDataset(), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  const esInfos = await esUtils.datasetInfos(req.app.get('es'), req.dataset)
  const filesInfos = await datasetUtils.lsFiles(req.dataset)
  res.json({ filesInfos, esInfos })
}))

// Special admin route to force reindexing a dataset
router.post('/:datasetId/_reindex', readDataset(), asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  const patchedDataset = await datasetUtils.reindex(req.app.get('db'), req.dataset)
  res.status(200).send(patchedDataset)
}))

// Special admin route to force refinalizing a dataset
router.post('/:datasetId/_refinalize', readDataset(), asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  const patchedDataset = await datasetUtils.refinalize(req.app.get('db'), req.dataset)
  res.status(200).send(patchedDataset)
}))

module.exports = router
