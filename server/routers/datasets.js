const { Writable, Transform } = require('stream')
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
const mimeTypeStream = require('mime-type-stream')
const journals = require('../utils/journals')
const esUtils = require('../utils/es')
const filesUtils = require('../utils/files')
const datasetAPIDocs = require('../../contract/dataset-api-docs')
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
const datasetPatchSchema = require('../../contract/dataset-patch')
const validatePatch = ajv.compile(datasetPatchSchema)
const datasetPostSchema = require('../../contract/dataset-post')
const validatePost = ajv.compile(datasetPostSchema.properties.body)
const debugFiles = require('debug')('files')
const thumbor = require('../utils/thumbor')
const datasetFileSample = require('../utils/dataset-file-sample')

const baseTypes = new Set(['text/csv', 'application/geo+json'])

const router = express.Router()

function clean(dataset, thumbnail = '300x200') {
  dataset.public = permissions.isPublic('datasets', dataset)
  dataset.visibility = visibilityUtils.visibility(dataset)
  delete dataset.permissions
  dataset.description = dataset.description ? sanitizeHtml(dataset.description) : ''
  dataset.previews = datasetUtils.previews(dataset)
  findUtils.setResourceLinks(dataset, 'dataset')
  if (dataset.image && dataset.public) dataset.thumbnail = thumbor.thumbnail(dataset.image, thumbnail)
  return dataset
}

const checkStorage = (overwrite) => asyncWrap(async (req, res, next) => {
  if (process.env.NO_STORAGE_CHECK === 'true') return next()
  if (!req.get('Content-Length')) throw createError(411, 'Content-Length is mandatory')
  const contentLength = Number(req.get('Content-Length'))
  if (Number.isNaN(contentLength)) throw createError(400, 'Content-Length is not a number')
  const estimatedContentSize = contentLength - 210

  const owner = req.dataset ? req.dataset.owner : usersUtils.owner(req)
  const datasetLimit = config.defaultLimits.datasetStorage
  if (datasetLimit !== -1 && datasetLimit < estimatedContentSize) throw createError(413, 'Dataset size exceeds the authorized limit')
  let remainingStorage = await datasetUtils.remainingStorage(req.app.get('db'), owner)
  if (remainingStorage !== -1) {
    if (overwrite && req.dataset && req.dataset.storage) {
      // ignore the size of the dataset we are overwriting
      remainingStorage += req.dataset.storage.size
    }
    if ((remainingStorage - estimatedContentSize) <= 0) {
      try {
        await pump(
          req,
          new Writable({
            write(chunk, encoding, callback) {
            // do nothing wa just want to drain the request
              callback()
            },
          }),
        )
      } catch (err) {
        console.error('Failure to drain request that was rejected for exceeding storage limit', err)
      }
      throw createError(429, 'Vous avez atteint la limite de votre espace de stockage.')
    }
  }
  next()
})

// check if the endpoint is called from an application with an aunauthenticated readOnly application key
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
          'configuration.datasets.href': `${config.publicUrl}/api/v1/datasets/${req.dataset.id}`,
        }
        const matchingApplication = await req.app.get('db').collection('applications').count(filter)
        if (matchingApplication) req.bypassPermission = true
      }
    }
  }
  next()
})

// Get the list of datasets
router.get('', cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const datasets = req.app.get('db').collection('datasets')
  const filterFields = {
    concepts: 'schema.x-refersTo',
    'field-type': 'schema.type',
    'field-format': 'schema.format',
    children: 'virtual.children',
    services: 'extensions.remoteService',
    status: 'status',
    topics: 'topics.id',
    publicationSites: 'publicationSites',
  }
  const facetFields = {
    ...filterFields,
    topics: 'topics',
  }
  const query = findUtils.query(req, Object.assign({
    filename: 'originalFile.name',
    ids: 'id',
    id: 'id',
    rest: 'isRest',
  }, filterFields))
  if (req.query.bbox === 'true') {
    query.bbox = { $ne: null }
  }
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select)
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? datasets.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    datasets.countDocuments(query),
  ]
  if (req.query.facets) {
    mongoQueries.push(datasets.aggregate(findUtils.facetsQuery(req, facetFields, filterFields)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list('datasets', r, req.user)
    clean(r, req.query.thumbnail)
  })
  facets = findUtils.parseFacets(facets)
  res.json({ count, results, facets })
}))

// Shared middleware to read dataset in db
// also checks that the dataset is in a state compatible with some action
// supports waiting a little bit to be a little permissive with the user
const readDataset = (_acceptedStatuses, noDraft, preserveDraft) => asyncWrap(async(req, res, next) => {
  const acceptedStatuses = typeof _acceptedStatuses === 'function' ? _acceptedStatuses(req.body) : _acceptedStatuses
  for (let i = 0; i < 10; i++) {
    req.dataset = req.resource = await req.app.get('db').collection('datasets')
      .findOne({ id: req.params.datasetId }, { projection: { _id: 0 } })
    if (!req.dataset) return res.status(404).send('Dataset not found')
    if (noDraft && req.dataset.draft) {
      throw createError(409, 'Le jeu de données est en mode brouillon, vous devez confirmer ou annuler les changements avant de pouvoir le mettre à jour de nouveau.')
    }
    // in draft mode the draft is automatically merged and all following operations use dataset.draftReason to adapt
    if (preserveDraft) {
      req.dataset.prod = { ...req.dataset }
    }
    if ((preserveDraft || req.query.draft === 'true') && req.dataset.draft) {
      Object.assign(req.dataset, req.dataset.draft)
      if (!req.dataset.draft.finalizedAt) delete req.dataset.finalizedAt
    }
    if (!preserveDraft) {
      delete req.dataset.draft
    }

    req.resourceType = 'datasets'
    req.resourceApiDoc = datasetAPIDocs(req.dataset)

    if (
      req.dataset.status !== 'draft' &&
      (req.isNewDataset || !acceptedStatuses || acceptedStatuses.includes(req.dataset.status))
    ) return next()

    // dataset found but not in proper state.. wait a little while
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw createError(409, `Le jeu de données n'est pas dans un état permettant l'opération demandée. État courant : ${req.dataset.status}.`)
})

router.use('/:datasetId/permissions', readDataset(), permissions.router('datasets', 'dataset'))

// retrieve a dataset by its id
router.get('/:datasetId', readDataset(), applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.dataset.userPermissions = permissions.list('datasets', req.dataset, req.user)
  res.status(200).send(clean(req.dataset, req.query.thumbnail))
})

// retrieve only the schema.. Mostly useful for easy select fields
router.get('/:datasetId/schema', readDataset(), applicationKey, permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  let schema = req.dataset.schema
  if (req.query.mimeType === 'application/tableschema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-tableschema.json"`)
    schema = {
      fields: schema.filter(f => !f['x-calculated'])
      .filter(f => !f['x-extension'])
      .map(f => {
        const field = { name: f.key, title: f.title || f['x-originalName'], type: f.type }
        if (f.description) field.description = f.description
        // if (f.format) field.format = f.format // commented besause uri-reference format is not in tableschema
        if (f['x-refersTo']) field.rdfType = f['x-refersTo']
        return field
      }),
    }
  } else if (req.query.mimeType === 'application/schema+json') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}-schema.json"`)
    schema = {
      type: 'object',
      properties: schema
        .filter(f => !f['x-calculated'])
        .filter(f => !f['x-extension'])
        // .map(f => ({ ...f, maxLength: 10000 }))
        .reduce((a, f) => { a[f.key] = { ...f, enum: undefined, key: undefined, ignoreDetection: undefined }; return a }, {}),
      }
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
  }
  res.status(200).send(schema)
})

// Update a dataset's metadata
router.patch('/:datasetId', readDataset((patch) => {
  // accept different statuses of the dataset depending on the content of the patch
  if (patch.schema || patch.virtual || patch.extensions || patch.publications || patch.projection) {
    return ['finalized', 'error']
  } else {
    return null
  }
}), permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
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
  if (Object.keys(patch).length === 0) return res.status(200).send(clean(req.dataset))

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }
  if (patch.extensions) patch.schema = await extensions.prepareSchema(db, patch.schema || req.dataset.schema, patch.extensions)

  // Re-publish publications
  if (!patch.publications && req.dataset.publications && req.dataset.publications.length) {
    req.dataset.publications.filter(p => p.status !== 'deleted').forEach(p => { p.status = 'waiting' })
    patch.publications = req.dataset.publications
  }

  if (req.dataset.isVirtual) {
    if (patch.schema || patch.virtual) {
      patch.schema = await virtualDatasetsUtils.prepareSchema(db, { ...req.dataset, ...patch })
      patch.status = 'indexed'
    }
  } else if (patch.extensions) {
    // extensions have changed, trigger full re-indexing
    patch.status = 'analyzed'
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
  } else if (patch.schema) {
    try {
      // this method will routinely throw errors
      // we just try in case elasticsearch considers the new mapping compatible
      // so that we might optimize and reindex only when necessary
      await esUtils.updateDatasetMapping(req.app.get('es'), { id: req.dataset.id, schema: patch.schema })
      patch.status = 'extended'
    } catch (err) {
      // generated ES mappings are not compatible, trigger full re-indexing
      patch.status = 'analyzed'
    }
  } else if (patch.thumbnails || patch.masterData) {
    // just change finalizedAt so that cache is invalidated, but the worker doesn't relly need to work on the dataset
    patch.finalizedAt = (new Date()).toISOString()
  }

  await datasetUtils.applyPatch(db, req.dataset, patch)

  res.status(200).json(clean(req.dataset))
}))

// Change ownership of a dataset
router.put('/:datasetId/owner', readDataset(), permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
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
    updatedAt: moment().toISOString(),
  }
  const patchedDataset = (await req.app.get('db').collection('datasets')
    .findOneAndUpdate({ id: req.params.datasetId }, { $set: patch }, { returnOriginal: false })).value

  // Move all files
  try {
    await fs.move(datasetUtils.dir(req.dataset), datasetUtils.dir(patchedDataset))
  } catch (err) {
    console.error('Error while moving dataset directory', err)
  }
  res.status(200).json(clean(patchedDataset))
}))

// Delete a dataset
router.delete('/:datasetId', readDataset(), permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  await datasetUtils.delete(req.app.get('db'), req.app.get('es'), req.dataset)
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
    dataset.schema = await extensions.prepareSchema(db, dataset.schema, dataset.extensions)
  }
  return dataset
}

const setFileInfo = async (db, file, attachmentsFile, dataset, draft) => {
  const patch = {}
  patch.originalFile = {
    name: file.originalname,
    size: file.size,
    mimetype: file.mimetype,
  }

  if (!dataset.id) {
    const baseTitle = dataset.title || path.parse(file.originalname).name.replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, ' ').split(/\s+/).join(' ')
    const baseId = slug(baseTitle, { lower: true })
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

  if (!baseTypes.has(file.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    patch.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    patch.status = 'loaded'
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
const beforeUpload = asyncWrap(async(req, res, next) => {
  if (!req.user) return res.status(401).send()
  if (!permissions.canDoForOwner(usersUtils.owner(req), 'datasets', 'post', req.user, req.app.get('db'))) return res.sendStatus(403)
  next()
})
router.post('', beforeUpload, checkStorage(true), filesUtils.uploadFile(), filesUtils.fixFormBody(validatePost), asyncWrap(async(req, res) => {
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
      const datasetPromise = setFileInfo(db, datasetFile, attachmentsFile, await initNew(db, req), req.query.draft === 'true')
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
      await datasetUtils.insertWithBaseId(db, dataset, baseId)
    } else if (req.body.isRest) {
      if (!req.body.title) throw createError(400, 'Un jeu de données REST doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données REST ne peut pas être créé avec des pièces jointes')
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
      await datasetUtils.insertWithBaseId(db, dataset, baseId)
      await restDatasetsUtils.initDataset(db, dataset)
      await db.collection('datasets').updateOne({ id: dataset.id }, { $set: { status: 'analyzed' } })
    } else {
      throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "REST"')
    }

    delete dataset._id

    await journals.log(req.app, dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id }, 'dataset')
    res.status(201).send(clean(dataset))
  } catch (err) {
    // Wrapped the whole thing in a try/catch to remove files in case of failure
    for (const file of req.files) {
      await fs.remove(file.path)
    }
    throw err
  }
}, { keepalive: true }))

// PUT or POST with an id to create or update an existing dataset data
const attemptInsert = asyncWrap(async(req, res, next) => {
  const db = req.app.get('db')
  if (!req.user) return res.status(401).send()

  const newDataset = await initNew(db, req)
  newDataset.id = req.params.datasetId

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newDataset.owner, 'datasets', 'post', req.user, db)) {
    try {
      await req.app.get('db').collection('datasets').insertOne(newDataset, true)
      req.isNewDataset = true
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
const updateDataset = asyncWrap(async(req, res) => {
  req.files = req.files || []
  debugFiles('PUT datasets uploaded some files', req.files)
  try {
    const db = req.app.get('db')
    // After uploadFile, req.files contains the metadata of an uploaded file, and req.body the content of additional text fields
    const datasetFile = req.files.find(f => f.fieldname === 'file' || f.fieldname === 'dataset')
    const attachmentsFile = req.files.find(f => f.fieldname === 'attachments')
    if (!datasetFile && !req.dataset.isVirtual && !req.dataset.isRest) throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel"')
    if (datasetFile && (req.dataset.isVirtual || req.dataset.isRest)) throw createError(400, 'Un jeu de données est soit initialisé avec un fichier soit déclaré "virtuel"')
    if (req.dataset.isVirtual && !req.dataset.title) throw createError(400, 'Un jeu de données virtuel doit être créé avec un titre')
    if (req.dataset.isRest && !req.dataset.title) throw createError(400, 'Un jeu de données REST doit être créé avec un titre')
    if (req.dataset.isVirtual && attachmentsFile) throw createError(400, 'Un jeu de données virtuel ne peut pas avoir des pièces jointes')
    if (req.dataset.isRest && attachmentsFile) throw createError(400, 'Un jeu de données REST ne peut pas être créé avec des pièces jointes')

    let dataset = req.dataset
    req.body.schema = req.body.schema || dataset.schema || []
    if (req.body.extensions) {
      req.body.schema = await extensions.prepareSchema(db, req.body.schema, req.body.extensions)
    }

    if (datasetFile) {
      // send header at this point, then asyncWrap keepalive option will keep request alive while we process files
      // TODO: do this in a worker instead ?
      res.writeHeader(req.isNewDataset ? 201 : 200, { 'Content-Type': 'application/json' })
      res.write(' ')

      dataset = await setFileInfo(db, datasetFile, attachmentsFile, { ...dataset, ...req.body }, req.query.draft === 'true')
      if (req.query.skipAnalysis === 'true') req.body.status = 'analyzed'
    } else if (dataset.isVirtual) {
      const { isVirtual, ...patch } = req.body
      if (!validatePatch(patch)) {
        throw createError(400, validatePatch.errors)
      }
      req.body.virtual = req.body.virtual || { children: [] }
      req.body.schema = await virtualDatasetsUtils.prepareSchema(db, { ...dataset, ...req.body })
      req.body.status = 'indexed'
    } else if (dataset.isRest) {
      const { isRest, ...patch } = req.body
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
    Object.assign(dataset, req.body)

    dataset.updatedBy = { id: req.user.id, name: req.user.name }
    dataset.updatedAt = moment().toISOString()
    await db.collection('datasets').replaceOne({ id: req.params.datasetId }, dataset)
    if (req.isNewDataset) await journals.log(req.app, dataset, { type: 'dataset-created' }, 'dataset')
    else if (!dataset.isRest && !dataset.isVirtual) await journals.log(req.app, dataset, { type: 'data-updated' }, 'dataset')
    await datasetUtils.updateStorage(db, req.dataset)
    res.status(req.isNewDataset ? 201 : 200).send(clean(dataset))
  } catch (err) {
    // Wrapped the whole thing in a try/catch to remove files in case of failure
    for (const file of req.files) {
      await fs.remove(file.path)
    }
    throw err
  }
}, { keepalive: true })
router.post('/:datasetId', attemptInsert, readDataset(['finalized', 'error'], true), permissions.middleware('writeData', 'write'), checkStorage(true), filesUtils.uploadFile(), filesUtils.fixFormBody(validatePost), updateDataset)
router.put('/:datasetId', attemptInsert, readDataset(['finalized', 'error'], true), permissions.middleware('writeData', 'write'), checkStorage(true), filesUtils.uploadFile(), filesUtils.fixFormBody(validatePost), updateDataset)

// validate the draft
router.post('/:datasetId/draft', readDataset(['finalized'], false, true), permissions.middleware('writeData', 'write'), asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (!req.dataset.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  const patch = {
    ...req.dataset.draft,
    updatedAt: moment().toISOString(),
    updatedBy: { id: req.user.id, name: req.user.name },
  }
  if (!baseTypes.has(req.dataset.originalFile.mimetype)) patch.status = 'uploaded'
  else patch.status = 'analyzed'
  delete patch.finalizedAt
  delete patch.draftReason
  delete patch.count
  delete patch.bbox
  delete patch.storage
  const patchedDataset = (await db.collection('datasets').findOneAndUpdate({ id: req.params.datasetId },
    { $set: patch, $unset: { draft: '' } },
    { returnOriginal: false },
  )).value
  if (req.dataset.prod.originalFile) await fs.remove(datasetUtils.originalFileName(req.dataset.prod))
  if (req.dataset.prod.file) await fs.remove(datasetUtils.fileName(req.dataset.prod))
  if (req.dataset.prod.file) await fs.remove(datasetUtils.fullFileName(req.dataset.prod))
  await fs.ensureDir(datasetUtils.dir(patchedDataset))
  await fs.move(datasetUtils.originalFileName(req.dataset), datasetUtils.originalFileName(patchedDataset))
  if (await fs.pathExists(datasetUtils.attachmentsDir(req.dataset))) {
    await fs.remove(datasetUtils.attachmentsDir(patchedDataset))
    await fs.move(datasetUtils.attachmentsDir(req.dataset), datasetUtils.attachmentsDir(patchedDataset))
  }
  await journals.log(req.app, patchedDataset, { type: 'draft-validated' }, 'dataset')
  await esUtils.delete(req.app.get('es'), req.dataset)
  await datasetUtils.updateStorage(db, patchedDataset)
  return res.send(patchedDataset)
}))

// cancel the draft
router.delete('/:datasetId/draft', readDataset(['finalized', 'error'], false, true), permissions.middleware('writeData', 'write'), asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (!req.dataset.draft) {
    return res.status(409).send('Le jeu de données n\'est pas en état brouillon')
  }
  await journals.log(req.app, req.dataset, { type: 'draft-cancelled' }, 'dataset')
  const patchedDataset = (await db.collection('datasets')
    .findOneAndUpdate({ id: req.params.datasetId }, { $unset: { draft: '' } }, { returnOriginal: false })).value
  await fs.remove(datasetUtils.dir(req.dataset))
  await esUtils.delete(req.app.get('es'), req.dataset)
  await datasetUtils.updateStorage(db, patchedDataset)
  return res.send(patchedDataset)
}))

// CRUD operations for REST datasets
function isRest(req, res, next) {
  if (!req.dataset.isRest) {
    return res.status(501)
      .send('Les opérations de modifications sur les lignes sont uniquement accessibles pour les jeux de données de type REST.')
  }
  next()
}
router.get('/:datasetId/lines/:lineId', readDataset(), isRest, permissions.middleware('readLine', 'read'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readLine))
router.post('/:datasetId/lines', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('createLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.createLine))
router.put('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('updateLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.updateLine))
router.patch('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('patchLine', 'write'), checkStorage(false), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.patchLine))
router.post('/:datasetId/_bulk_lines', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('bulkLines', 'write'), checkStorage(false), restDatasetsUtils.uploadBulk, asyncWrap(restDatasetsUtils.bulkLines))
router.delete('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('deleteLine', 'write'), asyncWrap(restDatasetsUtils.deleteLine))
router.get('/:datasetId/lines/:lineId/revisions', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('readLineRevisions', 'read'), asyncWrap(restDatasetsUtils.readLineRevisions))
router.delete('/:datasetId/lines', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('deleteLine', 'write'), asyncWrap(restDatasetsUtils.deleteAllLines))

// Specifc routes for datasets with masterData functionalities enabled
router.post('/:datasetId/master-data/bulk-searchs/:bulkSearchId', readDataset(), permissions.middleware('readLines', 'read'), asyncWrap(async(req, res) => {
  const bulkSearch = req.dataset.masterData && req.dataset.masterData.bulkSearchs && req.dataset.masterData.bulkSearchs.find(bs => bs.id === req.params.bulkSearchId)
  if (!bulkSearch) return res.status(404).send(`Recherche en masse "${req.params.bulkSearchId}" inconnue`)

  // this function will be called for each input line of the bulk search stream
  const paramsBuilder = (line) => {
    const params = {}
    const qs = []
    bulkSearch.input.forEach(input => {
      if ([null, undefined].includes(line[input.property.key])) {
        throw createError(400, `la propriété en entrée ${input.property.key} est obligatoire`)
      }
      if (input.type === 'equals') {
        qs.push(`${input.property.key}:"${line[input.property.key]}"`)
      } else if (input.type === 'date-in-interval') {
        const startDate = req.dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/startDate')
        const endDate = req.dataset.schema.find(p => p['x-refersTo'] === 'https://schema.org/endDate')
        if (!startDate || !endDate) throw new Error('cet enrichissement sur interval de date requiert les concepts "date de début" et "date de fin"')
        const date = line[input.property.key].replace(/:/g, '\\:')
        qs.push(`${endDate.key}:[${date} TO *]`)
        qs.push(`${startDate.key}:[* TO ${date}]`)
      } else if (input.type === 'geo-distance') {
        const [lat, lon] = line[input.property.key].split(',')
        params.geo_distance = `${lon},${lat},${input.distance}`
      } else {
        throw createError(400, `input type ${input.type} is not supported`)
      }
    })
    if (qs.length) params.qs = qs.map(f => `(${f})`).join(' AND ')

    return params
  }

  const ioStream = mimeTypeStream(req.get('Content-Type')) || mimeTypeStream('application/json')

  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)

  let i = 0
  await pump(
    req,
    ioStream.parser(),
    new Transform({
      async transform(line, encoding, callback) {
        // console.log(line, qsBuilder(line))
        const current = i
        i += 1
        try {
          let esResponse
          try {
            esResponse = await esUtils.search(req.app.get('es'), req.dataset, {
              select: req.query.select,
              sort: bulkSearch.sort,
              ...paramsBuilder(line),
              size: 1,
            })
          } catch (err) {
            await manageESError(req, err)
          }
          if (esResponse.hits.hits.length === 0) {
            throw new Error('La donnée de référence ne contient pas de ligne correspondante.')
          }
          const responseLine = esResponse.hits.hits[0]._source
          Object.keys(responseLine).forEach(k => {
            if (k.startsWith('_')) delete responseLine[k]
          })
          callback(null, { ...responseLine, _key: line._key || current })
        } catch (err) {
          callback(null, { _key: line._key || current, _error: err.message })
        }
      },
      objectMode: true,
    }),
    ioStream.serializer(),
    res,
  )
}))

// Error from ES backend should be stored in the journal
async function manageESError(req, err) {
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
router.get('/:datasetId/lines', readDataset(), applicationKey, permissions.middleware('readLines', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
  if (req.query && req.query.page && req.query.size && req.query.page * req.query.size > 10000) {
    return res.status(404).send('You can only access the first 10 000 elements.')
  }

  const db = req.app.get('db')

  // used later to count items in a tile or tile's neighbor
  async function countWithCache(query) {
    const { hash, value } = await cache.get(db, {
      type: 'tile-count',
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query,
    })
    if (!config.cache.disabled && value !== null) return value
    const newValue = await esUtils.count(req.app.get('es'), req.dataset, query)
    cache.set(db, hash, newValue)
    return newValue
  }

  // if the output format is geo make sure geoshape is present
  // also manage a default content for geo tiles that is the same as the one used to build mbtiles when possible
  const emptySelect = !req.query.select
  if (['geojson', 'mvt', 'vt', 'pbf'].includes(req.query.format)) {
    req.query.select = (req.query.select ? req.query.select : tiles.defaultSelect(req.dataset).join(','))
    if (!req.query.select.includes('_geoshape')) req.query.select += ',_geoshape'
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
      query: req.query,
    })
    if (value) {
      res.type('application/x-protobuf')
      res.setHeader('x-tilesmode', 'cache')
      res.throttleEnd('static')
      return res.status(200).send(value.buffer)
    }
    cacheHash = hash
  }

  // if vector tile is requested and we dispose of a prerendered mbtiles file, use it
  // otherwise (older dataset, or rest/virtual datasets) we use tile generation from ES results
  if (!req.dataset.isVirtual && !req.dataset.isRest) {
    const mbtilesPath = datasetUtils.extFileName(req.dataset, 'mbtiles')
    if (vectorTileRequested && !req.query.q && !req.query.qs && await fs.exists(mbtilesPath)) {
      const tile = await tiles.getTile(req.dataset, mbtilesPath, !emptySelect && req.query.select.split(','), ...xyz)
      if (tile) {
        res.type('application/x-protobuf')
        res.setHeader('x-tilesmode', 'mbtiles')
        res.throttleEnd('static')
        if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
        return res.status(200).send(tile)
      } else if (tile === null) {
        res.setHeader('x-tilesmode', 'mbtiles')
        // 204 = no-content, better than 404
        return res.status(204).send()
      }
    }
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
            countWithCache({ ...req.query, xyz: [xyz[0] + 1, xyz[1] + 1, xyz[2]].join(',') }),
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
    esResponse = await esUtils.search(req.app.get('es'), req.dataset, req.query)
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

  const result = {
    total: esResponse.hits.total.value,
    results: esResponse.hits.hits.map(hit => {
      return esUtils.prepareResultItem(hit, req.dataset, req.query)
    }),
  }

  if (req.query.format === 'csv') {
    res.setHeader('content-disposition', `attachment; filename="${req.dataset.id}.csv"`)
    // add BOM for excel, cf https://stackoverflow.com/a/17879474
    res.write('\ufeff')
    const csvStreams = outputs.result2csv(req.dataset, req.query, result)
    const streamPromise = pump(
      ...csvStreams,
      res.throttle('dynamic'),
      res,
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
router.get('/:datasetId/geo_agg', readDataset(), applicationKey, permissions.middleware('getGeoAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
      query: req.query,
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
router.get('/:datasetId/values_agg', readDataset(), applicationKey, permissions.middleware('getValuesAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
      query: req.query,
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
router.get('/:datasetId/values/:fieldKey', readDataset(), applicationKey, permissions.middleware('getValues', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/metric_agg', readDataset(), applicationKey, permissions.middleware('getMetricAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/words_agg', readDataset(), applicationKey, permissions.middleware('getWordsAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/max/:fieldKey', readDataset(), applicationKey, permissions.middleware('getWordsAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/min/:fieldKey', readDataset(), applicationKey, permissions.middleware('getWordsAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/attachments/*', readDataset(), applicationKey, permissions.middleware('downloadOriginalData', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
  // the transform stream option was patched into "send" module using patch-package
  res.download(path.resolve(datasetUtils.attachmentsDir(req.dataset), filePath), null, { transformStream: res.throttle('static') })
})

// Direct access to data files
router.get('/:datasetId/data-files', readDataset(), permissions.middleware('downloadFullData', 'read'), asyncWrap(async(req, res, next) => {
  res.send(await datasetUtils.dataFiles(req.dataset))
}))
router.get('/:datasetId/data-files/*', readDataset(), permissions.middleware('downloadFullData', 'read'), cacheHeaders.noCache, asyncWrap(async(req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable data file path')
  // the transform stream option was patched into "send" module using patch-package
  res.download(path.resolve(datasetUtils.dir(req.dataset), filePath), null, { transformStream: res.throttle('static') })
}))

// Special attachments referenced in dataset metadatas
router.post('/:datasetId/metadata-attachments', readDataset(), permissions.middleware('writeData', 'write'), checkStorage(false), attachments.metadataUpload(), asyncWrap(async(req, res, next) => {
  req.body.size = (await fs.promises.stat(req.file.path)).size
  req.body.updatedAt = moment().toISOString()
  await datasetUtils.updateStorage(req.app.get('db'), req.dataset)
  res.status(200).send(req.body)
}))
router.get('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('downloadOriginalData', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
  // the transform stream option was patched into "send" module using patch-package
  res.download(path.resolve(datasetUtils.metadataAttachmentsDir(req.dataset), filePath), null, { transformStream: res.throttle('static') })
})
router.delete('/:datasetId/metadata-attachments/*', readDataset(), permissions.middleware('writeData', 'write'), asyncWrap(async(req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send('Unacceptable attachment path')
  await fs.remove(path.join(datasetUtils.metadataAttachmentsDir(req.dataset), filePath))
  await datasetUtils.updateStorage(req.app.get('db'), req.dataset)
  res.status(204).send()
}))

// Download the full dataset in its original form
router.get('/:datasetId/raw', readDataset(), permissions.middleware('downloadOriginalData', 'read'), cacheHeaders.noCache, (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  res.download(datasetUtils.originalFileName(req.dataset), null, { transformStream: res.throttle('static') })
  webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded' })
})

// Download the dataset in various formats
router.get('/:datasetId/convert', readDataset(), permissions.middleware('downloadOriginalData', 'read'), cacheHeaders.noCache, (req, res, next) => {
  if (!req.query || !req.query.format) {
    // the transform stream option was patched into "send" module using patch-package
    res.download(datasetUtils.fileName(req.dataset), null, { transformStream: res.throttle('static') })
    webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded' })
  } else {
    res.status(400).send(`Format ${req.query.format} is not supported.`)
  }
})

// Download the full dataset with extensions
// TODO use ES scroll functionality instead of file read + extensions
router.get('/:datasetId/full', readDataset(), permissions.middleware('downloadFullData', 'read'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  // the transform stream option was patched into "send" module using patch-package
  if (await fs.exists(datasetUtils.fullFileName(req.dataset))) {
    res.download(datasetUtils.fullFileName(req.dataset), null, { transformStream: res.throttle('static') })
  } else {
    res.download(datasetUtils.fileName(req.dataset), null, { transformStream: res.throttle('static') })
  }
  webhooks.trigger(req.app.get('db'), 'dataset', req.dataset, { type: 'downloaded' })
}))

router.get('/:datasetId/api-docs.json', readDataset(), permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased, (req, res) => {
  res.send(req.resourceApiDoc)
})

router.get('/:datasetId/journal', readDataset(), permissions.middleware('readJournal', 'read'), cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'dataset',
    id: req.params.datasetId,
  })
  if (!journal) return res.send([])
  delete journal.owner
  journal.events.reverse()
  res.json(journal.events)
}))

// Special route with very technical informations to help diagnose bugs, broken indices, etc.
router.get('/:datasetId/_diagnose', readDataset(), cacheHeaders.noCache, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  const esInfos = await esUtils.datasetInfos(req.app.get('es'), req.dataset)
  const filesInfos = await datasetUtils.lsFiles(req.dataset)
  res.json({ filesInfos, esInfos })
}))

// Special admin route to force reindexing a dataset
router.post('/:datasetId/_reindex', readDataset(), asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  const patchedDataset = await datasetUtils.reindex(req.app.get('db'), req.dataset)
  res.status(200).send(patchedDataset)
}))

// Special admin route to force refinalizing a dataset
router.post('/:datasetId/_refinalize', readDataset(), asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  const patchedDataset = await datasetUtils.refinalize(req.app.get('db'), req.dataset)
  res.status(200).send(patchedDataset)
}))

module.exports = router
