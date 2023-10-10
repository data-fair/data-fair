const { Writable } = require('stream')
const express = require('express')
const ajv = require('../utils/ajv')
const path = require('path')
const fs = require('fs-extra')
const moment = require('moment')
const createError = require('http-errors')
const pump = require('../utils/pipe')
const mongodb = require('mongodb')
const config = require('config')
const chardet = require('chardet')
const slug = require('slugify')
const sanitizeHtml = require('../../shared/sanitize-html')
const CronJob = require('cron').CronJob
const LinkHeader = require('http-link-header')
const stableStringify = require('json-stable-stringify')
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
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const extensions = require('../utils/extensions')
const attachments = require('../utils/attachments')
const geo = require('../utils/geo')
const tiles = require('../utils/tiles')
const cache = require('../utils/cache')
const cacheHeaders = require('../utils/cache-headers')
const outputs = require('../utils/outputs')
const limits = require('../utils/limits')
const locks = require('../utils/locks')
const notifications = require('../utils/notifications')
const datasetPatchSchema = require('../../contract/dataset-patch')
const validatePatch = ajv.compile(datasetPatchSchema)
const datasetPostSchema = require('../../contract/dataset-post')
const validatePost = ajv.compile(datasetPostSchema.properties.body)
const userNotificationSchema = require('../../contract/user-notification')
const validateUserNotification = ajv.compile(userNotificationSchema)
const capabilitiesSchema = require('../../contract/capabilities.js')
const debugFiles = require('debug')('files')
const { getThumbnail } = require('../utils/thumbnails')
const datasetFileSample = require('../utils/dataset-file-sample')
const { bulkSearchStreams } = require('../utils/master-data')
const applicationKey = require('../utils/application-key')
const { syncDataset: syncRemoteService } = require('./remote-services')
const { basicTypes } = require('../workers/converter')
const { validateURLFriendly } = require('../utils/validation')
const prometheus = require('../utils/prometheus')
const publicationSites = require('../utils/publication-sites')
const clamav = require('../utils/clamav')
const nanoid = require('../utils/nanoid')
const router = express.Router()

const clean = datasetUtils.clean

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
      console.warn('Failure to drain request that was rejected for exceeding storage limit', err)
    }
    if (!storageOk) throw createError(429, req.__('errors.exceedLimitStorage'))
    if (!indexedOk) throw createError(429, req.__('errors.exceedLimitIndexed'))
  }
  next()
})

// create short ids for extensions that will be used as prefix of the properties ids in the schema
// try to make something both readable and with little conflict risk (but not 0 risk)
const prepareExtensions = (req, extensions, oldExtensions = []) => {
  for (const e of extensions) {
    if (!e.shortId && !e.propertyPrefix) {
      const oldExtension = oldExtensions.find(oldE => oldE.remoteService === e.remoteService && oldE.action === e.action)
      if (oldExtension) {
        // do not reprocess already assigned shortIds / propertyPrefixes to prevent compatibility break
        if (oldExtension.shortId) e.shortId = oldExtension.shortId
        if (oldExtension.propertyPrefix) e.propertyPrefix = oldExtension.propertyPrefix
      } else {
        // only apply to new extensions to prevent compatibility break
        let propertyPrefix = e.action.toLowerCase()
        for (const term of ['masterdata', 'find', 'bulk', 'search']) {
          propertyPrefix = propertyPrefix.replace(term, '')
        }
        for (const char of [':', '-', '.', ' ']) {
          propertyPrefix = propertyPrefix.replace(char, '_')
        }
        if (propertyPrefix.startsWith('post')) propertyPrefix = propertyPrefix.replace('post', '')
        e.propertyPrefix = propertyPrefix.replace(/__/g, '_').replace(/^_/, '').replace(/_$/, '')
        e.propertyPrefix = '_' + e.propertyPrefix

        // TODO: also check if there is a conflict with an existing calculate property ?
      }
    }
  }
  const propertyPrefixes = extensions.filter(e => !!e.propertyPrefix).map(e => e.propertyPrefix)
  if (propertyPrefixes.length !== [...new Set(propertyPrefixes)].length) {
    throw createError(400, req.__('errors.extensionShortIdConflict'))
  }
}

const filterFields = {
  concepts: 'schema.x-refersTo',
  'short-concept': 'schema.x-concept.id',
  'field-type': 'schema.type',
  'field-format': 'schema.format',
  children: 'virtual.children',
  services: 'extensions.remoteService',
  status: 'status',
  draftStatus: 'draft.status',
  topics: 'topics.id',
  publicationSites: 'publicationSites',
  requestedPublicationSites: 'requestedPublicationSites',
  spatial: 'spatial',
  keywords: 'keywords',
  title: 'title'
}
const facetFields = {
  ...filterFields,
  topics: 'topics'
}
const sumsFields = { count: 'count' }
const nullFacetFields = ['publicationSites']
const fieldsMap = {
  filename: 'originalFile.name',
  ids: 'id',
  id: 'id',
  slugs: 'slug',
  slug: 'slug',
  rest: 'isRest',
  virtual: 'isVirtual',
  metaOnly: 'isMetaOnly',
  ...filterFields
}

// Get the list of datasets
router.get('', cacheHeaders.listBased, asyncWrap(async (req, res) => {
  const explain = req.query.explain === 'true' && req.user && (req.user.isAdmin || req.user.asAdmin) && {}
  const datasets = req.app.get('db').collection('datasets')
  req.resourceType = 'datasets'

  const extraFilters = []
  if (req.query.bbox === 'true') {
    extraFilters.push({ bbox: { $ne: null } })
  }
  if (req.query.queryable === 'true') {
    extraFilters.push({ isMetaOnly: { $ne: true } })
    extraFilters.push({ finalizedAt: { $ne: null } })
  }

  if (req.query.file === 'true') extraFilters.push({ file: { $exists: true } })

  // the api exposed on a secondary domain should not be able to access resources outside of the owner account
  if (req.publicationSite) {
    extraFilters.push({ 'owner.type': req.publicationSite.owner.type, 'owner.id': req.publicationSite.owner.id })
  }

  const query = findUtils.query(req, fieldsMap, null, extraFilters)
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select, [], req.query.raw === 'true')
  const [skip, size] = findUtils.pagination(req.query)

  const t0 = new Date().getTime()
  if (explain) explain.middlewares = t0 - req.ts
  const countPromise = req.query.count !== 'false' && datasets.countDocuments(query).then(res => {
    if (explain) explain.countMS = new Date().getTime() - t0
    return res
  })
  const resultsPromise = size > 0 && datasets.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray().then(res => {
    if (explain) explain.resultsMS = new Date().getTime() - t0
    return res
  })
  const facetsPromise = req.query.facets && datasets.aggregate(findUtils.facetsQuery(req, facetFields, filterFields, nullFacetFields, extraFilters)).toArray().then(res => {
    if (explain) explain.facetsMS = new Date().getTime() - t0
    return res
  })
  const sumsPromise = req.query.sums && datasets
    .aggregate(findUtils.sumsQuery(req, sumsFields, filterFields, extraFilters)).toArray()
    .then(sumsResponse => {
      const res = sumsResponse[0] || {}
      for (const field of req.query.sums.split(',')) {
        res[field] = res[field] || 0
      }
      if (explain) explain.sumsMS = new Date().getTime() - t0
      return res
    })
  const [count, results, facets, sums] = await Promise.all([countPromise, resultsPromise, facetsPromise, sumsPromise])
  const response = {}
  if (countPromise) response.count = count
  if (resultsPromise) response.results = results
  else response.results = []
  if (facetsPromise) response.facets = findUtils.parseFacets(facets, nullFacetFields)
  if (sumsPromise) response.sums = sums
  const t1 = new Date().getTime()
  for (const r of response.results) {
    if (req.query.raw !== 'true') r.userPermissions = permissions.list('datasets', r, req.user)
    clean(req.publicBaseUrl, req.publicationSite, r, req.query)
  }
  if (explain) {
    explain.cleanMS = new Date().getTime() - t1
    response.explain = explain
  }
  res.json(response)
}))

// Shared middleware to apply a lock on the modified resource
const lockDataset = (_shouldLock = true) => asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  const shouldLock = typeof _shouldLock === 'function' ? _shouldLock(req.body, req.query) : _shouldLock
  if (!shouldLock) return next()
  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    const lockKey = `dataset:${req.dataset ? req.dataset.id : req.params.datasetId}`
    const ack = await locks.acquire(db, lockKey, `${req.method} ${req.originalUrl}`)
    if (ack) {
      res.on('close', () => locks.release(db, lockKey).catch(err => console.error('failure to release dataset lock', err)))
      return next()
    } else {
      // dataset found but locked : we cannot safely work on it, wait a little while before failing
      await new Promise(resolve => setTimeout(resolve, config.datasetStateRetries.interval))
    }
  }
  throw createError(409, `Une opération bloquante est déjà en cours sur le jeu de données ${req.dataset.id}.`)
})
const lockNewDataset = async (req, res, dataset) => {
  const db = req.app.get('db')
  const lockKeys = [`dataset:${dataset.id}`, `dataset:slug:${dataset.owner.type}:${dataset.owner.id}:${dataset.slug}`]
  const acks = await Promise.all(lockKeys.map(lockKey => locks.acquire(db, lockKey, `${req.method} ${req.originalUrl}`)))
  res.on('close', () => {
    for (let i = 0; i < lockKeys.length; i++) {
      if (acks[i]) {
        locks.release(db, lockKeys[i]).catch(err => console.error('failure to release dataset lock', err))
      }
    }
  })
  if (acks.includes(false)) {
    for (let i = 0; i < lockKeys.length; i++) {
      if (acks[i]) {
        await locks.release(db, lockKeys[i])
      }
    }
    return false
  }
  return true
}
// Shared middleware to read dataset in db
// also checks that the dataset is in a state compatible with some action
// supports waiting a little bit to be a little permissive with the user
const readDataset = (_acceptedStatuses, preserveDraft, ignoreDraft) => asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  const acceptedStatuses = typeof _acceptedStatuses === 'function' ? _acceptedStatuses(req.body) : _acceptedStatuses
  let filter = { id: req.params.datasetId }
  if (req.publicationSite) {
    filter = { _uniqueRefs: req.params.datasetId, 'owner.type': req.publicationSite.owner.type, 'owner.id': req.publicationSite.owner.id }
  } else if (req.mainPublicationSite) {
    filter = {
      $or: [
        { id: req.params.datasetId },
        { _uniqueRefs: req.params.datasetId, 'owner.type': req.mainPublicationSite.owner.type, 'owner.id': req.mainPublicationSite.owner.id }
      ]
    }
  }

  for (let i = 0; i < config.datasetStateRetries.nb; i++) {
    const datasets = await db.collection('datasets').find(filter).project({ _id: 0 }).toArray()
    req.dataset = req.resource = datasets.find(d => d.id === req.params.datasetId) || datasets.find(d => d.slug === req.params.datasetId)
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
  await publicationSites.onPublic(req.app.get('db'), patchedDataset, 'dataset')
}))

// retrieve a dataset by its id
router.get('/:datasetId', readDataset(), applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.dataset.userPermissions = permissions.list('datasets', req.dataset, req.user, req.bypassPermissions)
  res.status(200).send(clean(req.publicBaseUrl, req.publicationSite, req.dataset, req.query))
})

// retrieve only the schema.. Mostly useful for easy select fields
const capabilitiesDefaultFalse = Object.keys(capabilitiesSchema.properties).filter(key => capabilitiesSchema.properties[key].default === false)
const sendSchema = (req, res, schema) => {
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
  if (req.query.concept === 'true') {
    schema = schema.filter(field => !!field['x-concept'])
  }

  // in json schema format we remove calculated and extended properties by default (better matches the need of form generation)
  const filterCalculated = req.query.mimeType === 'application/schema+json' ? req.query.calculated !== 'true' : req.query.calculated === 'false'
  if (filterCalculated) {
    schema = schema.filter(field => !field['x-calculated'])
  }
  const filterExtension = req.query.mimeType === 'application/schema+json' ? req.query.extension !== 'true' : req.query.extension === 'false'
  if (filterExtension) {
    schema = schema.filter(field => !field['x-extension'])
  }
  if (req.query.separator === 'false') {
    schema = schema.filter(field => !field.separator)
  }
  if (req.query.capability) {
    schema = schema.filter(field => {
      if (capabilitiesDefaultFalse.includes(req.query.capability)) {
        if (!field['x-capabilities'] || !field['x-capabilities'][req.query.capability]) return false
      } else {
        if (field['x-capabilities'] && field['x-capabilities'][req.query.capability] === false) return false
      }

      if (field.key === '_id') return false
      if (req.query.capability.startsWith('text') && field.type !== 'string') return false
      if (req.query.capability === 'insensitive' && field.type !== 'string') return false
      if (field.type === 'string' && (field.format === 'date' || field.format === 'date-time')) {
        if (req.query.capability === 'text') return false
        if (req.query.capability === 'textAgg') return false
        if (req.query.capability === 'wildcard') return false
        if (req.query.capability === 'insensitive') return false
      }
      return true
    })
  }
  if (req.query.maxCardinality) {
    const maxCardinality = Number(req.query.maxCardinality)
    schema = schema.filter(field => field['x-cardinality'] != null && field['x-cardinality'] <= maxCardinality)
  }
  if (req.query.mimeType === 'application/tableschema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-tableschema.json"`)
    schema = datasetUtils.tableSchema(schema)
  } else if (req.query.mimeType === 'application/schema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-schema.json"`)
    schema = datasetUtils.jsonSchema(schema, req.publicBaseUrl)
  } else {
    for (const field of schema) {
      field.label = field.title || field['x-originalName'] || field.key
    }
  }
  res.status(200).send(schema)
}
router.get('/:datasetId/schema', readDataset(), applicationKey, permissions.middleware('readSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
  sendSchema(req, res, req.dataset.schema)
})
// alternate read schema route that does not return clues about the data (cardinality and enums)
router.get('/:datasetId/safe-schema', readDataset(), applicationKey, permissions.middleware('readSafeSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const schema = req.dataset.schema
  for (const p of schema) {
    delete p['x-cardinality']
    delete p.enum
  }
  sendSchema(req, res, schema)
})

const permissionsWritePublications = permissions.middleware('writePublications', 'admin')
const permissionsWriteExports = permissions.middleware('writeExports', 'admin')
const permissionsWriteDescription = permissions.middleware('writeDescription', 'write')
const debugBreakingChanges = require('debug')('breaking-changes')
const descriptionBreakingKeys = ['rest', 'virtual', 'lineOwnership', 'primaryKey', 'projection', 'attachmentsAsImage', 'extensions', 'timeZone', 'slug'] // a change in these properties is considered a breaking change
const descriptionHasBreakingChanges = (req) => {
  const breakingChangeKey = descriptionBreakingKeys.find(key => key in req.body)
  if (breakingChangeKey) {
    debugBreakingChanges('breaking change on key', breakingChangeKey)
    return true
  }
  if (!req.body.schema) return false
  const breakingChanges = datasetUtils.getSchemaBreakingChanges(req.dataset.schema, req.body.schema, true)
  debugBreakingChanges('breaking changes in schema ? ', breakingChanges)
  return breakingChanges.length > 0
}
const permissionsWriteDescriptionBreaking = permissions.middleware('writeDescriptionBreaking', 'write')

// Update a dataset's metadata
router.patch('/:datasetId',
  readDataset((patch) => {
    // accept different statuses of the dataset depending on the content of the patch
    if (patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection) {
      return ['finalized', 'error']
    } else {
      return null
    }
  }),
  lockDataset((patch) => {
    return !!(patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)
  }),
  (req, res, next) => descriptionHasBreakingChanges(req) ? permissionsWriteDescriptionBreaking(req, res, next) : permissionsWriteDescription(req, res, next),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  (req, res, next) => req.body.exports ? permissionsWriteExports(req, res, next) : next(),
  asyncWrap(async (req, res) => {
    const db = req.app.get('db')
    const patch = req.body
    validatePatch(patch)
    validateURLFriendly(req, patch.slug)

    patch.id = req.dataset.id
    patch.slug = patch.slug || req.dataset.slug
    datasetUtils.setUniqueRefs(patch)
    curateDataset(patch)

    // Changed a previously failed dataset, retry everything.
    // Except download.. We only try it again if the fetch failed.
    if (req.dataset.status === 'error') {
      if (req.dataset.isVirtual) patch.status = 'indexed'
      else if (req.dataset.isRest) patch.status = 'analyzed'
      else if (req.dataset.remoteFile && !req.dataset.originalFile) patch.status = 'imported'
      else if (!basicTypes.includes(req.dataset.originalFile.mimetype)) patch.status = 'uploaded'
      else patch.status = 'loaded'
    }

    // Ignore patch that doesn't bring actual change
    for (const patchKey of Object.keys(patch)) {
      if (stableStringify(patch[patchKey]) === stableStringify(req.dataset[patchKey])) { delete patch[patchKey] }
    }
    if (Object.keys(patch).length === 0) return res.status(200).send(clean(req.publicBaseUrl, req.publicationSite, req.dataset))

    patch.updatedAt = moment().toISOString()
    patch.updatedBy = { id: req.user.id, name: req.user.name }

    if (patch.extensions) prepareExtensions(req, patch.extensions, req.dataset.extensions)
    if (patch.extensions || req.dataset.extensions) {
      patch.schema = await extensions.prepareSchema(db, patch.schema || req.dataset.schema, patch.extensions || req.dataset.extensions)
    }

    // Re-publish publications
    if (!patch.publications && req.dataset.publications && req.dataset.publications.length) {
      for (const p of req.dataset.publications) {
        if (p.status !== 'deleted') p.status = 'waiting'
      }
      patch.publications = req.dataset.publications
    }

    // manage automatic export of REST datasets into files
    if (patch.exports && patch.exports.restToCSV) {
      if (patch.exports.restToCSV.active) {
        const job = new CronJob(config.exportRestDatasets.cron, () => {})
        patch.exports.restToCSV.nextExport = job.nextDates().toISOString()
      } else {
        delete patch.exports.restToCSV.nextExport
        if (await fs.pathExists(datasetUtils.exportedFilePath(req.dataset, '.csv'))) {
          await fs.remove(datasetUtils.exportedFilePath(req.dataset, '.csv'))
        }
      }
      patch.exports.restToCSV.lastExport = req.dataset?.exports?.restToCSV?.lastExport
    }

    if (patch.extensions && req.dataset.isRest && req.dataset.extensions) {
      const removedExtensions = req.dataset.extensions.filter(e => !patch.extensions.find(pe => e.remoteService === pe.remoteService && e.action === pe.action))
      if (removedExtensions.length) {
        await restDatasetsUtils.collection(db, req.dataset).updateMany({},
          { $unset: removedExtensions.reduce((a, re) => { a[extensions.getExtensionKey(re)] = ''; return a }, {}) }
        )
        await datasetUtils.updateStorage(req.app, req.dataset)
      }
    }

    const removedRestProp = req.dataset.isRest && patch.schema && req.dataset.schema.find(df => !df['x-calculated'] && !df['x-extension'] && !patch.schema.find(f => f.key === df.key))
    if (removedRestProp) {
      // some property was removed in rest dataset, trigger full re-indexing
      const deleteFields = req.dataset.schema.filter(df => !df['x-calculated'] && !df['x-extension'] && !patch.schema.find(f => f.key === df.key))
      await restDatasetsUtils.collection(db, req.dataset).updateMany({},
        { $unset: deleteFields.reduce((a, df) => { a[df.key] = ''; return a }, {}) }
      )
      await datasetUtils.updateStorage(req.app, req.dataset)
      patch.status = 'analyzed'
    }

    const coordXProp = req.dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordX')
    const coordYProp = req.dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#coordY')
    const projectGeomProp = req.dataset.schema.find(p => p['x-refersTo'] === 'http://data.ign.fr/def/geometrie#Geometry')

    if (req.dataset.isVirtual) {
      if (patch.schema || patch.virtual) {
        patch.schema = await virtualDatasetsUtils.prepareSchema(db, { ...req.dataset, ...patch })
        patch.status = 'indexed'
      }
    } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.ignoreDetection !== f.ignoreDetection))) {
      // some ignoreDetection param has changed on a field, trigger full analysis / re-indexing
      patch.status = 'loaded'
    } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.ignoreIntegerDetection !== f.ignoreIntegerDetection))) {
      // some ignoreIntegerDetection param has changed on a field, trigger full analysis / re-indexing
      patch.status = 'loaded'
    } else if (patch.extensions) {
      // extensions have changed, trigger full re-indexing
      patch.status = 'analyzed'
    } else if (patch.projection && (!req.dataset.projection || patch.projection.code !== req.dataset.projection.code) && ((coordXProp && coordYProp) || projectGeomProp)) {
      // geo projection has changed, trigger full re-indexing
      patch.status = 'analyzed'
    } else if (patch.schema && geo.geoFieldsKey(patch.schema) !== geo.geoFieldsKey(req.dataset.schema)) {
      // geo concepts haved changed, trigger full re-indexing
      patch.status = 'analyzed'
    } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.separator !== f.separator))) {
      // some separator has changed on a field, trigger full re-indexing
      patch.status = 'analyzed'
    } else if (patch.schema && patch.schema.find(f => req.dataset.schema.find(df => df.key === f.key && df.timeZone !== f.timeZone))) {
      // some timeZone has changed on a field, trigger full re-indexing
      patch.status = 'analyzed'
    } else if (removedRestProp) {
      patch.status = 'analyzed'
    } else if (patch.schema && !datasetUtils.schemasFullyCompatible(patch.schema, req.dataset.schema)) {
      try {
        // this method will routinely throw errors
        // we just try in case elasticsearch considers the new mapping compatible
        // so that we might optimize and reindex only when necessary
        await esUtils.updateDatasetMapping(req.app.get('es'), { id: req.dataset.id, schema: patch.schema }, req.dataset)
        patch.status = 'indexed'
      } catch (err) {
        // generated ES mappings are not compatible, trigger full re-indexing
        patch.status = 'analyzed'
      }
      await datasetUtils.updateStorage(req.app, { ...req.dataset, schema: patch.schema })
    } else if (patch.thumbnails || patch.masterData) {
      // just change finalizedAt so that cache is invalidated, but the worker doesn't relly need to work on the dataset
      patch.finalizedAt = (new Date()).toISOString()
    } else if (patch.rest) {
      // changes in rest history mode will be processed by the finalizer worker
      patch.status = 'indexed'
    }

    const previousDataset = { ...req.dataset }
    const mongoPatch = await datasetUtils.applyPatch(db, req.dataset, patch, false)
    await publicationSites.applyPatch(db, previousDataset, req.dataset, req.user, 'dataset')
    try {
      await db.collection('datasets').updateOne({ id: req.dataset.id }, mongoPatch)
    } catch (err) {
      if (err.code !== 11000) throw err
      throw createError(400, req.__('errors.dupSlug'))
    }

    await syncRemoteService(db, req.dataset)

    res.status(200).json(clean(req.publicBaseUrl, req.publicationSite, req.dataset))
  }))

// Change ownership of a dataset
router.put('/:datasetId/owner', readDataset(), permissions.middleware('changeOwner', 'admin'), asyncWrap(async (req, res) => {
  // Must be able to delete the current dataset, and to create a new one for the new owner to proceed
  if (!req.user.adminMode) {
    if (req.body.type === 'user' && req.body.id !== req.user.id) return res.status(403).send()
    if (req.body.type === 'organization') {
      const userOrg = req.user.organizations.find(o => o.id === req.body.id)
      if (!userOrg) return res.status(403).send()
      if (![config.contribRole, config.adminRole].includes(userOrg.role)) return res.status(403).send(req.__('errors.missingPermission'))
    }
  }

  if (req.body.type !== req.dataset.owner.type && req.body.id !== req.dataset.owner.id) {
    const remaining = await limits.remaining(req.app.get('db'), req.body)
    if (remaining.nbDatasets === 0) {
      return res.status(429).send(req.__('errors.exceedLimitNbDatasets'))
    }
    if (req.dataset.storage) {
      if (remaining.storage !== -1 && remaining.storage < req.dataset.storage.size) {
        return res.status(429).send(req.__('errors.exceedLimitStorage'))
      }
      if (remaining.indexed !== -1 && req.dataset.storage.indexed && remaining.indexed < req.dataset.storage.indexed.size) {
        return res.status(429).send(req.__('errors.exceedLimitIndexed'))
      }
    }
  }

  const patch = {
    owner: req.body,
    updatedBy: { id: req.user.id, name: req.user.name },
    updatedAt: moment().toISOString()
  }
  await permissions.initResourcePermissions(patch)

  const patchedDataset = (await req.app.get('db').collection('datasets')
    .findOneAndUpdate({ id: req.dataset.id }, { $set: patch }, { returnDocument: 'after' })).value

  // Move all files
  if (datasetUtils.dir(req.dataset) !== datasetUtils.dir(patchedDataset)) {
    try {
      await fs.move(datasetUtils.dir(req.dataset), datasetUtils.dir(patchedDataset))
    } catch (err) {
      console.warn('Error while moving dataset directory', err)
    }
  }

  await syncRemoteService(req.app.get('db'), patchedDataset)

  await datasetUtils.updateTotalStorage(req.app.get('db'), req.dataset.owner)
  await datasetUtils.updateTotalStorage(req.app.get('db'), patch.owner)

  res.status(200).json(clean(req.publicBaseUrl, req.publicationSite, patchedDataset))
}))

// Delete a dataset
router.delete('/:datasetId', readDataset(null, true, true), permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  await datasetUtils.delete(req.app, req.dataset)
  if (req.dataset.draftReason && req.dataset.prod && req.dataset.prod.status !== 'draft') {
    await datasetUtils.delete(req.app, req.dataset.prod)
  }
  await syncRemoteService(req.app.get('db'), { ...req.dataset, masterData: null })
  await datasetUtils.updateTotalStorage(req.app.get('db'), req.dataset.owner)
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
  curateDataset(dataset)
  return dataset
}

const curateDataset = (dataset) => {
  if (dataset.title) dataset.title = dataset.title.trim()
}

const titleFromFileName = (name) => {
  let baseFileName = path.parse(name).name
  if (baseFileName.endsWith('.gz')) baseFileName = path.parse(baseFileName).name
  return path.parse(baseFileName).name.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).join(' ')
}

const setFileInfo = async (req, file, attachmentsFile, dataset, draft, res) => {
  const db = req.app.get('db')
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
    // TODO: merge this with datasetUtils.insertWithId ?
    // it would require either inserting the dataset here before finishing analyzing the file
    // or analyzing the file in a temporary directory, then inserting the dataset afterward and copying file in the directory then
    dataset.id = nanoid()
    const baseTitle = dataset.title || titleFromFileName(file.originalname)
    const baseSlug = slug(baseTitle, { lower: true, strict: true })
    dataset.slug = baseSlug
    dataset.title = baseTitle
    let i = 1; let dbIdExists = false; let dbSlugExists = false; let fileExists = false; let acquiredLock = false
    do {
      if (i > 1) {
        dataset.slug = `${baseSlug}-${i}`
        dataset.title = baseTitle + ' ' + i
      }
      dbIdExists = await db.collection('datasets').countDocuments({ id: dataset.id })
      dbSlugExists = await db.collection('datasets').countDocuments({ slug: dataset.slug, 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id })
      fileExists = await fs.exists(datasetUtils.dir(dataset))
      if (!dbIdExists && !dbSlugExists && !fileExists) {
        acquiredLock = await lockNewDataset(req, res, dataset)
      }
      i += 1
    } while (dbIdExists || dbSlugExists || fileExists || !acquiredLock)

    if (draft) {
      dataset.status = 'draft'
      patch.draftReason = { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon' }
    }

    await fs.ensureDir(datasetUtils.dir({ ...dataset, ...patch }))
    await fs.move(file.path, datasetUtils.originalFilePath({ ...dataset, ...patch }))
  } else {
    if (draft) {
      patch.draftReason = { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant' }
    }
  }
  dataset.title = dataset.title || file.title

  // in draft mode this file replacement will occur later, when draft is validated
  if (!draft) {
    const oldoriginalFilePath = dataset.originalFile && datasetUtils.originalFilePath({ ...dataset, ...patch, originalFile: dataset.originalFile })
    const neworiginalFilePath = datasetUtils.originalFilePath({ ...dataset, ...patch })
    if (oldoriginalFilePath && oldoriginalFilePath !== neworiginalFilePath) {
      await fs.remove(oldoriginalFilePath)
    }
  }

  if (file && !basicTypes.includes(file.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    patch.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    patch.status = 'loaded'
    if (file) {
      patch.file = patch.originalFile
      const filePath = datasetUtils.filePath({ ...dataset, ...patch })
      const fileSample = await datasetFileSample({ ...dataset, ...patch })
      debugFiles(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${filePath}`)
      patch.file.encoding = chardet.detect(fileSample)
      debugFiles(`Detected encoding ${patch.file.encoding} for file ${filePath}`)
    }
  }

  if (draft && !file && !await fs.pathExists(datasetUtils.filePath({ ...dataset, ...patch }))) {
    // this happens if we upload only the attachments, not the data file itself
    // in this case copy the one from prod
    await fs.copy(datasetUtils.filePath(dataset), datasetUtils.filePath({ ...dataset, ...patch }))
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
    return res.status(429).send(req.__('errors.exceedLimitNbDatasets'))
  }
  next()
})
router.post('', beforeUpload, checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fsyncFiles, clamav.middleware, filesUtils.fixFormBody(validatePost), asyncWrap(async (req, res) => {
  req.files = req.files || []
  debugFiles('POST datasets uploaded some files', req.files)
  try {
    const db = req.app.get('db')

    validateURLFriendly(req, req.body.id)
    validateURLFriendly(req, req.body.slug)

    let dataset
    // After uploadFile, req.files contains the metadata of an uploaded file, and req.body the content of additional text fields
    const datasetFile = req.files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
    const attachmentsFile = req.files.find(f => f.fieldname === 'attachments')
    if (datasetFile) {
      if (req.body.isVirtual) throw createError(400, 'Un jeu de données virtuel ne peut pas être initialisé avec un fichier')
      // TODO: do this in a worker instead ?
      const datasetPromise = setFileInfo(req, datasetFile, attachmentsFile, await initNew(db, req), req.query.draft === 'true', res)
      await Promise.race([datasetPromise, new Promise(resolve => setTimeout(resolve, 5000))])
      // send header at this point, if we are not finished processing files
      // asyncWrap keepalive option will keep request alive
      res.writeHeader(201, { 'Content-Type': 'application/json' })
      res.write(' ')
      try {
        dataset = await datasetPromise
        permissions.initResourcePermissions(dataset, req.user)
      } catch (err) {
        // should not happen too often, but sometimes we get an error after sending the 201 status
        // we return an error object nevertheless, better than to do nothing
        res.send({ error: err.message })
        throw err
      }
      curateDataset(dataset)
      datasetUtils.setUniqueRefs(dataset)
      await lockNewDataset(req, res, dataset)
      await db.collection('datasets').insertOne(dataset)
      await datasetUtils.updateStorage(req.app, dataset)
    } else if (req.body.isVirtual) {
      if (!req.body.title) throw createError(400, 'Un jeu de données virtuel doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données virtuel ne peut pas avoir de pièces jointes')
      validatePost(req.body)
      dataset = await initNew(db, req)
      permissions.initResourcePermissions(dataset, req.user)
      dataset.virtual = dataset.virtual || { children: [] }
      dataset.schema = await virtualDatasetsUtils.prepareSchema(db, dataset)
      dataset.status = 'indexed'
      await datasetUtils.insertWithId(db, dataset, res)
    } else if (req.body.isRest) {
      if (!req.body.title) throw createError(400, 'Un jeu de données éditable doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données éditable ne peut pas être créé avec des pièces jointes')
      validatePost(req.body)
      dataset = await initNew(db, req)
      permissions.initResourcePermissions(dataset, req.user)
      dataset.rest = dataset.rest || {}
      dataset.schema = dataset.schema || []
      // the dataset will go through a first index/finalize steps, not really necessary
      // but this way everything will be initialized (journal, index)
      dataset.status = 'analyzed'
      await datasetUtils.insertWithId(db, dataset, res)
      await restDatasetsUtils.initDataset(db, dataset)
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { status: 'analyzed' } })
    } else if (req.body.isMetaOnly) {
      if (!req.body.title) throw createError(400, 'Un jeu de données métadonnées doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données métadonnées ne peut pas être créé avec des pièces jointes')
      validatePost(req.body)
      dataset = await initNew(db, req)
      permissions.initResourcePermissions(dataset, req.user)
      await datasetUtils.insertWithId(db, dataset, res)
    } else if (req.body.remoteFile) {
      validatePost(req.body)
      dataset = await initNew(db, req)
      req.body.remoteFile.name = req.body.remoteFile.name || path.basename(new URL(req.body.remoteFile.url).pathname)
      dataset.title = dataset.title || titleFromFileName(req.body.remoteFile.name)
      permissions.initResourcePermissions(dataset, req.user)
      dataset.status = 'imported'
      await datasetUtils.insertWithId(db, dataset, res)
    } else {
      throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "éditable" ou "métadonnées"')
    }

    delete dataset._id

    await datasetUtils.updateTotalStorage(req.app.get('db'), dataset.owner)
    await journals.log(req.app, dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id }, 'dataset')
    await syncRemoteService(db, dataset)
    res.status(201).send(clean(req.publicBaseUrl, req.publicationSite, dataset, {}, req.query.draft === 'true'))
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
  if (!await db.collection('datasets').countDocuments({ id: newDataset.id })) {
    validateURLFriendly(req, newDataset.id)
  }
  const baseSlug = slug(newDataset.title || newDataset.id, { lower: true, strict: true })
  let i = 0

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newDataset.owner, 'datasets', 'post', req.user, db)) {
    while (true) {
      i++
      try {
        newDataset.slug = i > 1 ? `${baseSlug}-${i}` : baseSlug
        datasetUtils.setUniqueRefs(newDataset)
        await db.collection('datasets').insertOne(newDataset)
        break
      } catch (err) {
        if (err.code !== 11000) throw err
        if (err.keyValue.id) return next()
      }
    }
    req.isNewDataset = true
    if ((await limits.remaining(req.app.get('db'), newDataset.owner)).nbDatasets === 0) {
      return res.status(429, req.__('errors.exceedLimitNbDatasets'))
    }
    await datasetUtils.updateTotalStorage(req.app.get('db'), newDataset.owner)
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
    if (req.body.extensions) prepareExtensions(req, req.body.extensions, dataset.extensions)
    if (req.body.extensions || dataset.extensions) {
      req.body.schema = await extensions.prepareSchema(db, req.body.schema, req.body.extensions || dataset.extensions)
    }

    req.body.updatedBy = { id: req.user.id, name: req.user.name }
    req.body.updatedAt = moment().toISOString()

    if (datasetFile || attachmentsFile) {
      // send header at this point, then asyncWrap keepalive option will keep request alive while we process files
      // TODO: do this in a worker instead ?
      res.writeHeader(req.isNewDataset ? 201 : 200, { 'Content-Type': 'application/json' })
      res.write(' ')

      dataset = await setFileInfo(req, datasetFile, attachmentsFile, { ...dataset, ...req.body }, req.query.draft === 'true', res)
      if (req.query.skipAnalysis === 'true') req.body.status = 'analyzed'
    } else if (dataset.isVirtual) {
      const { isVirtual, updatedBy, updatedAt, ...patch } = req.body
      validatePatch(patch)
      validateURLFriendly(req, patch.slug)
      req.body.virtual = req.body.virtual || { children: [] }
      req.body.schema = await virtualDatasetsUtils.prepareSchema(db, { ...dataset, ...req.body })
      req.body.status = 'indexed'
    } else if (dataset.isRest) {
      const { isRest, updatedBy, updatedAt, ...patch } = req.body
      validatePatch(patch)
      validateURLFriendly(req, patch.slug)
      req.body.rest = req.body.rest || {}
      if (req.isNewDataset) {
        await restDatasetsUtils.initDataset(db, { ...dataset, ...req.body })
        dataset.status = 'analyzed'
      } else {
        try {
          // this method will routinely throw errors
          // we just try in case elasticsearch considers the new mapping compatible
          // so that we might optimize and reindex only when necessary
          await esUtils.updateDatasetMapping(req.app.get('es'), { id: req.dataset.id, schema: req.body.schema }, req.dataset)
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
    if (req.isNewDataset) permissions.initResourcePermissions(dataset, req.user)
    await db.collection('datasets').replaceOne({ id: dataset.id }, dataset)
    if (req.isNewDataset) await journals.log(req.app, dataset, { type: 'dataset-created' }, 'dataset')
    else if (!dataset.isRest && !dataset.isVirtual) {
      await journals.log(
        req.app,
        req.query.draft === 'true' ? datasetUtils.mergeDraft({ ...dataset }) : dataset,
        { type: 'data-updated' }, 'dataset')
    }
    await Promise.all([
      datasetUtils.updateStorage(req.app, dataset),
      syncRemoteService(db, dataset)
    ])
    res.status(req.isNewDataset ? 201 : 200).send(clean(req.publicBaseUrl, req.publicationSite, dataset, {}, req.query.draft === 'true'))
  } catch (err) {
    // Wrapped the whole thing in a try/catch to remove files in case of failure
    for (const file of req.files) {
      await fs.remove(file.path)
    }
    throw err
  }
}, { keepalive: true })
router.post('/:datasetId', lockDataset(), attemptInsert, readDataset(['finalized', 'error']), permissions.middleware('writeData', 'write'), checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fsyncFiles, clamav.middleware, filesUtils.fixFormBody(validatePost), updateDataset)
router.put('/:datasetId', lockDataset(), attemptInsert, readDataset(['finalized', 'error']), permissions.middleware('writeData', 'write'), checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fsyncFiles, clamav.middleware, filesUtils.fixFormBody(validatePost), updateDataset)

// validate the draft
router.post('/:datasetId/draft', readDataset(['finalized'], true), permissions.middleware('validateDraft', 'write'), lockDataset(), asyncWrap(async (req, res, next) => {
  if (!req.dataset.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  return res.send(await datasetUtils.validateDraft(req.app, req.dataset, req.user, req))
}))

// cancel the draft
router.delete('/:datasetId/draft', readDataset(['finalized', 'error'], true), permissions.middleware('cancelDraft', 'write'), lockDataset(), asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (!req.dataset.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  await journals.log(req.app, req.dataset, { type: 'draft-cancelled' }, 'dataset')
  const patchedDataset = (await db.collection('datasets')
    .findOneAndUpdate({ id: req.dataset.id }, { $unset: { draft: '' } }, { returnDocument: 'after' })).value
  await fs.remove(datasetUtils.dir(req.dataset))
  await esUtils.delete(req.app.get('es'), req.dataset)
  await datasetUtils.updateStorage(req.app, patchedDataset)
  return res.send(patchedDataset)
}))

// CRUD operations for REST datasets
function isRest (req, res, next) {
  if (!req.dataset.isRest) {
    return res.status(501)
      .send('Les opérations de modifications sur les lignes sont uniquement accessibles pour les jeux de données éditables.')
  }
  next()
}
const writableStatuses = ['finalized', 'updated', 'extended-updated', 'indexed', 'error']
router.get('/:datasetId/lines/:lineId', readDataset(), isRest, permissions.middleware('readLine', 'read', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readLine))
router.post('/:datasetId/lines', readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, filesUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.createLine))
router.put('/:datasetId/lines/:lineId', readDataset(writableStatuses), isRest, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, filesUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.updateLine))
router.patch('/:datasetId/lines/:lineId', readDataset(writableStatuses), isRest, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, filesUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.patchLine))
router.post('/:datasetId/_bulk_lines', readDataset(writableStatuses), isRest, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), checkStorage(false), restDatasetsUtils.uploadBulk, asyncWrap(restDatasetsUtils.bulkLines))
router.delete('/:datasetId/lines/:lineId', readDataset(writableStatuses), isRest, permissions.middleware('deleteLine', 'write'), asyncWrap(restDatasetsUtils.deleteLine))
router.get('/:datasetId/lines/:lineId/revisions', readDataset(writableStatuses), isRest, permissions.middleware('readLineRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))
router.get('/:datasetId/revisions', readDataset(writableStatuses), isRest, permissions.middleware('readRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))
router.delete('/:datasetId/lines', readDataset(writableStatuses), isRest, permissions.middleware('deleteAllLines', 'write'), asyncWrap(restDatasetsUtils.deleteAllLines))
router.post('/:datasetId/_sync_attachments_lines', readDataset(writableStatuses), isRest, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), asyncWrap(restDatasetsUtils.syncAttachmentsLines))

// specific routes with rest datasets with lineOwnership activated
router.use('/:datasetId/own/:owner', readDataset(writableStatuses), isRest, (req, res, next) => {
  if (!req.dataset.rest?.lineOwnership) {
    return res.status(501)
      .send('Les opérations de gestion des lignes par propriétaires ne sont pas supportées pour ce jeu de données.')
  }
  const [type, id, department] = req.params.owner.split(':')
  req.query.owner = req.params.owner
  req.linesOwner = { type, id, department }
  if (!['organization', 'user'].includes(req.linesOwner.type)) return res.status(400).send('ownerType must be user or organization')
  if (!req.user) return res.status(401).send('auth required')
  if (req.linesOwner.type === 'organization' && req.user.activeAccount.type === 'organization' && req.user.activeAccount.id === req.linesOwner.id && (req.user.activeAccount.department || null) === (req.linesOwner.department || null)) {
    req.linesOwner.name = req.user.activeAccount.name
    return next()
  }
  if (req.linesOwner.type === 'user' && req.user.id === req.linesOwner.id) {
    req.linesOwner.name = req.user.name
    return next()
  }
  if (req.user.adminMode) return next()
  res.status(403).send('only owner can manage his own lines')
})
router.get('/:datasetId/own/:owner/lines/:lineId', readDataset(), isRest, applicationKey, permissions.middleware('readOwnLine', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readLine))
router.post('/:datasetId/own/:owner/lines', readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('createOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.createLine))
router.put('/:datasetId/own/:owner/lines/:lineId', readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('updateOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.updateLine))
router.patch('/:datasetId/own/:owner/lines/:lineId', readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('patchOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.patchLine))
router.post('/:datasetId/own/:owner/_bulk_lines', lockDataset((body, query) => query.lock === 'true'), readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('bulkOwnLines', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadBulk, asyncWrap(restDatasetsUtils.bulkLines))
router.delete('/:datasetId/own/:owner/lines/:lineId', readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('deleteOwnLine', 'manageOwnLines'), asyncWrap(restDatasetsUtils.deleteLine))
router.get('/:datasetId/own/:owner/lines/:lineId/revisions', readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('readOwnLineRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))
router.get('/:datasetId/own/:owner/revisions', readDataset(writableStatuses), isRest, applicationKey, permissions.middleware('readOwnRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))

// Specific routes for datasets with masterData functionalities enabled
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
      const item = esUtils.prepareResultItem(hit, req.dataset, req.query, req.publicBaseUrl)
      let label = item[singleSearch.output.key]
      if (singleSearch.label && item[singleSearch.label.key]) label += ` (${item[singleSearch.label.key]})`
      return { output: item[singleSearch.output.key], label, score: item._score || undefined }
    })
  }
  res.send(result)
}))
router.post('/:datasetId/master-data/bulk-searchs/:bulkSearchId', readDataset(), permissions.middleware('bulkSearch', 'read'), asyncWrap(async (req, res) => {
  // no buffering of this response in the reverse proxy
  res.setHeader('X-Accel-Buffering', 'no')
  await pump(
    req,
    ...await bulkSearchStreams(req.app.get('db'), req.app.get('es'), req.dataset, req.get('Content-Type'), req.params.bulkSearchId, req.query.select),
    res
  )
}))

// Error from ES backend should be stored in the journal
async function manageESError (req, err) {
  const message = esUtils.errorMessage(err)
  const status = err.status || err.statusCode || 500

  console.error(`(es-query-${status}) elasticsearch query error ${req.dataset.id}`, req.originalUrl, status, message, err.stack)
  if (status === 400) {
    prometheus.esQueryError.inc()
  } else {
    prometheus.internalError.inc({ errorCode: 'es-query-' + status })
  }

  // We used to store an error on the data whenever a dataset encountered an elasticsearch error
  // but this can end up storing too many errors when the cluster is in a bad state
  // revert to simply logging
  // if (req.dataset.status === 'finalized' && err.statusCode >= 404 && errBody.type !== 'search_phase_execution_exception') {
  // await req.app.get('db').collection('datasets').updateOne({ id: req.dataset.id }, { $set: { status: 'error' } })
  // await journals.log(req.app, req.dataset, { type: 'error', data: message })
  // }
  throw createError(status, message)
}

// Read/search data for a dataset
const readLines = asyncWrap(async (req, res) => {
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
    if (!req.query.select.includes('_geopoint')) req.query.select += ',_geopoint'
  }
  if (req.query.format === 'wkt') {
    if (req.dataset.schema.find(p => p.key === '_geoshape')) req.query.select = '_geoshape'
    else req.query.select = '_geopoint'
  }

  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(db, req.dataset)

  const sampling = req.query.sampling || 'neighbors'
  if (!['max', 'neighbors'].includes(sampling)) return res.status(400).send('Sampling can be "max" or "neighbors"')

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)

  let xyz
  if (vectorTileRequested) {
    // default is smaller (see es/commons) for other format, but we want filled tiles by default
    req.query.size = req.query.size || config.elasticsearch.maxPageSize + ''
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

    const requestedSize = Number(req.query.size)
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

          // only add _geoshape to tile if it is not going to be huge
          // otherwise features will be shown as points
          if (req.dataset.storage && req.dataset.storage.indexed && req.dataset.count) {
            const meanFeatureSize = Math.round(req.dataset.storage.indexed.size / req.dataset.count)
            const expectedTileSize = meanFeatureSize * maxCount
            // arbitrary limit at 50mo
            if (expectedTileSize > (50 * 1000 * 1000)) req.query.select = req.query.select.replace(',_geoshape', '')
          }
        }
      } catch (err) {
        await manageESError(req, err)
      }
    }
  }

  let esResponse
  try {
    esResponse = await esUtils.search(req.app.get('es'), req.dataset, req.query, req.publicBaseUrl, req.query.html === 'true')
  } catch (err) {
    await manageESError(req, err)
  }

  // manage pagination based on search_after, cd https://www.elastic.co/guide/en/elasticsearch/reference/current/paginate-search-results.html

  // eslint-disable-next-line no-unused-vars
  const [_, size] = findUtils.pagination(req.query)

  let nextLinkURL
  if (size && esResponse.hits.hits.length === size) {
    nextLinkURL = new URL(`${req.publicBaseUrl}/api/v1/datasets/${req.dataset.id}/lines`)
    for (const key of Object.keys(req.query)) {
      if (key !== 'page') nextLinkURL.searchParams.set(key, req.query[key])
    }
    const lastHit = esResponse.hits.hits[esResponse.hits.hits.length - 1]
    nextLinkURL.searchParams.set('after', JSON.stringify(lastHit.sort).slice(1, -1))
    const link = new LinkHeader()
    link.set({ rel: 'next', uri: nextLinkURL.href })
    res.set('Link', link.toString())
  }

  if (req.query.format === 'geojson') {
    const geojson = geo.result2geojson(esResponse)
    // geojson format benefits from bbox info
    geojson.bbox = (await esUtils.bboxAgg(req.app.get('es'), req.dataset, { ...req.query })).bbox
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.geojson"`)
    res.throttleEnd()
    return res.status(200).send(geojson)
  }

  if (req.query.format === 'wkt') {
    const wkt = geo.result2wkt(esResponse)
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.wkt"`)
    res.throttleEnd()
    return res.status(200).send(wkt)
  }

  if (vectorTileRequested) {
    const tile = await tiles.geojson2pbf(geo.result2geojson(esResponse), xyz)
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
    res.throttleEnd()
    return res.status(200).send(tile)
  }

  const result = { total: esResponse.hits.total.value }
  if (nextLinkURL) result.next = nextLinkURL.href
  if (req.query.collapse) result.totalCollapse = esResponse.aggregations.totalCollapse.value
  result.results = esResponse.hits.hits.map(hit => {
    return esUtils.prepareResultItem(hit, req.dataset, req.query, req.publicBaseUrl)
  })

  if (req.query.format === 'csv') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.csv"`)
    // add BOM for excel, cf https://stackoverflow.com/a/17879474
    res.write('\ufeff')
    const csvStreams = outputs.result2csv(req.dataset, req.query)
    const intoStream = (await import('into-stream')).default
    await pump(
      intoStream.object(result.results),
      ...csvStreams,
      res.throttle('dynamic'),
      res
    )
    return
  }

  if (req.query.format === 'xlsx') {
    res.throttleEnd()
    const sheet = outputs.results2sheet(req, result.results)
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.xlsx"`)
    return res.status(200).send(sheet)
  }
  if (req.query.format === 'ods') {
    res.throttleEnd()
    const sheet = outputs.results2sheet(req, result.results, 'ods')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.ods"`)
    return res.status(200).send(sheet)
  }

  res.throttleEnd()
  res.status(200).send(result)
})
router.get('/:datasetId/lines', readDataset(), applicationKey, permissions.middleware('readLines', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), readLines)
router.get('/:datasetId/own/:owner/lines', readDataset(), isRest, applicationKey, permissions.middleware('readOwnLines', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, readLines)

// Special geo aggregation
router.get('/:datasetId/geo_agg', readDataset(), applicationKey, permissions.middleware('getGeoAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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
    result = await esUtils.geoAgg(req.app.get('es'), req.dataset, req.query, req.publicBaseUrl)
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
    const tile = await tiles.geojson2pbf(geo.aggs2geojson(result), req.query.xyz.split(',').map(Number))
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
router.get('/:datasetId/values_agg', readDataset(), applicationKey, permissions.middleware('getValuesAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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
    result = await esUtils.valuesAgg(req.app.get('es'), req.dataset, req.query, vectorTileRequested || req.query.format === 'geojson', req.publicBaseUrl)
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
    const tile = await tiles.geojson2pbf(geo.aggs2geojson(result), req.query.xyz.split(',').map(Number))
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
router.get('/:datasetId/values/:fieldKey', readDataset(), applicationKey, permissions.middleware('getValues', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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

// Simple metric aggregation to calculate 1 value (sum, avg, etc.) about 1 column
router.get('/:datasetId/metric_agg', readDataset(), applicationKey, permissions.middleware('getMetricAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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

// Simple metric aggregation to calculate some basic values about a list of columns
router.get('/:datasetId/simple_metrics_agg', readDataset(), applicationKey, permissions.middleware('getSimpleMetricsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  res.throttleEnd()
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.simpleMetricsAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple words aggregation for significant terms extraction
router.get('/:datasetId/words_agg', readDataset(), applicationKey, permissions.middleware('getWordsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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

// DEPRECATED, replaced by metric_agg
// Get max value of a field
router.get('/:datasetId/max/:fieldKey', readDataset(), applicationKey, permissions.middleware('getMaxAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.maxAgg(req.app.get('es'), req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// DEPRECATED, replaced by metric_agg
// Get min value of a field
router.get('/:datasetId/min/:fieldKey', readDataset(), applicationKey, permissions.middleware('getMinAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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
  // the transform stream option was patched into "send" module using patch-package
  res.download(req.params['0'], null, { transformStream: res.throttle('static'), root: datasetUtils.attachmentsDir(req.dataset) })
})

// Direct access to data files
router.get('/:datasetId/data-files', readDataset(), permissions.middleware('listDataFiles', 'read'), asyncWrap(async (req, res, next) => {
  res.send(await datasetUtils.dataFiles(req.dataset, req.publicBaseUrl))
}))
router.get('/:datasetId/data-files/*', readDataset(), permissions.middleware('downloadDataFile', 'read', 'readDataFiles'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  res.download(req.params['0'], null, { transformStream: res.throttle('static'), root: datasetUtils.dir(req.dataset) })
}))

// Special attachments referenced in dataset metadatas
router.post('/:datasetId/metadata-attachments', readDataset(), permissions.middleware('postMetadataAttachment', 'write'), checkStorage(false), attachments.metadataUpload(), clamav.middleware, asyncWrap(async (req, res, next) => {
  req.body.size = (await fs.promises.stat(req.file.path)).size
  req.body.updatedAt = moment().toISOString()
  await datasetUtils.updateStorage(req.app, req.dataset)
  res.status(200).send(req.body)
}))
router.get('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('downloadMetadataAttachment', 'read'), cacheHeaders.noCache, (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  res.download(req.params['0'], null, { transformStream: res.throttle('static'), root: datasetUtils.metadataAttachmentsDir(req.dataset) })
})
router.delete('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('deleteMetadataAttachment', 'write'), asyncWrap(async (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
  await fs.remove(path.join(datasetUtils.metadataAttachmentsDir(req.dataset), filePath))
  await datasetUtils.updateStorage(req.app, req.dataset)
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
  res.download(req.dataset.originalFile.name, null, { transformStream: res.throttle('static'), root: datasetUtils.dir(req.dataset) })
}))

// Download the dataset in various formats
router.get('/:datasetId/convert', readDataset(), permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, (req, res, next) => {
  if (!req.dataset.file) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')

  // the transform stream option was patched into "send" module using patch-package
  res.download(req.dataset.file.name, null, { transformStream: res.throttle('static'), root: datasetUtils.dir(req.dataset) })
})

// Download the full dataset with extensions
// TODO use ES scroll functionality instead of file read + extensions
router.get('/:datasetId/full', readDataset(), permissions.middleware('downloadFullData', 'read', 'readDataFiles'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  if (await fs.pathExists(datasetUtils.fullFilePath(req.dataset))) {
    res.download(datasetUtils.fullFileName(req.dataset), null, { transformStream: res.throttle('static'), root: datasetUtils.dir(req.dataset) })
  } else {
    res.download(req.dataset.file.name, null, { transformStream: res.throttle('static'), root: datasetUtils.dir(req.dataset) })
  }
}))

router.get('/:datasetId/api-docs.json', readDataset(), permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased(), asyncWrap(async (req, res) => {
  const settings = await req.app.get('db').collection('settings')
    .findOne({ type: req.dataset.owner.type, id: req.dataset.owner.id }, { projection: { info: 1 } })
  res.send(datasetAPIDocs(req.dataset, req.publicBaseUrl, (settings && settings.info) || {}, req.publicationSite).api)
}))

router.get('/:datasetId/private-api-docs.json', readDataset(), permissions.middleware('readPrivateApiDoc', 'readAdvanced'), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const settings = await req.app.get('db').collection('settings')
    .findOne({ type: req.dataset.owner.type, id: req.dataset.owner.id }, { projection: { info: 1 } })
  res.send(privateDatasetAPIDocs(req.dataset, req.publicBaseUrl, req.user, (settings && settings.info) || {}))
}))

router.get('/:datasetId/journal', readDataset(), permissions.middleware('readJournal', 'read'), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'dataset',
    id: req.dataset.id,
    'owner.type': req.dataset.owner.type,
    'owner.id': req.dataset.owner.id
  })
  if (!journal) return res.send([])
  delete journal.owner
  journal.events.reverse()
  for (const e of journal.events) {
    if (e.data) e.data = sanitizeHtml(e.data)
  }
  res.json(journal.events)
}))

router.post('/:datasetId/user-notification', readDataset(), permissions.middleware('sendUserNotification', 'write'), asyncWrap(async (req, res, next) => {
  const userNotification = req.body
  validateUserNotification(userNotification)
  const urlParams = userNotification.urlParams || {}
  userNotification.visibility = userNotification.visibility || 'private'
  if (userNotification.visibility !== 'private') {
    const ownerRole = permissions.getOwnerRole(req.dataset.owner, req.user)
    if (!['admin', 'contrib'].includes(ownerRole)) return res.status(403).send('User does not have permission to emit a public notification')
  }
  const notif = {
    sender: req.dataset.owner,
    topic: { key: `data-fair:dataset-user-notification:${req.dataset.slug}:${userNotification.topic}` },
    title: userNotification.title,
    body: userNotification.body,
    urlParams: { ...urlParams, datasetId: req.dataset.id, datasetSlug: req.dataset.slug, userId: req.user.id },
    visibility: userNotification.visibility,
    recipient: userNotification.recipient,
    extra: { user: { id: req.user.id, name: req.user.name } }
  }
  await notifications.send(notif, true)
  res.send(notif)
}))

router.get('/:datasetId/thumbnail', readDataset(), permissions.middleware('readDescription', 'read'), asyncWrap(async (req, res, next) => {
  if (!req.dataset.image) return res.status(404).send("dataset doesn't have an image")
  await getThumbnail(req, res, req.dataset.image)
}))
router.get('/:datasetId/thumbnail/:thumbnailId', readDataset(), permissions.middleware('readLines', 'read'), asyncWrap(async (req, res, next) => {
  const url = Buffer.from(req.params.thumbnailId, 'hex').toString()
  if (req.dataset.attachmentsAsImage) {
    await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${req.dataset.id}${url}`, path.join(datasetUtils.attachmentsDir(req.dataset), url.replace('/attachments/', '')), req.dataset.thumbnails)
  } else {
    const imageField = req.dataset.schema.find(f => f['x-refersTo'] === 'http://schema.org/image')
    const count = await esUtils.count(req.app.get('es'), req.dataset, {
      qs: `${esUtils.escapeFilter(imageField.key)}:${esUtils.escapeFilter(url)}`
    })
    if (!count) return res.status(404).send('thumbnail does not match a URL from this dataset')
    await getThumbnail(req, res, url, null, req.dataset.thumbnails)
  }
}))

// Special route with very technical informations to help diagnose bugs, broken indices, etc.
router.get('/:datasetId/_diagnose', readDataset(), cacheHeaders.noCache, asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  const esInfos = await esUtils.datasetInfos(req.app.get('es'), req.dataset)
  const filesInfos = await datasetUtils.lsFiles(req.dataset)
  const locks = [
    await req.app.get('db').collection('locks').findOne({ _id: `dataset:${req.dataset.id}` }),
    await req.app.get('db').collection('locks').findOne({ _id: `dataset:slug:${req.dataset.owner.type}:${req.dataset.owner.id}:${req.dataset.slug}` })
  ]
  res.json({ filesInfos, esInfos, locks })
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
