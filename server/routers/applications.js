const express = require('express')
const slug = require('slug')
const moment = require('moment')
const auth = require('./auth')
const applicationAPIDocs = require('../../contract/application-api-docs')

const ajv = require('ajv')()
const applicationSchema = require('../../contract/application.json')
const applicationSchemaNoRequired = Object.assign(applicationSchema)
delete applicationSchemaNoRequired.required
const validate = ajv.compile(applicationSchema)
const validateNoRequired = ajv.compile(applicationSchemaNoRequired)

const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')

const router = module.exports = express.Router()

// Get the list of applications
router.get('', auth.optionalJwtMiddleware, asyncWrap(async(req, res) => {
  const applications = req.app.get('db').collection('applications')
  if (!req.user) {
    // If we want to respond a 401, then we should change auth middleware
    return res.json({
      results: [],
      count: 0
    })
  }
  const query = findUtils.query(req.query, {
    'ids': 'id'
  })
  const sort = findUtils.sort(req.query.sort)
  const [skip, size] = findUtils.pagination(req.query)
  query.$or = permissions.filter(req.user, req.query.public === 'true')
  let mongoQueries = [
    size > 0 ? applications.find(query).limit(size).skip(skip).sort(sort).project({
      _id: 0,
      configuration: 0
    }).toArray() : Promise.resolve([]),
    applications.find(query).count()
  ]
  let [results, count] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list(r, req.user)
    r.public = r.userPermissions.public === 'all' || r.userPermissions.public.indexOf('readDescription') >= 0
    delete r.permissions
  })
  res.json({results, count})
}))

// Create an application configuration
router.post('', auth.jwtMiddleware, asyncWrap(async(req, res) => {
  const application = req.body
  // This id is temporary, we should have an human understandable id, or perhaps manage it UI side ?
  if (!application.url) return res.sendStatus(400)
  const toks = application.url.split('/')
  const lastUrlPart = toks[toks.length - 1]
  const baseId = application.id || slug(application.applicationName || application.title || lastUrlPart, {lower: true})
  application.id = baseId
  let i = 1
  do {
    if (i > 1) application.id = baseId + i
    var dbExists = await req.app.get('db').collection('applications').count({id: application.id})
    i += 1
  } while (dbExists)
  application.owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(application.owner, 'postApplication', req.user, req.app.get('db'))) return res.sendStatus(403)
  var valid = validate(application)
  if (!valid) return res.status(400).send(validate.errors)
  const date = moment().toISOString()
  application.createdAt = date
  application.createdBy = req.user.id
  application.updatedAt = date
  application.updatedBy = req.user.id

  application.permissions = []

  // Make sure the creator can work on the resource he just created
  // even if he created it in an organization
  if (application.owner.type === 'organization') {
    application.permissions.push({
      type: 'user',
      id: req.user.id,
      operations: []
    })
  }

  await req.app.get('db').collection('applications').insertOne(application)
  res.status(201).json(application)
}))

// Middlewares
router.use('/:applicationId', auth.optionalJwtMiddleware, asyncWrap(async(req, res, next) => {
  req.application = req.resource = await req.app.get('db').collection('applications').findOne({
    id: req.params.applicationId
  }, {
    fields: {
      _id: 0
    }
  })
  if (!req.application) return res.status(404).send('Application configuration not found')
  req.resourceApiDoc = applicationAPIDocs(req.application)
  next()
}))

router.use('/:applicationId/permissions', permissions.router('applications', 'application'))

// retrieve a application by its id
router.get('/:applicationId', permissions.middleware('readDescription'), (req, res, next) => {
  req.application.userPermissions = permissions.list(req.application, req.user)
  delete req.application.permissions
  delete req.application.configuration
  res.status(200).send(req.application)
})

// Update an application configuration
router.patch('/:applicationId', permissions.middleware('writeDescription'), asyncWrap(async(req, res) => {
  const patch = req.body
  var valid = validateNoRequired(patch)
  if (!valid) return res.status(400).send(validateNoRequired.errors)

  const forbiddenKey = Object.keys(patch).find(key => {
    return ['configuration', 'url', 'description', 'title'].indexOf(key) === -1
  })
  if (forbiddenKey) return res.status(400).send('Only some parts of the application configuration can be modified through this route')

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = req.user.id

  await req.app.get('db').collection('applications').updateOne({id: req.params.applicationId}, {'$set': patch})
  res.status(200).json(patch)
}))

// Delete an application configuration
router.delete('/:applicationId', permissions.middleware('delete'), asyncWrap(async(req, res) => {
  await req.app.get('db').collection('applications').deleteOne({
    id: req.params.applicationId
  })
  res.sendStatus(204)
}))

// retrieve a application by its id
router.get('/:applicationId/config', permissions.middleware('readConfig'), (req, res, next) => {
  res.status(200).send(req.application.configuration || {})
})

// retrieve a application by its id
router.put('/:applicationId/config', permissions.middleware('writeConfig'), asyncWrap(async(req, res) => {
  await req.app.get('db').collection('applications').updateOne(
    {id: req.params.applicationId},
    {$set: {configuration: req.body}}
  )
  res.status(200).json(req.body)
}))

router.get('/:applicationId/api-docs.json', permissions.middleware('readDescription'), (req, res) => {
  res.send(applicationAPIDocs(req.application))
})
