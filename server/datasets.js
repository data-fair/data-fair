const express = require('express')
const ajv = require('ajv')()
const datasetSchema = require('../contract/dataset.json')
const validate = ajv.compile(datasetSchema)
const moment = require('moment')
const auth = require('./auth')
const journals = require('./journals')

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
      name: 'original-filename',
      field: 'originalFileName'
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
    if (!req.dataset) return res.sendStatus(404)
    next()
  } catch (err) {
    next(err)
  }
}, function(req, res, next) {
  if (req.dataset.public) {
    req.canRead = true
  } else if (!req.user) {
    return res.sendStatus(401)
  }
  if (req.user) {
    if ((req.dataset.owner.type === 'user' && req.dataset.owner.id === req.user.id) || (req.dataset.owner.type === 'organization' && req.user.organizations.findIndex(o => o.id === req.dataset.owner.id) >= 0)) {
      // TODO check if we handle organization permissions with roles too
      req.canRead = true
      req.canWrite = true
    } else {
      (req.dataset.permissions || []).forEach(permission => {
        if ((permission.type === 'user' && permission.id === req.user.id) || (permission.type === 'organization' && req.user.organizations.indexOf(permission.id) >= 0)) {
          if (permission.mode.indexOf('read') >= 0) {
            req.canRead = true
          }
          if (permission.mode.indexOf('write') >= 0) {
            req.canWrite = true
          }
        }
      })
    }
  }
  next()
})

// retrieve a dataset by its id
router.get('/:datasetId', (req, res, next) => {
  if (!req.canRead) return res.sendStatus(403)
  res.status(200).send(req.dataset)
})

// update a dataset
router.put('/:datasetId', async(req, res, next) => {
  if (!req.canWrite) return res.sendStatus(403)
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

// Delete a dataset
router.delete('/:datasetId', async(req, res, next) => {
  if (!req.canWrite) return res.sendStatus(403)
  try {
    // TODO : Remove data
    await req.app.get('db').collection('datasets').deleteOne({
      id: req.params.datasetId
    })
    res.sendStatus(204)
  } catch (err) {
    return next(err)
  }
})

const shortid = require('shortid')
const config = require('config')
const fs = require('fs-extra')
const path = require('path')
const multer = require('multer')
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    if (!req.body) {
      return cb(new Error(400))
    }
    if (req.dataset) {
      req.body.owner = req.dataset.owner
    }
    if (!req.body.owner || !req.body.owner.type || !req.body.owner.id) {
      return cb(new Error(400))
    }
    const uploadDir = path.join(config.dataDir, req.body.owner.type, req.body.owner.id)
    fs.ensureDirSync(uploadDir)
    cb(null, uploadDir)
  },
  filename: async function(req, file, cb) {
    let id
    if (req.dataset) {
      id = req.dataset.id
    } else {
      do {
        id = shortid.generate()
        var dataset = await req.app.get('db').collection('datasets').findOne({
          id: id
        })
      } while (dataset)
    }
    cb(null, id + '.' + file.originalname.split('.').pop())
  }
})
const upload = multer({
  storage: storage,
  fileFilter: function fileFilter (req, file, cb) {
    console.log('filter', file)
    cb(null, true)
  }
})

// Create a dataset by uploading tabular data
router.post('', auth.jwtMiddleware, upload.single('file'), async(req, res, next) => {
  // TODO verify quota
  const date = moment().toISOString()
  const dataset = {
    id: req.file.filename.split('.').shift(),
    title: req.file.originalname.split('.').shift(),
    originalFileName: req.file.originalname,
    fileSize: req.file.size,
    public: false,
    owner: req.body.owner,
    createdBy: req.user.id,
    createdAt: date,
    updatedBy: req.user.id,
    updatedAt: date,
    status: 'loaded'
  }
  try {
    await req.app.get('db').collection('datasets').insertOne(dataset)
    await journals.log(req.app.get('db'), dataset, {
      type: 'created'
    })
    // TODO index data
    res.status(201).send(dataset)
  } catch (err) {
    next(err)
  }
})

// Update an existing dataset data
router.post('/:datasetId', upload.single('file'), async(req, res, next) => {
  if (!req.canWrite) return res.sendStatus(403)
  try {
    req.dataset.originalFileName = req.file.originalname
    req.dataset.fileSize = req.file.size
    req.dataset.updatedBy = req.user.id
    req.dataset.updatedAt = moment().toISOString()
    await req.app.get('db').collection('datasets').updateOne({
      id: req.params.datasetId
    }, req.dataset)
    await journals.log(req.app.get('db'), req.dataset, {
      type: 'data-updated'
    })
    // TODO verify quota

    // TODO reindex
    res.status(200).send(req.dataset)
  } catch (err) {
    return next(err)
  }
})

// Read data for a dataset
router.get('/:datasetId/data', (req, res, next) => {
  if (!req.canRead) return res.sendStatus(403)
  // TODO send data
  res.status(200).send(req.dataset)
})

module.exports = router
