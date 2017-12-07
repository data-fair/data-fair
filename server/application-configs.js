const express = require('express')
const auth = require('./auth')
const ajv = require('ajv')()
const applicationConfigSchema = require('../contract/application-config.json')
const validate = ajv.compile(applicationConfigSchema)
const permissions = require('./utils/permissions')
const moment = require('moment')
const shortid = require('shortid')

const router = module.exports = express.Router()

// Get the list of application-configs
router.get('', auth.optionalJwtMiddleware, async function(req, res, next) {
  const applicationConfigs = req.app.get('db').collection('application-configs')
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
    }].filter(p => req.query[p.name] !== undefined).map(p => ({
      [p.field]: {
        $in: req.query[p.name].split(',')
      }
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
    size > 0 ? applicationConfigs.find(query).limit(size).skip(skip).sort(sort).project({
      _id: 0,
      source: 0
    }).toArray() : Promise.resolve([]),
    applicationConfigs.find(query).count()
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

// Create an application configuration
router.post('', auth.jwtMiddleware, async(req, res, next) => {
  // This id is temporary, we should have an human understandable id, or perhaps manage it UI side ?
  req.body.id = req.body.id || shortid.generate()
  var valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
  const date = moment().toISOString()
  req.body.createdAt = date
  req.body.createdBy = req.user.id
  req.body.updatedAt = date
  req.body.updatedBy = req.user.id
  try {
    await req.app.get('db').collection('application-configs').insertOne(req.body)
    res.status(201).json(req.body)
  } catch (err) {
    return next(err)
  }
})

// Middlewares
router.use('/:applicationConfigId', auth.optionalJwtMiddleware, async function(req, res, next) {
  try {
    req.applicationConfig = await req.app.get('db').collection('application-configs').findOne({
      id: req.params.applicationConfigId
    }, {
      fields: {
        _id: 0
      }
    })
    if (!req.applicationConfig) return res.status(404).send('External Api not found')
    next()
  } catch (err) {
    next(err)
  }
})

// retrieve a applicationConfig by its id
router.get('/:applicationConfigId', (req, res, next) => {
  if (!permissions(req.applicationConfig, 'readDescription', req.user)) return res.sendStatus(403)
  res.status(200).send(req.applicationConfig)
})

// update a applicationConfig
router.put('/:applicationConfigId', async(req, res, next) => {
  if (!permissions(req.applicationConfig, 'writeDescription', req.user)) return res.sendStatus(403)
  var valid = validate(req.body)
  if (!valid) return res.status(400).send(validate.errors)
  req.body.updatedAt = moment().toISOString()
  req.body.updatedBy = req.user.id
  req.body.id = req.params.applicationConfigId
  try {
    await req.app.get('db').collection('application-configs').updateOne({
      id: req.params.applicationConfigId
    }, req.body)
    res.status(200).json(req.body)
  } catch (err) {
    return next(err)
  }
})

// Delete a applicationConfig
router.delete('/:applicationConfigId', async(req, res, next) => {
  if (!permissions(req.applicationConfig, 'delete', req.user)) return res.sendStatus(403)
  try {
    // TODO : Remove indexes
    await req.app.get('db').collection('application-configs').deleteOne({
      id: req.params.applicationConfigId
    })
    res.sendStatus(204)
  } catch (err) {
    return next(err)
  }
})

// retrieve a applicationConfig by its id
router.get('/:applicationConfigId/config', (req, res, next) => {
  res.status(200).send(req.applicationConfig.configuration || {})
})

// retrieve a applicationConfig by its id
router.put('/:applicationConfigId/config', async(req, res, next) => {
  if (!permissions(req.applicationConfig, 'writeConfig', req.user)) return res.sendStatus(403)
  await req.app.get('db').collection('application-configs').updateOne({
    id: req.params.applicationConfigId
  }, {
    $set: {
      configuration: req.body
    }
  })
  res.status(200).json(req.body)
})
