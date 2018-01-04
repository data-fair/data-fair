const express = require('express')
const ajv = require('ajv')()
const fs = require('fs-extra')
const util = require('util')
const datasetSchema = require('../contract/dataset.json')
const moment = require('moment')
const auth = require('./auth')
const journals = require('./journals')
const esUtils = require('./utils/es')
const filesUtils = require('./utils/files')
const datasetAPIDocs = require('../contract/dataset-api-docs')
const permissions = require('./utils/permissions')
const usersUtils = require('./utils/users')
const findUtils = require('./utils/find')

const validate = ajv.compile(datasetSchema)
const datasetSchemaNoRequired = Object.assign(datasetSchema)
delete datasetSchemaNoRequired.required
const validateNoRequired = ajv.compile(datasetSchemaNoRequired)

let router = express.Router()

// Get the list of datasets
router.get('', auth.optionalJwtMiddleware, async function(req, res, next) {
  let datasets = req.app.get('db').collection('datasets')
  const query = findUtils.query(req.query, {
    'filename': 'file.name',
    'concepts': 'schema.x-refersTo'
  })
  const sort = findUtils.sort(req.query.sort)
  const [skip, size] = findUtils.pagination(req.query)
  query.$or = permissions.filter(req.user)
  let mongoQueries = [
    size > 0 ? datasets.find(query).limit(size).skip(skip).sort(sort).project({_id: 0}).toArray() : Promise.resolve([]),
    datasets.find(query).count()
  ]
  try {
    const [results, count] = await Promise.all(mongoQueries)
    res.json({results, count})
  } catch (err) {
    next(err)
  }
})

// Middlewares
router.use('/:datasetId', auth.optionalJwtMiddleware, async function(req, res, next) {
  try {
    req.dataset = await req.app.get('db').collection('datasets').findOne({
      id: req.params.datasetId
    }, {
      fields: {
        _id: 0
      }
    })
    if (!req.dataset) return res.status(404).send('Dataset not found')
    next()
  } catch (err) {
    next(err)
  }
})

// retrieve a dataset by its id
router.get('/:datasetId', (req, res, next) => {
  if (!permissions.can(req.dataset, 'readDescription', req.user)) return res.sendStatus(403)
  res.status(200).send(req.dataset)
})

// update a dataset
// TODO: deprecate. Use PATCH.
router.put('/:datasetId', async(req, res, next) => {
  if (!permissions.can(req.dataset, 'writeDescription', req.user)) return res.sendStatus(403)
  let valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
  req.body.permissions = req.body.permissions || []
  req.body.permissions.forEach(permission => {
    if ((!permission.type && permission.id) || (permission.type && !permission.id)) valid = false
  })
  if (!valid) return res.status(400).send('Error in permissions format')
  req.body.updatedAt = moment().toISOString()
  req.body.updatedBy = req.user.id
  req.body.id = req.params.datasetId
  try {
    await req.app.get('db').collection('datasets').updateOne({
      id: req.params.datasetId
    }, req.body)
    res.status(200).json(req.body)
  } catch (err) {
    return next(err)
  }
})

router.patch('/:datasetId', async (req, res, next) => {
  try {
    if (!permissions.can(req.dataset, 'writeDescription', req.user)) return res.sendStatus(403)
    var valid = validateNoRequired(req.body)
    if (!valid) return res.status(400).send(validate.errors)

    const forbiddenKey = Object.keys(req.body).find(key => {
      return ['permissions', 'schema', 'description', 'title'].indexOf(key) === -1
    })
    if (forbiddenKey) return res.status(400).send('Only some parts of the dataset can be modified through this route')

    req.body.updatedAt = moment().toISOString()
    req.body.updatedBy = req.user.id
    if (req.body.schema) req.body.status = 'schematized'

    await req.app.get('db').collection('datasets').updateOne({id: req.params.datasetId}, {'$set': req.body})
    res.status(200).json(req.body)
  } catch (err) {
    return next(err)
  }
})

const datasetUtils = require('./utils/dataset')
const unlink = util.promisify(fs.unlink)
// Delete a dataset
router.delete('/:datasetId', async(req, res, next) => {
  if (!permissions.can(req.dataset, 'delete', req.user)) return res.sendStatus(403)
  try {
    // TODO : Remove indexes
    await unlink(datasetUtils.fileName(req.dataset))
    await req.app.get('db').collection('datasets').deleteOne({
      id: req.params.datasetId
    })
    await req.app.get('db').collection('journals').deleteOne({
      id: req.params.datasetId
    })
    res.sendStatus(204)
  } catch (err) {
    return next(err)
  }
})

const datasetFileSample = require('./utils/dataset-file-sample')
const detectCharacterEncoding = require('detect-character-encoding')

// Create a dataset by uploading tabular data
router.post('', auth.jwtMiddleware, filesUtils.uploadFile(), async(req, res, next) => {
  if (!req.file) return res.sendStatus(400)
  // TODO verify quota
  try {
    const date = moment().toISOString()
    const dataset = {
      id: req.file.id,
      title: req.file.title,
      file: {
        name: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype
      },
      owner: usersUtils.owner(req),
      createdBy: req.user.id,
      createdAt: date,
      updatedBy: req.user.id,
      updatedAt: date,
      status: 'loaded'
    }
    const fileSample = await datasetFileSample(dataset)
    dataset.file.encoding = detectCharacterEncoding(fileSample).encoding
    await req.app.get('db').collection('datasets').insertOne(dataset)
    await journals.log(req.app.get('db'), dataset, {type: 'created'})
    res.status(201).send(dataset)
  } catch (err) {
    next(err)
  }
})

// Update an existing dataset data
router.post('/:datasetId', filesUtils.uploadFile(), async(req, res, next) => {
  if (!permissions.can(req.dataset, 'writeData', req.user)) return res.sendStatus(403)
  if (!req.file) return res.sendStatus(400)
  try {
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
    await journals.log(req.app.get('db'), req.dataset, {type: 'data-updated'})
    res.status(200).send(req.dataset)
  } catch (err) {
    return next(err)
  }
})

// Read/search data for a dataset
router.get('/:datasetId/lines', async(req, res, next) => {
  if (!permissions.can(req.dataset, 'readLines', req.user)) return res.sendStatus(403)
  try {
    const result = await esUtils.searchInDataset(req.dataset, req.query)
    res.status(200).send(result)
  } catch (err) {
    return next(err)
  }
})

// Special geo aggregation
router.get('/:datasetId/geo_agg', async(req, res, next) => {
  if (!permissions.can(req.dataset, 'getGeoAgg', req.user)) return res.sendStatus(403)
  try {
    const result = await esUtils.geoAgg(req.dataset, req.query)
    res.status(200).send(result)
  } catch (err) {
    return next(err)
  }
})

// Standard aggregation to group items by value and perform an optional metric calculation on each group
router.get('/:datasetId/values_agg', async(req, res, next) => {
  if (!permissions.can(req.dataset, 'getValuesAgg', req.user)) return res.sendStatus(403)
  try {
    const result = await esUtils.valuesAgg(req.dataset, req.query)
    res.status(200).send(result)
  } catch (err) {
    return next(err)
  }
})

// Simple metric aggregation to calculate some value (sum, avg, etc.)
router.get('/:datasetId/metric_agg', async(req, res, next) => {
  if (!permissions.can(req.dataset, 'getMetricAgg', req.user)) return res.sendStatus(403)
  try {
    const result = await esUtils.metricAgg(req.dataset, req.query)
    res.status(200).send(result)
  } catch (err) {
    return next(err)
  }
})

// Download the full dataset in its original form
router.get('/:datasetId/raw/:fileName', async(req, res, next) => {
  if (req.params.fileName !== req.dataset.file.name) return res.sendStatus(404)
  if (!permissions.can(req.dataset, 'readData', req.user)) return res.sendStatus(403)
  res.download(datasetUtils.fileName(req.dataset))
})

router.get('/:datasetId/api-docs.json', (req, res) => {
  res.send(datasetAPIDocs(req.dataset))
})

module.exports = router
