const express = require('express')
const auth = require('./auth')
const normalise = require('ajv-error-messages')
const moment = require('moment')
const slug = require('slug')
const soasLoader = require('soas')
const axios = require('axios')
const requestProxy = require('express-request-proxy')
const remoteServiceAPIDocs = require('../contract/remote-service-api-docs')
const matchstick = require('matchstick')

const ajv = require('ajv')()
const remoteServiceSchema = require('../contract/remote-service.js')
const validateRemoteService = ajv.compile(remoteServiceSchema)
const remoteServiceSchemaNoRequired = Object.assign(remoteServiceSchema)
delete remoteServiceSchemaNoRequired.required
const validateRemoteServiceNoRequired = ajv.compile(remoteServiceSchemaNoRequired)

const openApiSchema = require('../contract/openapi-3.0.json')
openApiSchema.$id = openApiSchema.$id + '-2' // dirty hack to handle ajv error
const validateOpenApi = ajv.compile(openApiSchema)

const permissions = require('./utils/permissions')
const usersUtils = require('./utils/users')
const findUtils = require('./utils/find')
const asyncWrap = require('./utils/async-wrap')

const router = module.exports = express.Router()

// TODO: explain ? simplify ? hard to understand piece of code
const computeActions = (apiDoc) => {
  const actions = soasLoader(apiDoc).actions()
  actions.forEach(a => {
    a.input = Object.keys(a.input).map(concept => Object.assign({
      concept: concept
    }, a.input[concept]))
    a.output = Object.keys(a.output).map(concept => Object.assign({
      concept: concept
    }, a.output[concept]))
  })
  return actions
}

// Get the list of remote-services
router.get('', auth.optionalJwtMiddleware, asyncWrap(async(req, res) => {
  const remoteServices = req.app.get('db').collection('remote-services')
  const query = findUtils.query(req.query, {
    'input-concepts': 'actions.input.concept',
    'output-concepts': 'actions.output.concept',
    'api-id': 'apiDoc.info.x-api-id'
  })
  const sort = findUtils.sort(req.query.sort)
  const [skip, size] = findUtils.pagination(req.query)
  query.$or = permissions.filter(req.user)
  let mongoQueries = [
    size > 0 ? remoteServices.find(query).limit(size).skip(skip).sort(sort).project({_id: 0, permissions: 0}).toArray() : Promise.resolve([]),
    remoteServices.find(query).count()
  ]
  const [results, count] = await Promise.all(mongoQueries)
  res.json({results, count})
}))

// Create an remote Api
router.post('', auth.jwtMiddleware, asyncWrap(async(req, res) => {
  if (!req.body.apiDoc || !req.body.apiDoc.info || !req.body.apiDoc.info['x-api-id']) return res.sendStatus(400)
  const baseId = req.body.id || slug(req.body.apiDoc.info['x-api-id'], {lower: true})
  req.body.id = baseId
  let i = 1
  do {
    if (i > 1) req.body.id = baseId + i
    var dbExists = await req.app.get('db').collection('remote-services').count({id: req.body.id})
    i += 1
  } while (dbExists)
  req.body.owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(req.body.owner, 'postRemoteService', req.user, req.app.get('db'))) return res.sendStatus(403)
  var valid = validateRemoteService(req.body)
  if (!valid) return res.status(400).send(normalise(validateRemoteService.errors))
  const date = moment().toISOString()
  req.body.createdAt = date
  req.body.createdBy = req.user.id
  req.body.updatedAt = date
  req.body.updatedBy = req.user.id
  if (req.body.apiDoc) {
    if (req.body.apiDoc.info) {
      req.body.title = req.body.apiDoc.info.title
      req.body.description = req.body.apiDoc.info.description
    }
    req.body.actions = computeActions(req.body.apiDoc)
  }
  await req.app.get('db').collection('remote-services').insertOne(req.body)
  res.status(201).json(req.body)
}))

// Middlewares
router.use('/:remoteServiceId', auth.optionalJwtMiddleware, asyncWrap(async(req, res, next) => {
  req.remoteService = await req.app.get('db').collection('remote-services').findOne({
    id: req.params.remoteServiceId
  }, {
    fields: {
      _id: 0
    }
  })
  if (!req.remoteService) return res.status(404).send('Remote Api not found')
  next()
}))

router.use('/:remoteServiceId/permissions', permissions.router('remote-services', 'remoteService'))

// retrieve a remoteService by its id
router.get('/:remoteServiceId', (req, res, next) => {
  if (!permissions.can(req.remoteService, 'readDescription', req.user)) return res.sendStatus(403)
  delete req.remoteService.permissions
  res.status(200).send(req.remoteService)
})

// Update a remote service configuration
router.patch('/:remoteServiceId', asyncWrap(async(req, res) => {
  if (!permissions.can(req.remoteService, 'writeDescription', req.user)) return res.sendStatus(403)
  var valid = validateRemoteServiceNoRequired(req.body)
  if (!valid) return res.status(400).send(validateRemoteServiceNoRequired.errors)

  const forbiddenKey = Object.keys(req.body).find(key => {
    return ['apiDoc', 'url', 'apiKey', 'server', 'description', 'title'].indexOf(key) === -1
  })
  if (forbiddenKey) return res.status(400).send('Only some parts of the remote service configuration can be modified through this route')

  req.body.updatedAt = moment().toISOString()
  req.body.updatedBy = req.user.id
  if (req.body.apiDoc) {
    req.body.actions = computeActions(req.body.apiDoc)
  }

  await req.app.get('db').collection('remote-services').updateOne({id: req.params.remoteServiceId}, {'$set': req.body})
  res.status(200).json(req.body)
}))

// Delete a remoteService
router.delete('/:remoteServiceId', asyncWrap(async(req, res) => {
  if (!permissions.can(req.remoteService, 'delete', req.user)) return res.sendStatus(403)

  // TODO : Remove indexes
  await req.app.get('db').collection('remote-services').deleteOne({
    id: req.params.remoteServiceId
  })
  res.sendStatus(204)
}))

router.post('/:remoteServiceId/_update', asyncWrap(async(req, res) => {
  if (!permissions.can(req.remoteService, 'writeDescription', req.user)) return res.sendStatus(403)
  if (!req.remoteService.url) return res.sendStatus(204)

  const reponse = await axios.get(req.remoteService.url)
  var valid = validateOpenApi(reponse.data)
  if (!valid) return res.status(400).send(normalise(validateOpenApi.errors))
  req.remoteService.updatedAt = moment().toISOString()
  req.remoteService.updatedBy = req.user.id
  req.remoteService.apiDoc = reponse.data
  req.remoteService.actions = computeActions(req.remoteService.apiDoc)
  await req.app.get('db').collection('remote-services').updateOne({
    id: req.params.remoteServiceId
  }, req.remoteService)
  res.status(200).json(req.remoteService)
}))

router.use('/:remoteServiceId/proxy*', (req, res, next) => {
  // console.log(req.remoteService.apiDoc.paths)
  const paths = Object.keys(req.remoteService.apiDoc.paths).filter(path => {
    const ms = matchstick(path, 'template')
    return ms.match(req.params['0'])
  }).map(path => req.remoteService.apiDoc.paths[path])
  if (paths.length === 1) {
    const operation = paths.pop()[req.method.toLowerCase()]
    if (!permissions.can(req.remoteService, operation.operationId, req.user)) return res.sendStatus(403)
    // console.log((req.user && req.user.email) || 'Anonymous', 'is using operation', operation.operationId)
    const options = {
      url: req.remoteService.server + '*',
      headers: {}
    }
    // TODO handle query & cookie header types
    if (req.remoteService.apiKey.in === 'header') {
      options.headers[req.remoteService.apiKey.name] = req.remoteService.apiKey.value
    }
    // transmit organization id as it tends to complement authorization information
    if (req.remoteService.owner.type === 'organization') {
      options.headers['x-organizationId'] = req.remoteService.owner.id
    }

    requestProxy(options)(req, res, next)
  } else {
    console.log('Error, path length is not 1 :', paths)
    next(new Error())
  }
})

router.get('/:remoteServiceId/api-docs.json', (req, res) => {
  res.send(remoteServiceAPIDocs(req.remoteService))
})
