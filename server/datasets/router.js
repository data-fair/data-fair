const config = /** @type {any} */(require('config'))
const express = require('express')
const ajv = require('../misc/utils/ajv')
const fs = require('fs-extra')
const path = require('path')
const moment = require('moment')
const createError = require('http-errors')
const pump = require('../misc/utils/pipe')
const mongodb = require('mongodb')
const i18n = require('i18n')
const sanitizeHtml = require('../../shared/sanitize-html')
const LinkHeader = require('http-link-header')
const journals = require('../misc/utils/journals')
const esUtils = require('./es')
const uploadUtils = require('./utils/upload')
const datasetAPIDocs = require('../../contract/dataset-api-docs')
const privateDatasetAPIDocs = require('../../contract/dataset-private-api-docs')
const permissions = require('../misc/utils/permissions')
const usersUtils = require('../misc/utils/users')
const datasetUtils = require('./utils')
const restDatasetsUtils = require('./utils/rest')
const findUtils = require('../misc/utils/find')
const asyncWrap = require('../misc/utils/async-handler')
const clone = require('../misc/utils/clone')
const attachments = require('./utils/attachments')
const geo = require('./utils/geo')
const tiles = require('./utils/tiles')
const cache = require('../misc/utils/cache')
const cacheHeaders = require('../misc/utils/cache-headers')
const outputs = require('./utils/outputs')
const limits = require('../misc/utils/limits')
const notifications = require('../misc/utils/notifications')
const datasetPostSchema = require('../../contract/dataset-post')
const validatePost = ajv.compile(datasetPostSchema.properties.body)
const userNotificationSchema = require('../../contract/user-notification')
const validateUserNotification = ajv.compile(userNotificationSchema)
const { getThumbnail } = require('../misc/utils/thumbnails')
const { bulkSearchStreams } = require('./utils/master-data')
const applicationKey = require('../misc/utils/application-key')
const { validateURLFriendly } = require('../misc/utils/validation')
const observe = require('../misc/utils/observe')
const publicationSites = require('../misc/utils/publication-sites')
const clamav = require('../misc/utils/clamav')
const { syncDataset: syncRemoteService } = require('../remote-services/utils')
const { findDatasets, applyPatch, validateDraft, deleteDataset, createDataset } = require('./service')
const { tableSchema, jsonSchema, getSchemaBreakingChanges, filterSchema } = require('./utils/schema')
const { dir, attachmentsDir } = require('./utils/files')
const { preparePatch, validatePatch } = require('./utils/patch')
const { updateTotalStorage } = require('./utils/storage')
const { checkStorage, lockDataset, readDataset } = require('./middlewares')

const router = express.Router()

const clean = datasetUtils.clean

const debugFiles = require('debug')('files')
const debugLimits = require('debug')('limits')

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'datasets'
  next()
})

// Get the list of datasets
router.get('', cacheHeaders.listBased, asyncWrap(async (req, res) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl
  // @ts-ignore
  const user = req.user
  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findDatasets(req.app.get('db'), i18n.getLocale(req), publicationSite, publicBaseUrl, reqQuery, user)
  res.json(response)
}))

router.use('/:datasetId/permissions', readDataset(), permissions.router('datasets', 'dataset', async (req, patchedDataset) => {
  // this callback function is called when the resource becomes public
  await publicationSites.onPublic(req.app.get('db'), patchedDataset, 'dataset')
}))

// retrieve a dataset by its id
router.get('/:datasetId', readDataset({ acceptInitialDraft: true }), applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  // @ts-ignore
  const dataset = req.dataset.__isProxy ? req.dataset.__proxyTarget : req.dataset
  dataset.userPermissions = permissions.list('datasets', dataset, req.user, req.bypassPermissions)
  res.status(200).send(clean(req.publicBaseUrl, req.publicationSite, dataset, req.query))
})

// retrieve only the schema.. Mostly useful for easy select fields
const sendSchema = (req, res, schema) => {
  schema = filterSchema(schema, req.query)
  if (req.query.mimeType === 'application/tableschema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-tableschema.json"`)
    schema = tableSchema(schema)
  } else if (req.query.mimeType === 'application/schema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-schema.json"`)
    schema = jsonSchema(schema, req.publicBaseUrl)
  } else {
    for (const field of schema) {
      field.label = field.title || field['x-originalName'] || field.key
    }
  }
  res.status(200).send(schema)
}
router.get('/:datasetId/schema', readDataset(), applicationKey, permissions.middleware('readSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
  sendSchema(req, res, clone(req.dataset.schema))
})
// alternate read schema route that does not return clues about the data (cardinality and enums)
router.get('/:datasetId/safe-schema', readDataset(), applicationKey, permissions.middleware('readSafeSchema', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const schema = clone(req.dataset.schema)
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
  const breakingChanges = getSchemaBreakingChanges(req.dataset.schema, req.body.schema, true)
  debugBreakingChanges('breaking changes in schema ? ', breakingChanges)
  return breakingChanges.length > 0
}
const permissionsWriteDescriptionBreaking = permissions.middleware('writeDescriptionBreaking', 'write')
const permissionsManageMasterData = permissions.canDoForOwnerMiddleware('manageMasterData', true)

// Update a dataset's metadata
router.patch('/:datasetId',
  readDataset({
    acceptedStatuses: (patch, dataset) => {
      // accept different statuses of the dataset depending on the content of the patch
      if (!dataset.isMetaOnly && (patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)) {
        return ['finalized', 'error']
      } else {
        return null
      }
    }
  }),
  lockDataset((/** @type {any} */ patch) => {
    return !!(patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection)
  }),
  (req, res, next) => req.body.masterData ? permissionsManageMasterData(req, res, next) : next(),
  (req, res, next) => descriptionHasBreakingChanges(req) ? permissionsWriteDescriptionBreaking(req, res, next) : permissionsWriteDescription(req, res, next),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  (req, res, next) => req.body.exports ? permissionsWriteExports(req, res, next) : next(),
  asyncWrap(async (req, res) => {
    // @ts-ignore
    const dataset = req.dataset
    // @ts-ignore
    const user = req.user
    // @ts-ignore
    const publicBaseUrl = req.publicBaseUrl
    // @ts-ignore
    const publicationSite = req.publicationSite

    const patch = req.body
    const db = req.app.get('db')
    const locale = i18n.getLocale(req)

    validatePatch(patch)
    validateURLFriendly(locale, patch.slug)

    const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, req.body, dataset, user, locale)
      .catch(err => {
        if (err.code !== 11000) throw err
        throw createError(400, req.__('errors.dupSlug'))
      })
    if (!isEmpty) {
      await publicationSites.applyPatch(db, dataset, { ...dataset, ...patch }, user, 'dataset')
      await applyPatch(req.app, dataset, patch, removedRestProps, attemptMappingUpdate)
      await syncRemoteService(db, dataset)
    }

    res.status(200).json(clean(publicBaseUrl, publicationSite, dataset))
  }))

// Change ownership of a dataset
router.put('/:datasetId/owner', readDataset(), permissions.middleware('changeOwner', 'admin'), asyncWrap(async (req, res) => {
  // Must be able to delete the current dataset, and to create a new one for the new owner to proceed
  if (!req.user.adminMode) {
    if (req.body.type === 'user' && req.body.id !== req.user.id) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
    if (req.body.type === 'organization') {
      const userOrg = req.user.organizations.find(o => o.id === req.body.id)
      if (!userOrg) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
      if (![config.contribRole, config.adminRole].includes(userOrg.role)) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
    }
  }

  if (req.body.type !== req.dataset.owner.type && req.body.id !== req.dataset.owner.id) {
    const remaining = await limits.remaining(req.app.get('db'), req.body)
    if (remaining.nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/changeOwner', { owner: req.body, remaining })
      return res.status(429).type('text/plain').send(req.__('errors.exceedLimitNbDatasets'))
    }
    if (req.dataset.storage) {
      if (remaining.storage !== -1 && remaining.storage < req.dataset.storage.size) {
        debugLimits('exceedLimitStorage/changeOwner', { owner: req.body, remaining, storage: req.dataset.storage })
        return res.status(429).type('text/plain').send(req.__('errors.exceedLimitStorage'))
      }
      if (remaining.indexed !== -1 && req.dataset.storage.indexed && remaining.indexed < req.dataset.storage.indexed.size) {
        debugLimits('exceedLimitIndexed/changeOwner', { owner: req.body, remaining, storage: req.dataset.storage })
        return res.status(429).type('text/plain').send(req.__('errors.exceedLimitIndexed'))
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
  if (dir(req.dataset) !== dir(patchedDataset)) {
    try {
      await fs.move(dir(req.dataset), dir(patchedDataset))
    } catch (err) {
      console.warn('Error while moving dataset directory', err)
    }
  }

  await syncRemoteService(req.app.get('db'), patchedDataset)

  await updateTotalStorage(req.app.get('db'), req.dataset.owner)
  await updateTotalStorage(req.app.get('db'), patch.owner)

  res.status(200).json(clean(req.publicBaseUrl, req.publicationSite, patchedDataset))
}))

// Delete a dataset
router.delete('/:datasetId', readDataset({ acceptedStatuses: ['*'], alwaysDraft: true }), permissions.middleware('delete', 'admin'), asyncWrap(async (req, res) => {
  await deleteDataset(req.app, req.dataset)
  if (req.dataset.draftReason && req.datasetFull.status !== 'draft') {
    await deleteDataset(req.app, req.datasetFull)
  }
  await syncRemoteService(req.app.get('db'), { ...req.datasetFull, masterData: null })
  await updateTotalStorage(req.app.get('db'), req.datasetFull.owner)
  res.sendStatus(204)
}))

// Create a dataset
const createDatasetRoute = asyncWrap(async (req, res) => {
  const db = req.app.get('db')
  const locale = i18n.getLocale(req)
  // @ts-ignore
  const user = /** @type {any} */(req.user)
  const draft = req.query.draft === 'true'

  if (!user) throw createError(401)

  /** @type {undefined | any[]} */
  const files = await uploadUtils.getFiles(req, res)

  try {
    if (files) {
      await clamav.checkFiles(files, user)
      debugFiles('POST datasets uploaded some files', files)
    }

    const body = req.body = uploadUtils.getFormBody(req.body)
    validatePost(body)

    const owner = usersUtils.owner(req)
    if (!permissions.canDoForOwner(owner, 'datasets', 'post', user)) {
      throw createError(403, req.__('errors.missingPermission'))
    }
    if ((await limits.remaining(db, owner)).nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/beforeUpload', { owner })
      throw createError(429, req.__('errors.exceedLimitNbDatasets'))
    }

    // this is kept for retro-compatibility, but we should think of deprecating it
    // self chosen ids are not a good idea
    // there is a reason why we use a unique id generator and a slug system)
    if (req.params.datasetId) body.id = req.params.datasetId

    /**
     * @param {() => {}} callback
     */
    const onClose = (callback) => res.on('close', callback)

    const dataset = await createDataset(db, locale, user, owner, body, files, draft, onClose)

    await journals.log(req.app, dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id }, 'dataset')
    await syncRemoteService(db, dataset)

    res.status(201).send(clean(req.publicBaseUrl, req.publicationSite, dataset, {}, req.query.draft === 'true'))
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }
})
router.post('', checkStorage(true, true), createDatasetRoute)

const updateDatasetRoute = asyncWrap(async (req, res, next) => {
  // @ts-ignore
  const dataset = req.dataset

  if (!dataset) {
    await createDatasetRoute(req, res, next)
    return
  }

  // @ts-ignore
  const user = req.user
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl
  // @ts-ignore
  const publicationSite = req.publicationSite
  const draft = req.query.draft === 'true'

  const db = req.app.get('db')
  const locale = i18n.getLocale(req)

  const files = await uploadUtils.getFiles(req, res)

  try {
    if (files) {
      await clamav.checkFiles(files, user)
    }

    const patch = uploadUtils.getFormBody(req.body)

    validatePatch(patch)
    validateURLFriendly(locale, patch.slug)

    if (draft) {
      if (req.datasetFull.status === 'draft') {
        patch.draftReason = { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon' }
      } else {
        patch.draftReason = { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant' }
      }
    }

    const { removedRestProps, attemptMappingUpdate, isEmpty } = await preparePatch(req.app, patch, dataset, user, locale, files)
      .catch(err => {
        if (err.code !== 11000) throw err
        throw createError(400, req.__('errors.dupSlug'))
      })

    if (!isEmpty) {
      await publicationSites.applyPatch(db, dataset, { ...dataset, ...patch }, user, 'dataset')
      await applyPatch(req.app, dataset, patch, removedRestProps, attemptMappingUpdate)
      if (files) await journals.log(req.app, dataset, { type: 'data-updated' }, 'dataset')
      await syncRemoteService(db, dataset)
    }
  } catch (err) {
    if (files) {
      for (const file of files) await fs.remove(file.path)
    }
    throw err
  }

  res.status(200).json(clean(publicBaseUrl, publicationSite, dataset))
})

router.post('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute)
router.put('/:datasetId', lockDataset(), readDataset({ acceptedStatuses: ['finalized', 'error'], acceptMissing: true }), permissions.middleware('writeData', 'write', null, true), checkStorage(true, true), updateDatasetRoute)

// validate the draft
router.post('/:datasetId/draft', readDataset({ acceptedStatuses: ['finalized'], alwaysDraft: true }), permissions.middleware('validateDraft', 'write'), lockDataset(), asyncWrap(async (req, res, next) => {
  if (!req.datasetFull.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  return res.send(await validateDraft(req.app, req.datasetFull, req.dataset, req.user, req))
}))

// cancel the draft
router.delete('/:datasetId/draft', readDataset({ acceptedStatuses: ['draft', 'finalized', 'error'], alwaysDraft: true }), permissions.middleware('cancelDraft', 'write'), lockDataset(), asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (req.datasetFull.status === 'draft') {
    return res.status(409).send('Impossible d\'annuler un brouillon si aucune version du jeu de données n\'a été validée.')
  }
  if (!req.datasetFull.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  await journals.log(req.app, req.dataset, { type: 'draft-cancelled' }, 'dataset')
  const patchedDataset = (await db.collection('datasets')
    .findOneAndUpdate({ id: req.dataset.id }, { $unset: { draft: '' } }, { returnDocument: 'after' })).value
  await fs.remove(dir(req.dataset))
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

const readWritableDataset = readDataset({ acceptedStatuses: ['finalized', 'updated', 'extended-updated', 'indexed', 'error'] })
router.get('/:datasetId/lines/:lineId', readDataset(), isRest, permissions.middleware('readLine', 'read', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readLine))
router.post('/:datasetId/lines', readWritableDataset, isRest, applicationKey, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, uploadUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.createOrUpdateLine))
router.put('/:datasetId/lines/:lineId', readWritableDataset, isRest, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, uploadUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.createOrUpdateLine))
router.patch('/:datasetId/lines/:lineId', readWritableDataset, isRest, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, uploadUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.patchLine))
router.post('/:datasetId/_bulk_lines', readWritableDataset, isRest, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), checkStorage(false), restDatasetsUtils.uploadBulk, asyncWrap(restDatasetsUtils.bulkLines))
router.delete('/:datasetId/lines/:lineId', readWritableDataset, isRest, permissions.middleware('deleteLine', 'write'), asyncWrap(restDatasetsUtils.deleteLine))
router.get('/:datasetId/lines/:lineId/revisions', readWritableDataset, isRest, permissions.middleware('readLineRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))
router.get('/:datasetId/revisions', readWritableDataset, isRest, permissions.middleware('readRevisions', 'read', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))
router.delete('/:datasetId/lines', readWritableDataset, isRest, permissions.middleware('deleteAllLines', 'write'), asyncWrap(restDatasetsUtils.deleteAllLines))
router.post('/:datasetId/_sync_attachments_lines', readWritableDataset, isRest, permissions.middleware('bulkLines', 'write'), lockDataset((body, query) => query.lock === 'true'), asyncWrap(restDatasetsUtils.syncAttachmentsLines))

// specific routes with rest datasets with lineOwnership activated
router.use('/:datasetId/own/:owner', readWritableDataset, isRest, (req, res, next) => {
  if (!req.dataset.rest?.lineOwnership) {
    return res.status(501)
      .send('Les opérations de gestion des lignes par propriétaires ne sont pas supportées pour ce jeu de données.')
  }
  const [type, id, department] = req.params.owner.split(':')
  req.query.owner = req.params.owner
  req.linesOwner = { type, id, department }
  if (!['organization', 'user'].includes(req.linesOwner.type)) return res.status(400).type('text/plain').send('ownerType must be user or organization')
  if (!req.user) return res.status(401).type('text/plain').send('auth required')
  if (req.linesOwner.type === 'organization' && req.user.activeAccount.type === 'organization' && req.user.activeAccount.id === req.linesOwner.id && (req.user.activeAccount.department || null) === (req.linesOwner.department || null)) {
    req.linesOwner.name = req.user.activeAccount.name
    return next()
  }
  if (req.linesOwner.type === 'user' && req.user.id === req.linesOwner.id) {
    req.linesOwner.name = req.user.name
    return next()
  }
  if (req.user.adminMode) return next()
  res.status(403).type('text/plain').send('only owner can manage his own lines')
})
router.get('/:datasetId/own/:owner/lines/:lineId', readDataset(), isRest, applicationKey, permissions.middleware('readOwnLine', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readLine))
router.post('/:datasetId/own/:owner/lines', readWritableDataset, isRest, applicationKey, permissions.middleware('createOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.createOrUpdateLine))
router.put('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('updateOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.createOrUpdateLine))
router.patch('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('patchOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.patchLine))
router.post('/:datasetId/own/:owner/_bulk_lines', lockDataset((body, query) => query.lock === 'true'), readWritableDataset, isRest, applicationKey, permissions.middleware('bulkOwnLines', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadBulk, asyncWrap(restDatasetsUtils.bulkLines))
router.delete('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('deleteOwnLine', 'manageOwnLines'), asyncWrap(restDatasetsUtils.deleteLine))
router.get('/:datasetId/own/:owner/lines/:lineId/revisions', readWritableDataset, isRest, applicationKey, permissions.middleware('readOwnLineRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))
router.get('/:datasetId/own/:owner/revisions', readWritableDataset, isRest, applicationKey, permissions.middleware('readOwnRevisions', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readRevisions))

// Specific routes for datasets with masterData functionalities enabled
router.get('/:datasetId/master-data/single-searchs/:singleSearchId', readDataset({ fillDescendants: true }), permissions.middleware('readLines', 'read', 'readDataAPI'), asyncWrap(async (req, res) => {
  const singleSearch = req.dataset.masterData && req.dataset.masterData.singleSearchs && req.dataset.masterData.singleSearchs.find(ss => ss.id === req.params.singleSearchId)
  if (!singleSearch) return res.status(404).send(`Recherche unitaire "${req.params.singleSearchId}" inconnue`)

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
router.post('/:datasetId/master-data/bulk-searchs/:bulkSearchId', readDataset({ fillDescendants: true }), permissions.middleware('bulkSearch', 'read'), asyncWrap(async (req, res) => {
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
  console.error(`(es-query-${status}) elasticsearch query error ${req.dataset.id}`, req.originalUrl, status, req.headers.referer || req.headers.referrer, message, err.stack)
  if (status === 400) {
    observe.esQueryError.inc()
  } else {
    observe.internalError.inc({ errorCode: 'es-query-' + status })
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

// used later to count items in a tile or tile's neighbor
async function countWithCache (req, db, query) {
  if (config.cache.disabled) return esUtils.count(req.app.get('es'), req.dataset, query)
  return cache.getSet(db, {
    type: 'tile-count',
    datasetId: req.dataset.id,
    finalizedAt: req.dataset.finalizedAt,
    query
  }, async () => {
    return esUtils.count(req.app.get('es'), req.dataset, query)
  })
}

// Read/search data for a dataset
const readLines = asyncWrap(async (req, res) => {
  observe.reqRouteName(req, `${req.route.path}?format=${req.query.format || 'json'}`)
  observe.reqStep(req, 'middlewares')
  const db = req.app.get('db')
  res.throttleEnd()

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

  const sampling = req.query.sampling || 'neighbors'
  if (!['max', 'neighbors'].includes(sampling)) return res.status(400).type('text/plain').send('Sampling can be "max" or "neighbors"')

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)

  let xyz
  if (vectorTileRequested) {
    // default is smaller (see es/commons) for other format, but we want filled tiles by default
    req.query.size = req.query.size || config.elasticsearch.maxPageSize + ''
    // sorting by rand provides more homogeneous distribution in tiles
    req.query.sort = req.query.sort || '_rand'
    if (!req.query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
    xyz = req.query.xyz.split(',').map(Number)
  }

  observe.reqStep(req, 'prepare')

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
    observe.reqStep(req, 'checkTileCache')
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
        const mainCount = await countWithCache(req, db, req.query)
        if (mainCount === 0) return res.status(204).send()
        if (mainCount <= requestedSize / 20) {
          // no sampling on low density tiles
          req.query.size = requestedSize
        } else {
          const neighborsCounts = await Promise.all([
            // the 4 that share an edge
            countWithCache(req, db, { ...req.query, xyz: [xyz[0] - 1, xyz[1], xyz[2]].join(',') }),
            countWithCache(req, db, { ...req.query, xyz: [xyz[0] + 1, xyz[1], xyz[2]].join(',') }),
            countWithCache(req, db, { ...req.query, xyz: [xyz[0], xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...req.query, xyz: [xyz[0], xyz[1] + 1, xyz[2]].join(',') }),
            // Using corners also yields better results
            countWithCache(req, db, { ...req.query, xyz: [xyz[0] - 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...req.query, xyz: [xyz[0] + 1, xyz[1] - 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...req.query, xyz: [xyz[0] - 1, xyz[1] + 1, xyz[2]].join(',') }),
            countWithCache(req, db, { ...req.query, xyz: [xyz[0] + 1, xyz[1] + 1, xyz[2]].join(',') })
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

      observe.reqStep(req, 'neighborsSampling')
    }
  }

  let esResponse
  try {
    esResponse = await esUtils.search(req.app.get('es'), req.dataset, req.query, req.publicBaseUrl, req.query.html === 'true')
  } catch (err) {
    await manageESError(req, err)
  }
  observe.reqStep(req, 'search')

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
    observe.reqStep(req, 'result2geojson')
    // geojson format benefits from bbox info
    geojson.bbox = (await esUtils.bboxAgg(req.app.get('es'), req.dataset, { ...req.query })).bbox
    observe.reqStep(req, 'bboxAgg')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.slug}.geojson"`)
    return res.status(200).send(geojson)
  }

  if (req.query.format === 'wkt') {
    const wkt = geo.result2wkt(esResponse)
    observe.reqStep(req, 'result2wkt')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.slug}.wkt"`)
    return res.status(200).send(wkt)
  }

  if (vectorTileRequested) {
    const tile = await tiles.geojson2pbf(geo.result2geojson(esResponse), xyz)
    observe.reqStep(req, 'geojson2pbf')
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
    return res.status(200).send(tile)
  }

  const result = { total: esResponse.hits.total.value }
  if (nextLinkURL) result.next = nextLinkURL.href
  if (req.query.collapse) result.totalCollapse = esResponse.aggregations.totalCollapse.value
  result.results = []
  for (let i = 0; i < esResponse.hits.hits.length; i++) {
    // avoid blocking the event loop
    if (i % 500 === 499) await new Promise(resolve => setTimeout(resolve, 0))
    result.results.push(esUtils.prepareResultItem(esResponse.hits.hits[i], req.dataset, req.query, req.publicBaseUrl))
  }

  observe.reqStep(req, 'prepareResultItems')

  if (req.query.format === 'csv') {
    const csv = await outputs.results2csv(req, result.results)
    observe.reqStep(req, 'results2csv')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.slug}.csv"`)
    return res.status(200).send(csv)
  }

  if (req.query.format === 'xlsx') {
    JSON.stringify(result.results)
    observe.reqStep(req, 'stringify')
    const sheet = await outputs.results2sheet(req, result.results)
    observe.reqStep(req, 'results2xlsx')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.slug}.xlsx"`)
    return res.status(200).send(sheet)
  }
  if (req.query.format === 'ods') {
    const sheet = await outputs.results2sheet(req, result.results, 'ods')
    observe.reqStep(req, 'results2ods')
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.slug}.ods"`)
    return res.status(200).send(sheet)
  }

  res.status(200).send(result)
})
router.get('/:datasetId/lines', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('readLines', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), readLines)
router.get('/:datasetId/own/:owner/lines', readDataset({ fillDescendants: true }), isRest, applicationKey, permissions.middleware('readOwnLines', 'manageOwnLines', 'readDataAPI'), cacheHeaders.noCache, readLines)

// Special geo aggregation
router.get('/:datasetId/geo_agg', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getGeoAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  res.throttleEnd()
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
    if (!req.query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
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
router.get('/:datasetId/values_agg', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getValuesAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  res.throttleEnd()
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
    if (!req.query.xyz) return res.status(400).type('text/plain').send('xyz parameter is required for vector tile format.')
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
router.get('/:datasetId/values/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getValues', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  res.throttleEnd()
  let result
  try {
    result = await esUtils.values(req.app.get('es'), req.dataset, req.params.fieldKey, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple metric aggregation to calculate 1 value (sum, avg, etc.) about 1 column
router.get('/:datasetId/metric_agg', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getMetricAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  res.throttleEnd()
  let result
  try {
    result = await esUtils.metricAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple metric aggregation to calculate some basic values about a list of columns
router.get('/:datasetId/simple_metrics_agg', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getSimpleMetricsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  res.throttleEnd()
  let result
  try {
    result = await esUtils.simpleMetricsAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple words aggregation for significant terms extraction
router.get('/:datasetId/words_agg', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getWordsAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
  res.throttleEnd()
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
router.get('/:datasetId/max/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getMaxAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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
router.get('/:datasetId/min/:fieldKey', readDataset({ fillDescendants: true }), applicationKey, permissions.middleware('getMinAgg', 'read', 'readDataAPI'), cacheHeaders.resourceBased('finalizedAt'), asyncWrap(async (req, res) => {
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
  res.download(
    req.params['0'],
    null,
    {
      transformStream: res.throttle('static'),
      root: attachmentsDir(req.dataset)
    }
  )
})

// Direct access to data files
router.get('/:datasetId/data-files', readDataset(), permissions.middleware('listDataFiles', 'read'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  res.send(await datasetUtils.dataFiles(req.dataset, req.publicBaseUrl))
}))
router.get('/:datasetId/data-files/*', readDataset(), permissions.middleware('downloadDataFile', 'read', 'readDataFiles'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  res.download(req.params['0'], null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
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
  // res.set('content-disposition', `inline; filename="${req.params['0']}"`)
  res.sendFile(
    req.params['0'],
    {
      transformStream: res.throttle('static'),
      root: datasetUtils.metadataAttachmentsDir(req.dataset),
      headers: { 'Content-Disposition': `inline; filename="${path.basename(req.params['0'])}"` }
    }
  )
  // res.sendFile(req.params[0])
})
router.delete('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('deleteMetadataAttachment', 'write'), asyncWrap(async (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).type('text/plain').send('Unacceptable attachment path')
  await fs.remove(datasetUtils.metadataAttachmentPath(req.dataset, filePath))
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
      ...outputs.csvStreams(req.dataset, req.query),
      res
    )
    return
  }
  if (!req.dataset.originalFile) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')
  // the transform stream option was patched into "send" module using patch-package
  res.download(req.dataset.originalFile.name, null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
}))

// Download the dataset in various formats
router.get('/:datasetId/convert', readDataset(), permissions.middleware('downloadOriginalData', 'read', 'readDataFiles'), cacheHeaders.noCache, (req, res, next) => {
  if (!req.dataset.file) return res.status(404).send('Ce jeu de données ne contient pas de fichier de données')

  // the transform stream option was patched into "send" module using patch-package
  res.download(req.dataset.file.name, null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
})

// Download the full dataset with extensions
// TODO use ES scroll functionality instead of file read + extensions
router.get('/:datasetId/full', readDataset(), permissions.middleware('downloadFullData', 'read', 'readDataFiles'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  if (await fs.pathExists(datasetUtils.fullFilePath(req.dataset))) {
    res.download(datasetUtils.fullFileName(req.dataset), null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
  } else {
    res.download(req.dataset.file.name, null, { transformStream: res.throttle('static'), root: dir(req.dataset) })
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

const sendUserNotificationPermissions = permissions.middleware('sendUserNotification', 'write')
const sendUserNotificationPublicPermissions = permissions.middleware('sendUserNotificationPublic', 'write')
router.post(
  '/:datasetId/user-notification',
  readDataset(),
  (req, res, next) => req.body.visibility === 'public' ? sendUserNotificationPublicPermissions(req, res, next) : sendUserNotificationPermissions(req, res, next),
  asyncWrap(async (req, res, next) => {
    const userNotification = req.body
    validateUserNotification(userNotification)
    const urlParams = userNotification.urlParams || {}
    userNotification.visibility = userNotification.visibility || 'private'
    if (userNotification.visibility !== 'private') {
      const ownerRole = permissions.getOwnerRole(req.dataset.owner, req.user)
      if (!['admin', 'contrib'].includes(ownerRole)) return res.status(403).type('text/plain').send('User does not have permission to emit a public notification')
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
  })
)

router.get('/:datasetId/thumbnail', readDataset(), permissions.middleware('readDescription', 'read'), asyncWrap(async (req, res, next) => {
  if (!req.dataset.image) return res.status(404).send("dataset doesn't have an image")
  await getThumbnail(req, res, req.dataset.image)
}))
router.get('/:datasetId/thumbnail/:thumbnailId', readDataset(), permissions.middleware('readLines', 'read'), asyncWrap(async (req, res, next) => {
  const url = Buffer.from(req.params.thumbnailId, 'hex').toString()
  if (req.dataset.attachmentsAsImage && url.startsWith('/attachments/')) {
    await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${req.dataset.id}${url}`, datasetUtils.attachmentPath(req.dataset, url.replace('/attachments/', '')), req.dataset.thumbnails)
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
  if (!req.user) return res.status(401).type('text/plain').send()
  if (!req.user.adminMode) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
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
  if (!req.user) return res.status(401).type('text/plain').send()
  if (!req.user.adminMode) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  const patchedDataset = await datasetUtils.reindex(req.app.get('db'), req.dataset)
  res.status(200).send(patchedDataset)
}))

// Special admin route to force refinalizing a dataset
router.post('/:datasetId/_refinalize', readDataset(), asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).type('text/plain').send()
  if (!req.user.adminMode) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  const patchedDataset = await datasetUtils.refinalize(req.app.get('db'), req.dataset)
  res.status(200).send(patchedDataset)
}))

module.exports = router
