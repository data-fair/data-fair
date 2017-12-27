const express = require('express')
const auth = require('./auth')
const moment = require('moment')
const shortid = require('shortid')

const ajv = require('ajv')()
const applicationConfigSchema = require('../contract/application-config.json')
const validate = ajv.compile(applicationConfigSchema)

const permissions = require('./utils/permissions')
const usersUtils = require('./utils/users')
const findUtils = require('./utils/find')

const router = module.exports = express.Router()

// Get the list of application-configs
router.get('', auth.optionalJwtMiddleware, async function(req, res, next) {
  const applicationConfigs = req.app.get('db').collection('application-configs')
  if (!req.user) {
    // If we want to respond a 401, then we should change auth middleware
    return res.json({
      results: [],
      count: 0
    })
  }
  const query = findUtils.query(req.query, {})
  const sort = findUtils.sort(req.query.sort)
  const [skip, size] = findUtils.pagination(req.query)
  query.$or = permissions.filter(req.user)
  let mongoQueries = [
    size > 0 ? applicationConfigs.find(query).limit(size).skip(skip).sort(sort).project({
      _id: 0,
      source: 0
    }).toArray() : Promise.resolve([]),
    applicationConfigs.find(query).count()
  ]
  try {
    let [results, count] = await Promise.all(mongoQueries)
    res.json({results, count})
  } catch (err) {
    next(err)
  }
})

// Create an application configuration
router.post('', auth.jwtMiddleware, async(req, res, next) => {
  // This id is temporary, we should have an human understandable id, or perhaps manage it UI side ?
  req.body.id = req.body.id || shortid.generate()
  req.body.owner = usersUtils.owner(req)
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
  if (!permissions.can(req.applicationConfig, 'readDescription', req.user)) return res.sendStatus(403)
  res.status(200).send(req.applicationConfig)
})

// update a applicationConfig
// TODO: prevent overwriting owner and maybe other calculated fields.. A PATCH route like in datasets ?
router.put('/:applicationConfigId', async(req, res, next) => {
  if (!permissions.can(req.applicationConfig, 'writeDescription', req.user)) return res.sendStatus(403)
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
  if (!permissions.can(req.applicationConfig, 'delete', req.user)) return res.sendStatus(403)
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
  if (!permissions.can(req.applicationConfig, 'writeConfig', req.user)) return res.sendStatus(403)
  await req.app.get('db').collection('application-configs').updateOne({
    id: req.params.applicationConfigId
  }, {
    $set: {
      configuration: req.body
    }
  })
  res.status(200).json(req.body)
})
