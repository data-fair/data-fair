const config = /** @type {any} */(require('config'))
const express = require('express')
const ajv = require('../misc/utils/ajv')
const path = require('path')
const fs = require('fs-extra')
const moment = require('moment')
const createError = require('http-errors')
const pump = require('../misc/utils/pipe')
const mongodb = require('mongodb')
const chardet = require('chardet')
const slug = require('slugify')
const i18n = require('i18n')
const sanitizeHtml = require('../../shared/sanitize-html')
const LinkHeader = require('http-link-header')
const journals = require('../misc/utils/journals')
const esUtils = require('./es')
const filesUtils = require('../misc/utils/files')
const datasetAPIDocs = require('../../contract/dataset-api-docs')
const privateDatasetAPIDocs = require('../../contract/dataset-private-api-docs')
const permissions = require('../misc/utils/permissions')
const usersUtils = require('../misc/utils/users')
const datasetUtils = require('./utils')
const { curateDataset } = require('./utils')
const { prepareExtensions } = require('./utils/extensions')
const virtualDatasetsUtils = require('./utils/virtual')
const restDatasetsUtils = require('./utils/rest')
const findUtils = require('../misc/utils/find')
const asyncWrap = require('../misc/utils/async-handler')
const extensions = require('./utils/extensions')
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
const debugFiles = require('debug')('files')
const { getThumbnail } = require('../misc/utils/thumbnails')
const datasetFileSample = require('./utils/file-sample')
const { bulkSearchStreams } = require('./utils/master-data')
const applicationKey = require('../misc/utils/application-key')
const { basicTypes } = require('../workers/converter')
const { validateURLFriendly } = require('../misc/utils/validation')
const observe = require('../misc/utils/observe')
const publicationSites = require('../misc/utils/publication-sites')
const clamav = require('../misc/utils/clamav')
const nanoid = require('../misc/utils/nanoid')
const { syncDataset: syncRemoteService } = require('../remote-services/utils')
const { findDatasets, applyPatch, validateDraft, deleteDataset } = require('./service')
const { tableSchema, jsonSchema, getSchemaBreakingChanges, filterSchema } = require('./utils/schema')
const { dir, filePath, originalFilePath, attachmentsDir } = require('./utils/files')
const { preparePatch, validatePatch } = require('./utils/patch')
const { updateTotalStorage } = require('./utils/storage')
const { checkStorage, lockDataset, lockNewDataset, readDataset } = require('./middlewares')

const router = express.Router()

const clean = datasetUtils.clean

const debugLimits = require('debug')('limits')
const debugMasterData = require('debug')('master-data')

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
router.get('/:datasetId', readDataset(), applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.dataset.userPermissions = permissions.list('datasets', req.dataset, req.user, req.bypassPermissions)
  res.status(200).send(clean(req.publicBaseUrl, req.publicationSite, req.dataset, req.query))
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
  const breakingChanges = getSchemaBreakingChanges(req.dataset.schema, req.body.schema, true)
  debugBreakingChanges('breaking changes in schema ? ', breakingChanges)
  return breakingChanges.length > 0
}
const permissionsWriteDescriptionBreaking = permissions.middleware('writeDescriptionBreaking', 'write')

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

const initNew = async (db, req) => {
  const dataset = { ...req.body }
  dataset.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  dataset.createdAt = dataset.updatedAt = date
  dataset.createdBy = dataset.updatedBy = { id: req.user.id, name: req.user.name }
  dataset.permissions = []
  dataset.schema = dataset.schema || []
  if (dataset.extensions) {
    prepareExtensions(i18n.getLocale(req), dataset.extensions)
    dataset.schema = await extensions.prepareSchema(db, dataset.schema, dataset.extensions)
  }
  curateDataset(dataset)
  return dataset
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
    let i = 1; let dbIdExists = false; let dbUniqueRefExists = false; let fileExists = false; let acquiredLock = false
    do {
      if (i > 1) {
        dataset.slug = `${baseSlug}-${i}`
        dataset.title = baseTitle + ' ' + i
      }
      dbIdExists = await db.collection('datasets').countDocuments({ id: { $in: [dataset.id, dataset.slug] } })
      dbUniqueRefExists = await db.collection('datasets').countDocuments({
        _uniqueRefs: { $in: [dataset.slug, dataset.id] }, 'owner.type': dataset.owner.type, 'owner.id': dataset.owner.id
      })
      fileExists = await fs.exists(dir(dataset))
      if (!dbIdExists && !dbUniqueRefExists && !fileExists) {
        acquiredLock = await lockNewDataset(req, res, dataset)
      }
      i += 1
    } while (dbIdExists || dbUniqueRefExists || fileExists || !acquiredLock)

    if (draft) {
      dataset.status = 'draft'
      patch.draftReason = { key: 'file-new', message: 'Nouveau jeu de données chargé en mode brouillon' }
    }

    await fs.ensureDir(dir({ ...dataset, ...patch }))
    await fs.move(file.path, originalFilePath({ ...dataset, ...patch }))
  } else {
    if (draft) {
      patch.draftReason = { key: 'file-updated', message: 'Nouveau fichier chargé sur un jeu de données existant' }
    }
  }
  dataset.title = dataset.title || file.title

  // in draft mode this file replacement will occur later, when draft is validated
  if (!draft) {
    const oldoriginalFilePath = dataset.originalFile && originalFilePath({ ...dataset, ...patch, originalFile: dataset.originalFile })
    const neworiginalFilePath = originalFilePath({ ...dataset, ...patch })
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
      const newFilePath = filePath({ ...dataset, ...patch })
      const fileSample = await datasetFileSample({ ...dataset, ...patch })
      debugFiles(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${newFilePath}`)
      patch.file.encoding = chardet.detect(fileSample)
      debugFiles(`Detected encoding ${patch.file.encoding} for file ${newFilePath}`)
    }
  }

  if (draft && !file && !await fs.pathExists(filePath({ ...dataset, ...patch }))) {
    // this happens if we upload only the attachments, not the data file itself
    // in this case copy the one from prod
    await fs.copy(filePath(dataset), filePath({ ...dataset, ...patch }))
  }
  if (draft && !attachmentsFile && await fs.pathExists(attachmentsDir(dataset)) && !await fs.pathExists(attachmentsDir({ ...dataset, ...patch }))) {
    // this happens if we upload only the main data file and not the attachments
    // in this case copy the attachments directory from prod
    await fs.copy(attachmentsDir(dataset), attachmentsDir({ ...dataset, ...patch }))
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
  if (!req.user) return res.status(401).type('text/plain').send()
  const owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(owner, 'datasets', 'post', req.user, req.app.get('db'))) return res.status(403).type('text/plain').send(req.__('errors.missingPermission'))
  if ((await limits.remaining(req.app.get('db'), owner)).nbDatasets === 0) {
    debugLimits('exceedLimitNbDatasets/beforeUpload', { owner })
    return res.status(429).type('text/plain').send(req.__('errors.exceedLimitNbDatasets'))
  }
  next()
})
router.post('', beforeUpload, checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fsyncFiles, clamav.middleware, filesUtils.fixFormBody(validatePost), asyncWrap(async (req, res) => {
  req.files = req.files || []
  debugFiles('POST datasets uploaded some files', req.files)
  try {
    const db = req.app.get('db')

    validateURLFriendly(i18n.getLocale(req), req.body.id)
    validateURLFriendly(i18n.getLocale(req), req.body.slug)

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
      dataset.title = dataset.title || titleFromFileName(req.body.remoteFile.name || path.basename(new URL(req.body.remoteFile.url).pathname))
      permissions.initResourcePermissions(dataset, req.user)
      dataset.status = 'imported'
      await datasetUtils.insertWithId(db, dataset, res)
    } else {
      throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "éditable" ou "métadonnées"')
    }

    delete dataset._id

    if (dataset.extensions) debugMasterData(`POST dataset ${dataset.id} (${dataset.slug}) with extensions by ${req.user?.name} (${req.user?.id})`, dataset.extensions)
    if (dataset.masterData) debugMasterData(`POST dataset ${dataset.id} (${dataset.slug}) with masterData by ${req.user?.name} (${req.user?.id})`, dataset.masterData)

    await updateTotalStorage(req.app.get('db'), dataset.owner)
    await journals.log(req.app, dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id }, 'dataset')
    await syncRemoteService(req.app.get('db'), dataset)
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
  if (!req.user) return res.status(401).type('text/plain').send()

  const newDataset = await initNew(db, req)
  newDataset.id = req.params.datasetId
  if (!await db.collection('datasets').countDocuments({ id: newDataset.id })) {
    validateURLFriendly(i18n.getLocale(req), newDataset.id)
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
        if (err.keyValue) {
          if (err.keyValue.id) return next()
        } else {
          // on older mongo err.keyValue is not provided and we need to use the message
          if (err.message.includes('id_1')) return next()
        }
      }
    }
    req.isNewDataset = true
    if ((await limits.remaining(req.app.get('db'), newDataset.owner)).nbDatasets === 0) {
      debugLimits('exceedLimitNbDatasets/attemptInsert', { owner: newDataset.owner })
      return res.status(429, req.__('errors.exceedLimitNbDatasets'))
    }
    await updateTotalStorage(req.app.get('db'), newDataset.owner)
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
    if (req.body.extensions) prepareExtensions(i18n.getLocale(req), req.body.extensions, dataset.extensions)
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
      validateURLFriendly(i18n.getLocale(req), patch.slug)
      req.body.virtual = req.body.virtual || { children: [] }
      req.body.schema = await virtualDatasetsUtils.prepareSchema(db, { ...dataset, ...req.body })
      req.body.status = 'indexed'
    } else if (dataset.isRest) {
      const { isRest, updatedBy, updatedAt, ...patch } = req.body
      validatePatch(patch)
      validateURLFriendly(i18n.getLocale(req), patch.slug)
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
    curateDataset(req.body, dataset)

    if (req.body.extensions || dataset.extensions) debugMasterData(`PUT dataset ${dataset.id} (${dataset.slug}) with extensions by ${req.user?.name} (${req.user?.id})`, dataset.extensions, req.body.extensions)
    if (req.body.masterData || dataset.masterData) debugMasterData(`PUT dataset ${dataset.id} (${dataset.slug}) with masterData by ${req.user?.name} (${req.user?.id})`, dataset.masterData, req.body.masterData)

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
      syncRemoteService(req.app.get('db'), dataset)
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
router.post('/:datasetId', lockDataset(), attemptInsert, readDataset({ acceptedStatuses: ['finalized', 'error'] }), permissions.middleware('writeData', 'write'), checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fsyncFiles, clamav.middleware, filesUtils.fixFormBody(validatePost), updateDataset)
router.put('/:datasetId', lockDataset(), attemptInsert, readDataset({ acceptedStatuses: ['finalized', 'error'] }), permissions.middleware('writeData', 'write'), checkStorage(true, true), filesUtils.uploadFile(), filesUtils.fsyncFiles, clamav.middleware, filesUtils.fixFormBody(validatePost), updateDataset)

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
router.post('/:datasetId/lines', readWritableDataset, isRest, applicationKey, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, filesUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.createLine))
router.put('/:datasetId/lines/:lineId', readWritableDataset, isRest, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, filesUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.updateLine))
router.patch('/:datasetId/lines/:lineId', readWritableDataset, isRest, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, filesUtils.fsyncFiles, clamav.middleware, asyncWrap(restDatasetsUtils.patchLine))
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
router.post('/:datasetId/own/:owner/lines', readWritableDataset, isRest, applicationKey, permissions.middleware('createOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.createLine))
router.put('/:datasetId/own/:owner/lines/:lineId', readWritableDataset, isRest, applicationKey, permissions.middleware('updateOwnLine', 'manageOwnLines'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.updateLine))
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
  res.download(req.params['0'], null, { transformStream: res.throttle('static'), root: attachmentsDir(req.dataset) })
})

// Direct access to data files
router.get('/:datasetId/data-files', readDataset(), permissions.middleware('listDataFiles', 'read'), asyncWrap(async (req, res, next) => {
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
  res.download(req.params['0'], null, { transformStream: res.throttle('static'), root: datasetUtils.metadataAttachmentsDir(req.dataset) })
})
router.delete('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('deleteMetadataAttachment', 'write'), asyncWrap(async (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).type('text/plain').send('Unacceptable attachment path')
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

router.post('/:datasetId/user-notification', readDataset(), permissions.middleware('sendUserNotification', 'write'), asyncWrap(async (req, res, next) => {
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
}))

router.get('/:datasetId/thumbnail', readDataset(), permissions.middleware('readDescription', 'read'), asyncWrap(async (req, res, next) => {
  if (!req.dataset.image) return res.status(404).send("dataset doesn't have an image")
  await getThumbnail(req, res, req.dataset.image)
}))
router.get('/:datasetId/thumbnail/:thumbnailId', readDataset(), permissions.middleware('readLines', 'read'), asyncWrap(async (req, res, next) => {
  const url = Buffer.from(req.params.thumbnailId, 'hex').toString()
  if (req.dataset.attachmentsAsImage && url.startsWith('/attachments/')) {
    await getThumbnail(req, res, `${config.publicUrl}/api/v1/datasets/${req.dataset.id}${url}`, path.join(attachmentsDir(req.dataset), url.replace('/attachments/', '')), req.dataset.thumbnails)
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