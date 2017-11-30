const express = require('express')
const ajv = require('ajv')()
const fs = require('fs-extra')
const util = require('util')
const datasetSchema = require('../contract/dataset.json')
const validate = ajv.compile(datasetSchema)
const moment = require('moment')
const auth = require('./auth')
const journals = require('./journals')
const esUtils = require('./utils/es')
const filesUtils = require('./utils/files')
const datasetAPIDocs = require('../contract/dataset-api-docs')
const permissions = require('./utils/permissions')

let router = express.Router()

// Get the list of datasets
router.get('', auth.optionalJwtMiddleware, async function(req, res, next) {
  let datasets = req.app.get('db').collection('datasets')
  let query = {}
  let sort = {}
  let size = 10
  let skip = 0
  if (req.query) {
    if (req.query.size && !isNaN(parseInt(req.query.size))) {
      size = parseInt(req.query.size)
    }
    if (req.query.skip && !isNaN(parseInt(req.query.skip))) {
      skip = parseInt(req.query.skip)
    }
    if (req.query.q) {
      query.$text = {
        $search: req.query.q
      }
    }
    Object.assign(query, ...[{
      name: 'owner-type',
      field: 'owner.type'
    }, {
      name: 'owner-id',
      field: 'owner.id'
    }, {
      name: 'filename',
      field: 'file.name'
    }].filter(p => req.query[p.name] !== undefined).map(p => ({
      [p.field]: req.query[p.name]
    })))
  }
  if (req.query.sort) {
    Object.assign(sort, ...req.query.sort.split(',').map(s => {
      let toks = s.split(':')
      return {
        [toks[0]]: Number(toks[1])
      }
    }))
  }
  // TODO : handle permissions and set the correct filter on the list
  if (req.user) {
    query.$or = []
    query.$or.push({
      'owner.type': 'user',
      'owner.id': req.user.id
    })
    query.$or.push({
      'owner.type': 'organization',
      'owner.id': {
        $in: req.user.organizations.map(o => o.id)
      }
    })
  }
  let mongoQueries = [
    size > 0 ? datasets.find(query).limit(size).skip(skip).sort(sort).project({
      _id: 0
    }).toArray() : Promise.resolve([]),
    datasets.find(query).count()
  ]
  try {
    let [documents, count] = await Promise.all(mongoQueries)
    res.json({
      results: documents,
      count: count
    })
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
  if (!permissions(req.dataset, 'readDescription', req.user)) return res.sendStatus(403)
  res.status(200).send(req.dataset)
})

// update a dataset
router.put('/:datasetId', async(req, res, next) => {
  if (!permissions(req.dataset, 'writeDescription', req.user)) return res.sendStatus(403)
  var valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
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

const datasetUtils = require('./utils/dataset')
const unlink = util.promisify(fs.unlink)
// Delete a dataset
router.delete('/:datasetId', async(req, res, next) => {
  if (!permissions(req.dataset, 'delete', req.user)) return res.sendStatus(403)
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
      public: false,
      owner: req.body.owner,
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
  if (!permissions(req.dataset, 'writeData', req.user)) return res.sendStatus(403)
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
    // TODO verify quota

    // TODO reindex
    res.status(200).send(req.dataset)
  } catch (err) {
    return next(err)
  }
})

// Read/search data for a dataset
router.get('/:datasetId/lines', async(req, res, next) => {
  if (!permissions(req.dataset, 'readData', req.user)) return res.sendStatus(403)
  try {
    const result = await esUtils.searchInDataset(req.dataset, req.query)
    res.status(200).send(result)
  } catch (err) {
    return next(err)
  }
})

// Read/search data for a dataset
router.get('/:datasetId/raw/:fileName', async(req, res, next) => {
  if (req.params.fileName !== req.dataset.file.name) return res.sendStatus(404)
  if (!permissions(req.dataset, 'readData', req.user)) return res.sendStatus(403)
  res.download(datasetUtils.fileName(req.dataset))
})

router.get('/:datasetId/api-docs.json', (req, res) => {
  res.send(datasetAPIDocs(req.dataset))
})

module.exports = router
