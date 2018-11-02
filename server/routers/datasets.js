const { Transform } = require('stream')
const express = require('express')
const ajv = require('ajv')()
const ajvErrorMessages = require('ajv-error-messages')
const util = require('util')
const fs = require('fs-extra')
const unlink = util.promisify(fs.unlink)
const path = require('path')
const moment = require('moment')
const pump = util.promisify(require('pump'))
const csvStringify = require('csv-stringify')
const flatten = require('flat')
const mongodb = require('mongodb')
const config = require('config')
const clone = require('fast-clone')
const chardet = require('chardet')
const rimraf = util.promisify(require('rimraf'))
const journals = require('../utils/journals')
const esUtils = require('../utils/es')
const filesUtils = require('../utils/files')
const datasetAPIDocs = require('../../contract/dataset-api-docs')
const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const datasetUtils = require('../utils/dataset')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const extensions = require('../utils/extensions')
const geo = require('../utils/geo')
const tiles = require('../utils/tiles')
const cache = require('../utils/cache')
const converter = require('../workers/converter')
const datasetPatchSchema = require('../../contract/dataset-patch')
const validatePatch = ajv.compile(datasetPatchSchema)

let router = express.Router()

const datasetFileSample = require('../utils/dataset-file-sample')
const baseTypes = new Set(['text/csv', 'application/geo+json'])
const acceptedStatuses = ['finalized', 'error']

const operationsClasses = {
  list: ['list'],
  read: ['readDescription', 'readLines', 'getGeoAgg', 'getValuesAgg', 'getMetricAgg', 'getWordsAgg', 'downloadOriginalData', 'downloadFullData', 'readJournal', 'readApiDoc'],
  write: ['writeDescription', 'writeData'],
  admin: ['delete', 'getPermissions', 'setPermissions']
}

function clean(dataset) {
  dataset.public = permissions.isPublic(dataset, operationsClasses)
  delete dataset.permissions
  findUtils.setResourceLinks(dataset, 'dataset')
  return dataset
}

// Get the list of datasets
router.get('', asyncWrap(async(req, res) => {
  const datasets = req.app.get('db').collection('datasets')
  const query = findUtils.query(req, {
    'filename': 'originalFile.name',
    'concepts': 'schema.x-refersTo',
    'field-type': 'schema.type',
    'field-format': 'schema.format',
    'ids': 'id'
  })
  if (req.query.bbox === 'true') {
    query.bbox = { $ne: null }
  }
  if (req.query.files === 'true') {
    query.hasFiles = true
  }
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select)
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? datasets.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    datasets.countDocuments(query)
  ]
  if (req.query.facets) {
    const q = clone(query)
    if (req.query.owner) q.$and.pop()
    mongoQueries.push(datasets.aggregate(findUtils.facetsQuery(req.query.facets, q)).toArray())
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
const readDataset = asyncWrap(async(req, res, next) => {
  req.dataset = req.resource = await req.app.get('db').collection('datasets')
    .findOne({ id: req.params.datasetId }, { projection: { _id: 0 } })
  if (!req.dataset) return res.status(404).send('Dataset not found')
  req.resourceApiDoc = datasetAPIDocs(req.dataset)
  next()
})

router.use('/:datasetId/permissions', readDataset, permissions.router('datasets', 'dataset'))

// retrieve a dataset by its id
router.get('/:datasetId', readDataset, permissions.middleware('readDescription', 'read'), (req, res, next) => {
  req.dataset.userPermissions = permissions.list(req.dataset, operationsClasses, req.user)
  res.status(200).send(clean(req.dataset))
})

// retrieve only the schema.. Mostly useful for easy select fields
router.get('/:datasetId/schema', readDataset, permissions.middleware('readDescription', 'read'), (req, res, next) => {
  let schema = req.dataset.schema
  schema.forEach(field => {
    field.label = field.title || field['x-originalName']
  })
  if (req.query.type) {
    const types = req.query.type.split(',')
    schema = schema.filter(field => types.includes(field.type))
  }
  if (req.query.format) {
    const formats = req.query.format.split(',')
    schema = schema.filter(field => formats.includes(field.format))
  }
  res.status(200).send(schema)
})

// Update a dataset's metadata
router.patch('/:datasetId', readDataset, permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const patch = req.body
  if (!acceptedStatuses.includes(req.dataset.status) && (patch.schema || patch.extensions)) return res.status(409).send('Dataset is not in proper state to be updated')
  var valid = validatePatch(patch)
  if (!valid) return res.status(400).send(ajvErrorMessages(validatePatch.errors))

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }
  if (patch.extensions) patch.schema = await extensions.prepareSchema(req.app.get('db'), patch.schema || req.dataset.schema, patch.extensions)

  // Changed a previously failed dataset, retry everything.
  // Except download.. We only try it again if the fetch failed.
  if (req.dataset.status === 'error') {
    if (req.dataset.remoteFile && !req.dataset.originalFile) patch.status = 'imported'
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

  if (patch.schema) {
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

// Delete a dataset
router.delete('/:datasetId', readDataset, permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  const db = req.app.get('db')
  try {
    await unlink(datasetUtils.originalFileName(req.dataset))
  } catch (err) {
    console.error('Error while deleting original file', err)
  }
  try {
    if (!baseTypes.has(req.dataset.originalFile.mimetype)) {
      await unlink(datasetUtils.fileName(req.dataset))
    }
  } catch (err) {
    console.error('Error while deleting converted file', err)
  }
  try {
    if (converter.archiveTypes.has(req.dataset.originalFile.mimetype)) {
      await rimraf(datasetUtils.extractedFilesDirname(req.dataset))
    }
  } catch (err) {
    console.error('Error while deleting decompressed files', err)
  }

  await db.collection('datasets').deleteOne({ id: req.params.datasetId })
  await db.collection('journals').deleteOne({ type: 'dataset', id: req.params.datasetId })
  try {
    await esUtils.delete(req.app.get('es'), req.dataset)
  } catch (err) {
    console.error('Error while deleting dataset indexes and alias', err)
  }

  await datasetUtils.updateStorageSize(db, req.dataset.owner)
  res.sendStatus(204)
}))

const initNew = (req) => {
  const dataset = { ...req.body }
  dataset.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  dataset.createdAt = dataset.updatedAt = date
  dataset.createdBy = dataset.updatedBy = { id: req.user.id, name: req.user.name }
  dataset.permissions = []
  return dataset
}

const setFileInfo = async (file, dataset) => {
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
    const fileSample = await datasetFileSample(dataset)
    dataset.file.encoding = chardet.detect(fileSample)
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
  const db = req.app.get('db')
  // After uploadFile, req.file contains the metadata of an uploaded file, and req.body the content of additional text fields
  if (!req.file) return res.status(400).send('Expected a file multipart/form-data')

  const dataset = await setFileInfo(req.file, initNew(req))
  await db.collection('datasets').insertOne(dataset)
  delete dataset._id

  await journals.log(req.app, dataset, { type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id }, 'dataset')
  await datasetUtils.updateStorageSize(db, dataset.owner)
  res.status(201).send(clean(dataset))
}))

// POST with an id to create or update an existing dataset data
const attemptInsert = asyncWrap(async(req, res, next) => {
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
  const db = req.app.get('db')
  // After uploadFile, req.file contains the metadata of an uploaded file, and req.body the content of additional text fields
  if (!req.file) return res.status(400).send('Expected a file multipart/form-data')
  if (req.dataset.status && !acceptedStatuses.includes(req.dataset.status)) return res.status(409).send('Dataset is not in proper state to be updated')

  const newDataset = await setFileInfo(req.file, req.dataset)
  Object.assign(newDataset, req.body)
  newDataset.updatedBy = { id: req.user.id, name: req.user.name }
  newDataset.updatedAt = moment().toISOString()
  await db.collection('datasets').replaceOne({ id: req.params.datasetId }, newDataset)
  if (req.isNewDataset) await journals.log(req.app, newDataset, { type: 'data-created' }, 'dataset')
  else await journals.log(req.app, newDataset, { type: 'data-updated' }, 'dataset')
  await datasetUtils.updateStorageSize(db, req.dataset.owner)
  res.status(req.isNewDataset ? 201 : 200).send(clean(newDataset))
})
router.post('/:datasetId', attemptInsert, readDataset, permissions.middleware('writeData', 'write'), filesUtils.uploadFile(), updateDataset)
router.put('/:datasetId', attemptInsert, readDataset, permissions.middleware('writeData', 'write'), filesUtils.uploadFile(), updateDataset)

// Set max-age
// Also compare last-modified and if-modified-since headers for cache revalidation
// only send data if the dataset was finalized since then
// prevent running expensive queries while always presenting fresh data
// also set last finalized date into last-modified header
function managePublicCache(req, res) {
  if (!req.dataset.finalizedAt) return
  res.setHeader('Cache-Control', 'public, max-age=' + config.cache.publicMaxAge)
  const finalizedAt = (new Date(req.dataset.finalizedAt)).toUTCString()
  const ifModifiedSince = req.get('If-Modified-Since')
  if (ifModifiedSince && finalizedAt === ifModifiedSince) return true
  res.setHeader('Last-Modified', finalizedAt)
}

// Error from ES backend should be stored in the journal
async function manageESError(req, err) {
  const errBody = (err.body && err.body.error) || {}
  if (req.dataset.status === 'finalized' && err.statusCode >= 404 && errBody.type !== 'search_phase_execution_exception') {
    await req.app.get('db').collection('datasets').updateOne({ id: req.params.datasetId }, { '$set': { status: 'error' } })
    await journals.log(req.app, req.dataset, { type: 'error', data: err.message })
  }
  throw err
}

// Read/search data for a dataset
router.get('/:datasetId/lines', readDataset, permissions.middleware('readLines', 'read'), asyncWrap(async(req, res) => {
  if (req.query && req.query.page && req.query.size && req.query.page * req.query.size > 10000) {
    return res.status(404).send('You can only access the first 10 000 elements.')
  }

  const db = req.app.get('db')
  if (!req.user && managePublicCache(req, res)) return res.status(304).send()

  // if the output format is geo default is empty select and make sure geoshape is present
  if (['geojson', 'mvt', 'vt', 'pbf'].includes(req.query.format)) {
    req.query.select = (req.query.select ? req.query.select + ',' : '') + '_geoshape'
  }

  // geojson format benefits from bbox info
  let bboxPromise
  if (req.query.format === 'geojson') {
    bboxPromise = esUtils.bboxAgg(req.app.get('es'), req.dataset, { ...req.query })
  }

  const vectorTileRequested = ['mvt', 'vt', 'pbf'].includes(req.query.format)
  // Is the tile cached ?
  let cacheHash
  if (vectorTileRequested && !config.cache.disabled) {
    const { hash, value } = await cache.get(db, {
      type: 'tile',
      datasetId: req.dataset.id,
      finalizedAt: req.dataset.finalizedAt,
      query: req.query
    })
    if (value) return res.status(200).send(value.buffer)
    cacheHash = hash
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
    if (!req.query.xyz) return res.status(400).send('xyz parameter is required for vector tile format.')
    const tile = tiles.geojson2pbf(geo.result2geojson(esResponse), req.query.xyz.split(',').map(Number))
    // 204 = no-content, better than 404
    if (!tile) return res.status(204).send()
    res.type('application/x-protobuf')
    // write in cache without await on purpose for minimal latency, a cache failure must be detected in the logs
    if (!config.cache.disabled) cache.set(db, cacheHash, new mongodb.Binary(tile))
    return res.status(200).send(tile)
  }

  const result = {
    total: esResponse.hits.total,
    results: esResponse.hits.hits.map(hit => {
      return esUtils.prepareResultItem(hit, req.dataset, req.query)
    })
  }
  res.status(200).send(result)
}))

// Special geo aggregation
router.get('/:datasetId/geo_agg', readDataset, permissions.middleware('getGeoAgg', 'read'), asyncWrap(async(req, res) => {
  if (!req.user && managePublicCache(req, res)) return res.status(304).send()
  let result
  try {
    result = await esUtils.geoAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Standard aggregation to group items by value and perform an optional metric calculation on each group
router.get('/:datasetId/values_agg', readDataset, permissions.middleware('getValuesAgg', 'read'), asyncWrap(async(req, res) => {
  if (!req.user && managePublicCache(req, res)) return res.status(304).send()
  let result
  try {
    result = await esUtils.valuesAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple metric aggregation to calculate some value (sum, avg, etc.)
router.get('/:datasetId/metric_agg', readDataset, permissions.middleware('getMetricAgg', 'read'), asyncWrap(async(req, res) => {
  if (!req.user && managePublicCache(req, res)) return res.status(304).send()
  let result
  try {
    result = await esUtils.metricAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// Simple words aggregation for significant terms extraction
router.get('/:datasetId/words_agg', readDataset, permissions.middleware('getWordsAgg', 'read'), asyncWrap(async(req, res) => {
  if (!req.user && managePublicCache(req, res)) return res.status(304).send()
  let result
  try {
    result = await esUtils.wordsAgg(req.app.get('es'), req.dataset, req.query)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
}))

// For datasets with attached files
router.get('/:datasetId/files/*', readDataset, permissions.middleware('downloadOriginalData', 'read'), (req, res, next) => {
  if (!req.dataset.hasFiles) return res.status(404).send('This datasets does not have attached files')
  const filePath = req.params['0']
  if (filePath.includes('..')) return res.status(400).send()
  res.download(path.resolve(datasetUtils.extractedFilesDirname(req.dataset), filePath))
})

// Download the full dataset in its original form
router.get('/:datasetId/raw', readDataset, permissions.middleware('downloadOriginalData', 'read'), (req, res, next) => {
  res.download(datasetUtils.originalFileName(req.dataset), req.dataset.originalFile.name)
})

// Download the dataset in various formats
router.get('/:datasetId/convert', readDataset, permissions.middleware('downloadOriginalData', 'read'), (req, res, next) => {
  if (!req.query || !req.query.format) res.download(datasetUtils.fileName(req.dataset), req.dataset.file.name)
  // TODO add logic to support other formats
  else res.status(400).send(`Format ${req.query.format} is not supported.`)
})

// Download the full dataset with extensions
router.get('/:datasetId/full', readDataset, permissions.middleware('downloadFullData', 'read'), asyncWrap(async (req, res, next) => {
  res.setHeader('Content-disposition', 'attachment; filename=' + req.dataset.file.name)
  res.setHeader('Content-type', 'text/csv')
  await pump(
    datasetUtils.readStream(req.dataset),
    extensions.preserveExtensionStream({ db: req.app.get('db'), esClient: req.app.get('es'), dataset: req.dataset }),
    new Transform({ transform(chunk, encoding, callback) {
      const flatChunk = flatten(chunk)
      callback(null, req.dataset.schema.map(field => flatChunk[field.key]))
    },
    objectMode: true }),
    csvStringify({ columns: req.dataset.schema.map(field => field.title || field['x-originalName'] || field.key), header: true }),
    res
  )
}))

router.get('/:datasetId/api-docs.json', readDataset, permissions.middleware('readApiDoc', 'read'), (req, res) => {
  res.send(req.resourceApiDoc)
})

router.get('/:datasetId/journal', readDataset, permissions.middleware('readJournal', 'read'), asyncWrap(async(req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    type: 'dataset',
    id: req.params.datasetId
  })
  if (!journal) return res.send([])
  journal.events.reverse()
  res.json(journal.events)
}))

// Special route with very technical informations to help diagnose bugs, broken indices, etc.
router.get('/:datasetId/_diagnose', readDataset, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  const esInfos = await esUtils.datasetInfos(req.app.get('es'), req.dataset)
  const filesInfos = await datasetUtils.lsFiles(req.dataset)
  res.json({ filesInfos, esInfos })
}))

// Special admin route to firce reindexing a dataset
router.post('/:datasetId/_reindex', readDataset, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  const patch = { status: 'loaded' }
  if (!baseTypes.has(req.dataset.originalFile.mimetype)) patch.status = 'uploaded'
  await req.app.get('db').collection('datasets').updateOne({ id: req.params.datasetId }, { '$set': patch })
  res.status(200).send(patch)
}))

module.exports = router
