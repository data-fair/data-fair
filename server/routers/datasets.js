const { Transform } = require('stream')
const express = require('express')
const ajv = require('ajv')()
const util = require('util')
const path = require('path')
const fs = require('fs-extra')
const moment = require('moment')
const createError = require('http-errors')
const pump = util.promisify(require('pump'))
const csvStringify = require('csv-stringify')
const flatten = require('flat')
const mongodb = require('mongodb')
const config = require('config')
const chardet = require('chardet')
const slug = require('slugify')
const sanitizeHtml = require('sanitize-html')
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
const datasetPatchSchema = require('../../contract/dataset-patch')
const validatePatch = ajv.compile(datasetPatchSchema)
const debugFiles = require('debug')('files')
let router = express.Router()

const datasetFileSample = require('../utils/dataset-file-sample')
const baseTypes = new Set(['text/csv', 'application/geo+json'])

const operationsClasses = {
  list: ['list'],
  read: ['readDescription', 'readLines', 'getGeoAgg', 'getValuesAgg', 'getValues', 'getMetricAgg', 'getWordsAgg', 'downloadOriginalData', 'downloadFullData', 'readJournal', 'readApiDoc'],
  write: ['writeDescription', 'writeData'],
  admin: ['delete', 'getPermissions', 'setPermissions']
}

function clean(dataset) {
  dataset.public = permissions.isPublic(dataset, operationsClasses)
  dataset.visibility = visibilityUtils.visibility(dataset)
  delete dataset.permissions
  dataset.description = dataset.description ? sanitizeHtml(dataset.description) : ''
  findUtils.setResourceLinks(dataset, 'dataset')
  return dataset
}

// Get the list of datasets
router.get('', cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const datasets = req.app.get('db').collection('datasets')
  const filterFields = {
    'concepts': 'schema.x-refersTo',
    'field-type': 'schema.type',
    'field-format': 'schema.format',
    'children': 'virtual.children',
    'services': 'extensions.remoteService',
    'status': 'status'
  }
  const query = findUtils.query(req, Object.assign({
    'filename': 'originalFile.name',
    'ids': 'id',
    'id': 'id'
  }, filterFields))
  if (req.query.bbox === 'true') {
    query.bbox = { $ne: null }
  }
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select)
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? datasets.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    datasets.countDocuments(query)
  ]
  if (req.query.facets) {
    mongoQueries.push(datasets.aggregate(findUtils.facetsQuery(req, filterFields)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list(r, operationsClasses, req.user)
    clean(r)
  })
  facets = findUtils.parseFacets(facets)
  res.json({ count, results, facets })
}))

// Shared middleware to read dataset in db
// also checks that the dataset is in a state compatible with some action
// supports waiting a little bit to be a little permissive with the user
const readDataset = (acceptedStatuses) => asyncWrap(async(req, res, next) => {
  for (let i = 0; i < 10; i++) {
    req.dataset = req.resource = await req.app.get('db').collection('datasets')
      .findOne({ id: req.params.datasetId }, { projection: { _id: 0 } })
    if (!req.dataset) return res.status(404).send('Dataset not found')
    req.resourceApiDoc = datasetAPIDocs(req.dataset)

    if (req.isNewDataset || !acceptedStatuses || acceptedStatuses.includes(req.dataset.status)) return next()

    // dataset found but not in proper state.. wait a little while
    await new Promise(resolve => setTimeout(resolve, 400))
  }
  throw createError(409, `Le jeu de données n'est pas dans un état permettant l'opération demandée'. État courant : ${req.dataset.status}.`)
})

router.use('/:datasetId/permissions', readDataset(), permissions.router('datasets', 'dataset'))

// retrieve a dataset by its id
router.get('/:datasetId', readDataset(), permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  req.dataset.userPermissions = permissions.list(req.dataset, operationsClasses, req.user)
  res.status(200).send(clean(req.dataset))
})

// retrieve only the schema.. Mostly useful for easy select fields
router.get('/:datasetId/schema', readDataset(), permissions.middleware('readDescription', 'read'), cacheHeaders.noCache, (req, res, next) => {
  let schema = req.dataset.schema
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
  res.status(200).send(schema)
})

// Update a dataset's metadata
router.patch('/:datasetId', readDataset(['finalized', 'error']), permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  const patch = req.body
  if (!validatePatch(patch)) return res.status(400).send(validatePatch.errors)

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }
  if (patch.extensions) patch.schema = await extensions.prepareSchema(db, patch.schema || req.dataset.schema, patch.extensions)

  // Changed a previously failed dataset, retry everything.
  // Except download.. We only try it again if the fetch failed.
  if (req.dataset.status === 'error') {
    if (req.dataset.isVirtual) patch.status = 'indexed'
    else if (req.dataset.isRest) patch.status = 'schematized'
    else if (req.dataset.remoteFile && !req.dataset.originalFile) patch.status = 'imported'
    else if (!baseTypes.has(req.dataset.originalFile.mimetype)) patch.status = 'uploaded'
    else patch.status = 'loaded'
  }

  // Retry failed publications
  if (!patch.publications) {
    const failedPublications = (req.dataset.publications || []).filter(p => p.status === 'error')
    if (failedPublications.length) {
      failedPublications.forEach(p => { p.status = 'waiting' })
      patch.publications = req.dataset.publications
    }
  }

  if (req.dataset.isVirtual) {
    if (patch.schema || patch.virtual) {
      patch.schema = await virtualDatasetsUtils.prepareSchema(db, { ...req.dataset, ...patch })
      patch.status = 'indexed'
    }
  } else if (patch.projection && (!req.dataset.projection || patch.projection.code !== req.dataset.projection.code)) {
    patch.status = 'schematized'
  } else if (patch.schema) {
    try {
      await esUtils.updateDatasetMapping(req.app.get('es'), { id: req.dataset.id, schema: patch.schema })
      if (patch.extensions) {
        // Back to indexed state if schema did not change in significant manner, but extensions did
        patch.status = 'indexed'
      } else {
        // Extended otherwise, to re-calculate geometries and stuff
        patch.status = 'extended'
      }
    } catch (err) {
      console.log(`Updating the mapping for dataset ${req.dataset.id} failed. We have to trigger full re-indexation.`, err)
      patch.status = 'schematized'
    }
  }

  const patchedDataset = (await req.app.get('db').collection('datasets')
    .findOneAndUpdate({ id: req.params.datasetId }, { '$set': patch }, { returnOriginal: false })).value
  res.status(200).json(clean(patchedDataset))
}))

// Change ownership of a dataset
router.put('/:datasetId/owner', readDataset(), permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  // Must be able to delete the current dataset, and to create a new one for the new owner to proceed
  if (!permissions.canDoForOwner(req.body, 'postDataset', req.user, req.app.get('db'))) return res.sendStatus(403)
  const patchedDataset = (await req.app.get('db').collection('datasets')
    .findOneAndUpdate({ id: req.params.datasetId }, { '$set': { owner: req.body } }, { returnOriginal: false })).value

  // Move all files
  try {
    const originalFileName = datasetUtils.originalFileName(req.dataset)
    if (await fs.exists(originalFileName)) await fs.move(originalFileName, datasetUtils.originalFileName(patchedDataset))
  } catch (err) {
    console.error('Error while moving original file', err)
  }
  try {
    const fileName = datasetUtils.fileName(req.dataset)
    if (await fs.exists()) await fs.move(fileName, datasetUtils.fileName(patchedDataset))
  } catch (err) {
    console.error('Error while moving converted file', err)
  }
  try {
    const attachmentsDir = datasetUtils.attachmentsDir(req.dataset)
    if (await fs.exists(attachmentsDir)) await fs.move(attachmentsDir, datasetUtils.attachmentsDir(patchedDataset))
  } catch (err) {
    console.error('Error while moving decompressed files', err)
  }

  res.status(200).json(clean(patchedDataset))
}))

// Delete a dataset
router.delete('/:datasetId', readDataset(), permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  try {
    await fs.remove(datasetUtils.originalFileName(req.dataset))
  } catch (err) {
    console.error('Error while deleting original file', err)
  }
  try {
    await fs.remove(datasetUtils.fileName(req.dataset))
  } catch (err) {
    console.error('Error while deleting converted file', err)
  }
  try {
    await fs.remove(datasetUtils.attachmentsDir(req.dataset))
  } catch (err) {
    console.error('Error while deleting decompressed files', err)
  }

  if (req.dataset.isRest) {
    try {
      await restDatasetsUtils.deleteDataset(db, req.dataset)
    } catch (err) {
      console.error('Error while removing mongodb collection for REST dataset', err)
    }
  }

  await db.collection('datasets').deleteOne({ id: req.params.datasetId })
  await db.collection('journals').deleteOne({ type: 'dataset', id: req.params.datasetId })
  if (!req.dataset.isVirtual) {
    try {
      await esUtils.delete(req.app.get('es'), req.dataset)
    } catch (err) {
      console.error('Error while deleting dataset indexes and alias', err)
    }
    await datasetUtils.updateStorageSize(db, req.dataset.owner)
  }

  res.sendStatus(204)
}))

const initNew = (req) => {
  const dataset = { ...req.body }
  dataset.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  dataset.createdAt = dataset.updatedAt = date
  dataset.createdBy = dataset.updatedBy = { id: req.user.id, name: req.user.name }
  dataset.permissions = []
  dataset.schema = dataset.schema || []
  return dataset
}

const setFileInfo = async (file, attachmentsFile, dataset) => {
  dataset.id = file.id
  dataset.title = dataset.title || file.title
  dataset.originalFile = {
    name: file.originalname,
    size: file.size,
    mimetype: file.mimetype
  }
  if (!baseTypes.has(file.mimetype)) {
    // we first need to convert the file in a textual format easy to index
    dataset.status = 'uploaded'
  } else {
    // The format of the original file is already well suited to workers
    dataset.status = 'loaded'
    dataset.file = dataset.originalFile
    const fileName = datasetUtils.fileName(dataset)
    // Try to prevent weird bug with NFS by forcing syncing file before sampling
    const fd = await fs.open(fileName, 'r')
    await fs.fsync(fd)
    await fs.close(fd)
    const fileSample = await datasetFileSample(dataset)
    debugFiles(`Attempt to detect encoding from ${fileSample.length} first bytes of file ${fileName}`)
    dataset.file.encoding = chardet.detect(fileSample)
    debugFiles(`Detected encoding ${dataset.file.encoding} for file ${fileName}`)
  }

  if (attachmentsFile) {
    await attachments.replaceAllAttachments(dataset, attachmentsFile)
  }

  return dataset
}

// Create a dataset by uploading data
const beforeUpload = asyncWrap(async(req, res, next) => {
  if (!req.user) return res.status(401).send()
  if (!permissions.canDoForOwner(usersUtils.owner(req), 'postDataset', req.user, req.app.get('db'))) return res.sendStatus(403)
  next()
})
router.post('', beforeUpload, filesUtils.uploadFile(), asyncWrap(async(req, res) => {
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
      dataset = await setFileInfo(datasetFile, attachmentsFile, initNew(req))
      await db.collection('datasets').insertOne(dataset)
    } else if (req.body.isVirtual) {
      if (!req.body.title) throw createError(400, 'Un jeu de données virtuel doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données virtuel ne peut pas avoir de pièces jointes')
      const { isVirtual, ...patch } = req.body
      if (!validatePatch(patch)) {
        throw createError(400, JSON.stringify(validatePatch.errors))
      }
      dataset = initNew(req)
      dataset.virtual = dataset.virtual || { children: [] }
      dataset.schema = await virtualDatasetsUtils.prepareSchema(db, dataset)
      dataset.status = 'indexed'
      const baseId = slug(req.body.title).toLowerCase()
      await datasetUtils.insertWithBaseId(db, dataset, baseId)
    } else if (req.body.isRest) {
      if (!req.body.title) throw createError(400, 'Un jeu de données REST doit être créé avec un titre')
      if (attachmentsFile) throw createError(400, 'Un jeu de données REST ne peut pas être créé avec des pièces jointes')
      const { isRest, ...patch } = req.body
      if (!validatePatch(patch)) {
        throw createError(400, JSON.stringify(validatePatch.errors))
      }
      dataset = initNew(req)
      dataset.rest = dataset.rest || {}
      dataset.schema = dataset.schema || []
      dataset.status = 'schematized'
      const baseId = slug(req.body.title).toLowerCase()
      await datasetUtils.insertWithBaseId(db, dataset, baseId)
      await restDatasetsUtils.initDataset(db, dataset)
    } else {
      throw createError(400, 'Un jeu de données doit être initialisé avec un fichier ou déclaré "virtuel" ou "REST"')
    }

    delete dataset._id

    await journals.log(req.app, dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id }, 'dataset')
    await datasetUtils.updateStorageSize(db, dataset.owner)
    res.status(201).send(clean(dataset))
  } catch (err) {
  // Wrapped the whole thing in a try/catch to remove files in case of failure
    for (let file of req.files) {
      await fs.remove(file.path)
    }
    throw err
  }
}))

// PUT or POST with an id to create or update an existing dataset data
const attemptInsert = asyncWrap(async(req, res, next) => {
  if (!req.user) return res.status(401).send()

  const newDataset = initNew(req)
  newDataset.id = req.params.datasetId

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newDataset.owner, 'postDataset', req.user, req.app.get('db'))) {
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
    if (datasetFile) {
      dataset = await setFileInfo(datasetFile, attachmentsFile, req.dataset)
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
      dataset.schema = dataset.schema || []
      await restDatasetsUtils.initDataset(db, dataset)
      dataset.status = 'schematized'
    }
    Object.assign(dataset, req.body)

    dataset.updatedBy = { id: req.user.id, name: req.user.name }
    dataset.updatedAt = moment().toISOString()
    await db.collection('datasets').replaceOne({ id: req.params.datasetId }, dataset)
    if (req.isNewDataset) await journals.log(req.app, dataset, { type: 'dataset-created' }, 'dataset')
    else await journals.log(req.app, dataset, { type: 'dataset-updated' }, 'dataset')
    await datasetUtils.updateStorageSize(db, req.dataset.owner)
    res.status(req.isNewDataset ? 201 : 200).send(clean(dataset))
  } catch (err) {
    // Wrapped the whole thing in a try/catch to remove files in case of failure
    for (let file of req.files) {
      await fs.remove(file.path)
    }
    throw err
  }
})
router.post('/:datasetId', attemptInsert, readDataset(['finalized', 'error']), permissions.middleware('writeData', 'write'), filesUtils.uploadFile(), updateDataset)
router.put('/:datasetId', attemptInsert, readDataset(['finalized', 'error']), permissions.middleware('writeData', 'write'), filesUtils.uploadFile(), updateDataset)

// CRUD operations for REST datasets
function isRest(req, res, next) {
  if (!req.dataset.isRest) {
    return res.status(501)
      .send('Les opérations de modifications sur les lignes sont uniquement accessibles pour les jeux de données de type REST.')
  }
  next()
}
router.get('/:datasetId/lines/:lineId', readDataset(), isRest, permissions.middleware('readLine', 'read'), cacheHeaders.noCache, asyncWrap(restDatasetsUtils.readLine))
router.post('/:datasetId/lines', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('createLine', 'write'), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.createLine))
router.put('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('updateLine', 'write'), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.updateLine))
router.patch('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('patchLine', 'write'), restDatasetsUtils.uploadAttachment, asyncWrap(restDatasetsUtils.patchLine))
router.post('/:datasetId/_bulk_lines', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('bulkLines', 'write'), restDatasetsUtils.uploadBulk, asyncWrap(restDatasetsUtils.bulkLines))
router.delete('/:datasetId/lines/:lineId', readDataset(['finalized', 'updated', 'indexed']), isRest, permissions.middleware('deleteLine', 'write'), asyncWrap(restDatasetsUtils.deleteLine))

// Error from ES backend should be stored in the journal
async function manageESError(req, err) {
  // console.error('Elasticsearch error', err)
  const errBody = (err.body && err.body.error) || {}
  let message = err.message
  if (errBody.root_cause && errBody.root_cause.reason) message = errBody.root_cause.reason
  if (errBody.failed_shards && errBody.failed_shards[0] && errBody.failed_shards[0].reason) {
    const shardReason = errBody.failed_shards[0].reason
    if (shardReason.caused_by && shardReason.caused_by.reason) {
      message = shardReason.caused_by.reason
    } else {
      message = shardReason
    }
  }

  if (req.dataset.status === 'finalized' && err.statusCode >= 404 && errBody.type !== 'search_phase_execution_exception') {
    await req.app.get('db').collection('datasets').updateOne({ id: req.params.datasetId }, { '$set': { status: 'error' } })
    await journals.log(req.app, req.dataset, { type: 'error', data: message })
  }
  throw createError(err.status, message)
}

// Read/search data for a dataset
router.get('/:datasetId/lines', readDataset(), permissions.middleware('readLines', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
      query
    })
    if (value !== null) return value
    const newValue = await esUtils.count(req.app.get('es'), req.dataset, query)
    cache.set(db, hash, newValue)
    return newValue
  }

  // if the output format is geo make sure geoshape is present
  if (['geojson', 'mvt', 'vt', 'pbf'].includes(req.query.format)) {
    req.query.select = (req.query.select ? req.query.select + ',' : '') + '_geoshape'
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
    if (value) return res.status(200).send(value.buffer)
    cacheHash = hash
  }

  let xyz
  if (vectorTileRequested) {
    if (!req.query.xyz) return res.status(400).send('xyz parameter is required for vector tile format.')
    xyz = req.query.xyz.split(',').map(Number)

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
    esResponse = await esUtils.search(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  if (req.query.format === 'geojson') {
    const geojson = geo.result2geojson(esResponse)
    geojson.bbox = (await bboxPromise).bbox
    return res.status(200).send(geojson)
  }

  if (vectorTileRequested) {
    const tile = tiles.geojson2pbf(geo.result2geojson(esResponse), xyz)
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
    return res.status(200).send(tile)
  }

  const result = {
    total: esResponse.hits.total.value,
    results: esResponse.hits.hits.map(hit => {
      return esUtils.prepareResultItem(hit, req.dataset, req.query)
    })
  }
  res.status(200).send(result)
}))

// Special geo aggregation
router.get('/:datasetId/geo_agg', readDataset(), permissions.middleware('getGeoAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/values_agg', readDataset(), permissions.middleware('getValuesAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/values/:fieldKey', readDataset(), permissions.middleware('getValues', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/metric_agg', readDataset(), permissions.middleware('getMetricAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
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
router.get('/:datasetId/words_agg', readDataset(), permissions.middleware('getWordsAgg', 'read'), cacheHeaders.resourceBased, asyncWrap(async(req, res) => {
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  let result
  try {
    result = await esUtils.wordsAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// For datasets with attached files
router.get('/:datasetId/attachments/*', readDataset(), permissions.middleware('downloadOriginalData', 'read'), cacheHeaders.noCache, (req, res, next) => {
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send()
  res.download(path.resolve(datasetUtils.attachmentsDir(req.dataset), filePath))
})

// Download the full dataset in its original form
router.get('/:datasetId/raw', readDataset(), permissions.middleware('downloadOriginalData', 'read'), cacheHeaders.noCache, (req, res, next) => {
  res.download(datasetUtils.originalFileName(req.dataset), req.dataset.originalFile.name)
})

// Download the dataset in various formats
router.get('/:datasetId/convert', readDataset(), permissions.middleware('downloadOriginalData', 'read'), cacheHeaders.noCache, (req, res, next) => {
  if (!req.query || !req.query.format) res.download(datasetUtils.fileName(req.dataset), req.dataset.file.name)
  // TODO add logic to support other formats
  else res.status(400).send(`Format ${req.query.format} is not supported.`)
})

// Download the full dataset with extensions
router.get('/:datasetId/full', readDataset(), permissions.middleware('downloadFullData', 'read'), cacheHeaders.noCache, asyncWrap(async (req, res, next) => {
  const db = req.app.get('db')
  if (req.dataset.isVirtual) req.dataset.descendants = await virtualDatasetsUtils.descendants(req.app.get('db'), req.dataset)
  res.setHeader('Content-disposition', 'attachment; filename=' + req.dataset.file.name)
  res.setHeader('Content-type', 'text/csv')
  const relevantSchema = req.dataset.schema.filter(f => f.key.startsWith('_ext_') || !f.key.startsWith('_'))
  let readStream
  if (req.dataset.isRest) readStream = restDatasetsUtils.readStream(db, req.dataset)
  else readStream = datasetUtils.readStream(req.dataset)
  await pump(
    readStream,
    extensions.preserveExtensionStream({ db, esClient: req.app.get('es'), dataset: req.dataset }),
    new Transform({ transform(chunk, encoding, callback) {
      const flatChunk = flatten(chunk)
      callback(null, relevantSchema.map(field => flatChunk[field.key]))
    },
    objectMode: true }),
    csvStringify({ columns: relevantSchema.map(field => field.title || field['x-originalName'] || field.key), header: true }),
    res
  )
}))

router.get('/:datasetId/api-docs.json', readDataset(), permissions.middleware('readApiDoc', 'read'), cacheHeaders.resourceBased, (req, res) => {
  res.send(req.resourceApiDoc)
})

router.get('/:datasetId/journal', readDataset(), permissions.middleware('readJournal', 'read'), cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'dataset',
    id: req.params.datasetId
  })
  if (!journal) return res.send([])
  journal.events.reverse()
  res.json(journal.events)
}))

// Special route with very technical informations to help diagnose bugs, broken indices, etc.
router.get('/:datasetId/_diagnose', readDataset(), cacheHeaders.noCache, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  const esInfos = await esUtils.datasetInfos(req.app.get('es'), req.dataset)
  const filesInfos = await datasetUtils.lsFiles(req.dataset)
  res.json({ filesInfos, esInfos })
}))

// Special admin route to force reindexing a dataset
router.post('/:datasetId/_reindex', readDataset(), asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  const patchedDataset = await datasetUtils.reindex(req.app.get('db'), req.dataset)
  res.status(200).send(patchedDataset)
}))

module.exports = router
