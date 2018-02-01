const express = require('express')
const ajv = require('ajv')()
const fs = require('fs-extra')
const util = require('util')
const moment = require('moment')
const auth = require('./auth')
const journals = require('./utils/journals')
const esUtils = require('./utils/es')
const filesUtils = require('./utils/files')
const datasetAPIDocs = require('../contract/dataset-api-docs')
const permissions = require('./utils/permissions')
const usersUtils = require('./utils/users')
const findUtils = require('./utils/find')
const asyncWrap = require('./utils/async-wrap')
const extensions = require('./utils/extensions')
const config = require('config')

const datasetSchema = require('../contract/dataset.json')
const datasetSchemaNoRequired = Object.assign(datasetSchema)
delete datasetSchemaNoRequired.required
const validate = ajv.compile(datasetSchemaNoRequired)

let router = express.Router()

// Get the list of datasets
router.get('', auth.optionalJwtMiddleware, asyncWrap(async(req, res) => {
  let datasets = req.app.get('db').collection('datasets')
  const query = findUtils.query(req.query, {
    'filename': 'file.name',
    'concepts': 'schema.x-refersTo'
  })
  const sort = findUtils.sort(req.query.sort)
  const [skip, size] = findUtils.pagination(req.query)
  query.$or = permissions.filter(req.user)
  let mongoQueries = [
    size > 0 ? datasets.find(query).limit(size).skip(skip).sort(sort).project({_id: 0, permissions: 0}).toArray() : Promise.resolve([]),
    datasets.find(query).count()
  ]
  const [results, count] = await Promise.all(mongoQueries)
  res.json({results, count})
}))

// Middlewares
router.use('/:datasetId', auth.optionalJwtMiddleware, asyncWrap(async(req, res, next) => {
  req.dataset = await req.app.get('db').collection('datasets').findOne({
    id: req.params.datasetId
  }, {
    fields: {
      _id: 0
    }
  })
  if (!req.dataset) return res.status(404).send('Dataset not found')
  next()
}))

router.use('/:datasetId/permissions', permissions.router('datasets', 'dataset'))

// retrieve a dataset by its id
router.get('/:datasetId', (req, res, next) => {
  if (!permissions.can(req.dataset, 'readDescription', req.user)) return res.sendStatus(403)
  delete req.dataset.permissions
  res.status(200).send(req.dataset)
})

// Update a dataset
const patchKeys = ['schema', 'description', 'title', 'license', 'origin', 'extensions']
router.patch('/:datasetId', asyncWrap(async(req, res) => {
  if (!permissions.can(req.dataset, 'writeDescription', req.user)) return res.sendStatus(403)
  if (req.dataset.status !== 'indexed') return res.status(400).accept('Dataset is not in proper status to be updated')
  var valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)

  const forbiddenKey = Object.keys(req.body).find(key => !patchKeys.includes(key))
  if (forbiddenKey) return res.status(400).send('Only some parts of the dataset can be modified through this route')

  req.body.updatedAt = moment().toISOString()
  req.body.updatedBy = req.user.id
  if (req.body.extensions) req.body.schema = await extensions.prepareSchema(req.app.get('db'), req.body.schema || req.dataset.schema, req.body.extensions)
  if (req.body.schema || req.body.extensions) req.body.status = 'schematized'

  await req.app.get('db').collection('datasets').updateOne({id: req.params.datasetId}, {'$set': req.body})
  res.status(200).json(req.body)
}))

const datasetUtils = require('./utils/dataset')
const unlink = util.promisify(fs.unlink)
// Delete a dataset
router.delete('/:datasetId', asyncWrap(async(req, res) => {
  if (!permissions.can(req.dataset, 'delete', req.user)) return res.sendStatus(403)

  // TODO : Remove indexes
  await unlink(datasetUtils.fileName(req.dataset))
  await req.app.get('db').collection('datasets').deleteOne({
    id: req.params.datasetId
  })
  await req.app.get('db').collection('journals').deleteOne({
    id: req.params.datasetId
  })
  res.sendStatus(204)
}))

const datasetFileSample = require('./utils/dataset-file-sample')
const detectCharacterEncoding = require('detect-character-encoding')

// Create a dataset by uploading tabular data
router.post('', auth.jwtMiddleware, filesUtils.uploadFile(), asyncWrap(async(req, res) => {
  if (req.storageRemaining !== undefined) res.set(config.headers.storedBytesRemaining, req.storageRemaining)
  const owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(owner, 'postDataset', req.user, req.app.get('db'))) return res.sendStatus(403)
  if (!req.file) return res.sendStatus(400)

  const date = moment().toISOString()
  const dataset = {
    id: req.file.id,
    title: req.file.title,
    file: {
      name: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype
    },
    owner,
    createdBy: req.user.id,
    createdAt: date,
    updatedBy: req.user.id,
    updatedAt: date,
    status: 'loaded'
  }
  const fileSample = await datasetFileSample(dataset)
  dataset.file.encoding = detectCharacterEncoding(fileSample).encoding
  await req.app.get('db').collection('datasets').insertOne(dataset)
  await journals.log(req.app, dataset, {type: 'dataset-created', href: config.publicUrl + '/dataset/' + dataset.id})
  res.status(201).send(dataset)
}))

// Update an existing dataset data
router.post('/:datasetId', filesUtils.uploadFile(), asyncWrap(async(req, res) => {
  if (req.storageRemaining !== undefined) res.set(config.headers.storedBytesRemaining, req.storageRemaining)
  if (!permissions.can(req.dataset, 'writeData', req.user)) return res.sendStatus(403)
  if (!req.file) return res.sendStatus(400)

  req.dataset.file = {
    name: req.file.originalname,
    size: req.file.size,
    mimetype: req.file.mimetype
  }
  const fileSample = await datasetFileSample(req.dataset)
  req.dataset.file.encoding = detectCharacterEncoding(fileSample).encoding
  req.dataset.updatedBy = req.user.id
  req.dataset.updatedAt = moment().toISOString()
  req.dataset.status = 'loaded'
  await req.app.get('db').collection('datasets').updateOne({
    id: req.params.datasetId
  }, req.dataset)
  await journals.log(req.app, req.dataset, {type: 'data-updated'})
  res.status(200).send(req.dataset)
}))

// Read/search data for a dataset
router.get('/:datasetId/lines', asyncWrap(async(req, res) => {
  if (!permissions.can(req.dataset, 'readLines', req.user)) return res.sendStatus(403)
  const result = await esUtils.searchInDataset(req.app.get('es'), req.dataset, req.query)
  res.status(200).send(result)
}))

// Special geo aggregation
router.get('/:datasetId/geo_agg', asyncWrap(async(req, res) => {
  if (!permissions.can(req.dataset, 'getGeoAgg', req.user)) return res.sendStatus(403)
  const result = await esUtils.geoAgg(req.app.get('es'), req.dataset, req.query)
  res.status(200).send(result)
}))

// Standard aggregation to group items by value and perform an optional metric calculation on each group
router.get('/:datasetId/values_agg', asyncWrap(async(req, res) => {
  if (!permissions.can(req.dataset, 'getValuesAgg', req.user)) return res.sendStatus(403)
  const result = await esUtils.valuesAgg(req.app.get('es'), req.dataset, req.query)
  res.status(200).send(result)
}))

// Simple metric aggregation to calculate some value (sum, avg, etc.)
router.get('/:datasetId/metric_agg', asyncWrap(async(req, res) => {
  if (!permissions.can(req.dataset, 'getMetricAgg', req.user)) return res.sendStatus(403)
  const result = await esUtils.metricAgg(req.app.get('es'), req.dataset, req.query)
  res.status(200).send(result)
}))

// Download the full dataset in its original form
router.get('/:datasetId/raw/:fileName', (req, res, next) => {
  if (req.params.fileName !== req.dataset.file.name) return res.sendStatus(404)
  if (!permissions.can(req.dataset, 'readData', req.user)) return res.sendStatus(403)
  res.download(datasetUtils.fileName(req.dataset))
})

router.get('/:datasetId/api-docs.json', (req, res) => {
  // TODO: permission ?
  res.send(datasetAPIDocs(req.dataset))
})

router.get('/:datasetId/journal', auth.jwtMiddleware, asyncWrap(async(req, res) => {
  const journal = await req.app.get('db').collection('journals').findOne({
    id: req.params.datasetId
  })
  if (!journal) return res.sendStatus(404)
  journal.events.reverse()
  res.json(journal.events)
}))

router.post('/:datasetId/_extend', auth.jwtMiddleware, asyncWrap(async(req, res) => {
  if (!permissions.can(req.dataset, 'writeData', req.user)) return res.status(403).send('No permission to write data in this dataset')

  const extension = (req.dataset.extensions || []).find(e => e.remoteService === req.query.remoteService && e.action === req.query.action)
  if (!extension) return res.status(404).send('Extension unknown')
  const remoteService = await req.app.get('db').collection('remote-services').findOne({id: extension.remoteService})
  if (!remoteService) return res.status(404).send('Remote service unknown')
  if (!permissions.can(remoteService, 'readDescription', req.user)) return res.status(403).send('No permission to read from this remote service')
  const action = remoteService.actions.find(a => a.id === extension.action)
  if (!action) return res.status(404).send('Action unknown')

  if (req.dataset.status !== 'indexed') return res.status(400).send('Dataset is not ready for extension.')
  await extensions.extend(req.app.get('es'), req.dataset, remoteService, action, req.query.keep === 'true')
  res.send()
}))

module.exports = router
