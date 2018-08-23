const express = require('express')
const normalise = require('ajv-error-messages')
const moment = require('moment')
const slug = require('slugify')
const soasLoader = require('soas')
const axios = require('axios')
const requestProxy = require('express-request-proxy')
const remoteServiceAPIDocs = require('../../contract/remote-service-api-docs')
const matchstick = require('matchstick')
const mongoEscape = require('mongo-escape')
const config = require('config')
const { URL } = require('url')

const ajv = require('ajv')()
const remoteServiceSchema = require('../../contract/remote-service')
const validateRemoteService = ajv.compile(remoteServiceSchema)
const remoteServiceSchemaNoRequired = Object.assign(remoteServiceSchema)
delete remoteServiceSchemaNoRequired.required
const validateRemoteServiceNoRequired = ajv.compile(remoteServiceSchemaNoRequired)

const openApiSchema = require('../../contract/openapi-3.0.json')
openApiSchema.$id = openApiSchema.$id + '-2' // dirty hack to handle ajv error
const validateOpenApi = ajv.compile(openApiSchema)

const permissions = require('../utils/permissions')
const usersUtils = require('../utils/users')
const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const clone = require('fast-clone')

const router = module.exports = express.Router()

// TODO: explain ? simplify ? hard to understand piece of code
const computeActions = (apiDoc) => {
  const actions = soasLoader(apiDoc).actions()
  actions.forEach(a => {
    a.input = Object.keys(a.input).map(concept => ({concept, ...a.input[concept]}))
    const outputSchema = a.outputSchema
    if (outputSchema) {
      const outputProps = a.outputSchema.properties || (a.outputSchema.items && a.outputSchema.items.properties) || {}
      a.output = Object.keys(outputProps).map(prop => ({name: prop, concept: outputProps[prop]['x-refersTo'], ...outputProps[prop]}))
    } else {
      a.output = []
    }
  })
  return actions
}

const operationsClasses = {
  list: ['list'],
  read: ['readDescription', 'readApiDoc'],
  write: ['writeDescription', 'updateApiDoc'],
  admin: ['delete', 'getPermissions', 'setPermissions'],
  use: []
}

// Get the list of remote-services
router.get('', asyncWrap(async(req, res) => {
  const remoteServices = req.app.get('db').collection('remote-services')
  const query = findUtils.query(req, {
    'input-concepts': 'actions.input.concept',
    'output-concepts': 'actions.output.concept',
    'api-id': 'apiDoc.info.x-api-id'
  })
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select, ['apiDoc'])
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? remoteServices.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    remoteServices.find(query).count()
  ]
  if (req.query.facets) {
    const q = clone(query)
    if (req.query.owner) q.$and.pop()
    mongoQueries.push(remoteServices.aggregate(findUtils.facetsQuery(req.query.facets, q)).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => {
    r.userPermissions = permissions.list(r, operationsClasses, req.user)
    r.public = permissions.isPublic(r, operationsClasses)
    delete r.permissions
    findUtils.setResourceLinks(r, 'remote-service')
  })
  facets = findUtils.parseFacets(facets)
  res.json({results: results.map(result => mongoEscape.unescape(result, true)), count, facets})
}))

// Create an remote Api
router.post('', asyncWrap(async(req, res) => {
  const service = req.body
  if (!service.apiDoc || !service.apiDoc.info || !service.apiDoc.info['x-api-id']) return res.sendStatus(400)
  const baseId = service.id || slug(service.apiDoc.info['x-api-id'], {lower: true})
  service.id = baseId
  let i = 1
  do {
    if (i > 1) service.id = baseId + i
    var dbExists = await req.app.get('db').collection('remote-services').count({id: service.id})
    i += 1
  } while (dbExists)
  service.owner = usersUtils.owner(req)
  if (!permissions.canDoForOwner(service.owner, 'postRemoteService', req.user, req.app.get('db'))) return res.sendStatus(403)
  var valid = validateRemoteService(service)
  if (!valid) return res.status(400).send(normalise(validateRemoteService.errors))
  const date = moment().toISOString()
  service.createdAt = date
  service.createdBy = {id: req.user.id, name: req.user.name}
  service.updatedAt = date
  service.updatedBy = {id: req.user.id, name: req.user.name}
  if (service.apiDoc) {
    if (service.apiDoc.info) {
      service.title = service.apiDoc.info.title
      service.description = service.apiDoc.info.description
    }
    service.actions = computeActions(service.apiDoc)
  }
  service.permissions = []

  await req.app.get('db').collection('remote-services').insertOne(mongoEscape.escape(service, true))
  res.status(201).json(service)
}))

// Middlewares
router.use('/:remoteServiceId', asyncWrap(async(req, res, next) => {
  const service = await req.app.get('db').collection('remote-services').findOne({
    id: req.params.remoteServiceId
  }, {
    fields: {
      _id: 0
    }
  })
  if (!service) return res.status(404).send('Remote Api not found')
  findUtils.setResourceLinks(service, 'remote-service')
  req.remoteService = req.resource = mongoEscape.unescape(service, true)
  req.resourceApiDoc = remoteServiceAPIDocs(req.remoteService)
  next()
}))

router.use('/:remoteServiceId/permissions', permissions.router('remote-services', 'remoteService'))

// retrieve a remoteService by its id
router.get('/:remoteServiceId', permissions.middleware('readDescription', 'read'), (req, res, next) => {
  req.remoteService.userPermissions = permissions.list(req.remoteService, operationsClasses, req.user)
  delete req.remoteService.permissions
  res.status(200).send(req.remoteService)
})

// Update a remote service configuration
router.patch('/:remoteServiceId', permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const patch = req.body
  var valid = validateRemoteServiceNoRequired(patch)
  if (!valid) return res.status(400).send(validateRemoteServiceNoRequired.errors)

  const forbiddenKey = Object.keys(patch).find(key => {
    return ['apiDoc', 'url', 'apiKey', 'server', 'description', 'title', 'parameters'].indexOf(key) === -1
  })
  if (forbiddenKey) return res.status(400).send('Only some parts of the remote service configuration can be modified through this route')

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = {id: req.user.id, name: req.user.name}
  if (patch.apiDoc) {
    patch.actions = computeActions(patch.apiDoc)
  }

  await req.app.get('db').collection('remote-services').updateOne({id: req.params.remoteServiceId}, {'$set': mongoEscape.escape(patch, true)})
  res.status(200).json(patch)
}))

// Delete a remoteService
router.delete('/:remoteServiceId', permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  // TODO : Remove indexes
  await req.app.get('db').collection('remote-services').deleteOne({
    id: req.params.remoteServiceId
  })
  res.sendStatus(204)
}))

router.post('/:remoteServiceId/_update', permissions.middleware('updateApiDoc', 'write'), asyncWrap(async(req, res) => {
  if (!req.remoteService.url) return res.sendStatus(204)

  const reponse = await axios.get(req.remoteService.url)
  var valid = validateOpenApi(reponse.data)
  if (!valid) return res.status(400).send(normalise(validateOpenApi.errors))
  req.remoteService.updatedAt = moment().toISOString()
  req.remoteService.updatedBy = {id: req.user.id, name: req.user.name}
  req.remoteService.apiDoc = reponse.data
  req.remoteService.actions = computeActions(req.remoteService.apiDoc)
  await req.app.get('db').collection('remote-services').replaceOne({
    id: req.params.remoteServiceId
  }, mongoEscape.escape(req.remoteService, true))
  res.status(200).json(req.remoteService)
}))

const publicOrigin = new URL(config.publicUrl).origin
router.use('/:remoteServiceId/proxy*', (req, res, next) => {
  // Match the path with an operation from the doc
  const operationPath = Object.keys(req.remoteService.apiDoc.paths).filter(path => {
    const ms = matchstick(path, 'template')
    return ms.match(req.params['0'])
  }).map(path => req.remoteService.apiDoc.paths[path])[0]

  // If the operation exists, apply permissions
  if (operationPath) {
    const operation = operationPath[req.method.toLowerCase()]
    if (!permissions.can(req.remoteService, operation.operationId, 'use', req.user)) return res.sendStatus(403)
  }

  // console.log((req.user && req.user.email) || 'Anonymous', 'is using operation', operation.operationId)
  const options = {
    url: req.remoteService.server + '*',
    headers: {'x-forwarded-url': `${config.publicUrl}/api/v1/remote-services/${req.remoteService.id}/proxy/`},
    query: {}
  }
  // Add static parameters values from configuration
  if (req.remoteService.parameters) {
    req.remoteService.parameters
      .filter(param => !!param.value)
      .forEach(param => {
        options.query[param.name] = param.value
      })
  }
  // TODO handle query & cookie header types
  if (req.remoteService.apiKey.in === 'header') {
    if (req.remoteService.apiKey.value) {
      options.headers[req.remoteService.apiKey.name] = req.remoteService.apiKey.value
    } else if (config.defaultRemoteKey) {
      options.headers[req.remoteService.apiKey.name] = config.defaultRemoteKey
    }
  }
  // transmit organization id as it tends to complement authorization information
  if (req.remoteService.owner.type === 'organization') {
    options.headers['x-organizationId'] = req.remoteService.owner.id
    options.headers['x-organizationName'] = req.remoteService.owner.name
  }
  if (req.remoteService.owner.type === 'user') {
    options.headers['x-userId'] = req.remoteService.owner.id
    options.headers['x-userName'] = req.remoteService.owner.name
  }
  // Only transmit Authorization header if the current service and the remoteService are from the same domain
  // Not sure this is the right policy. But always sending Authorization header results in 401 errors
  // and could be considered a security breach
  // TODO: same for cookies ?
  if (req.headers.authorization) {
    const remoteOrigin = new URL(req.remoteService.server).origin
    if (remoteOrigin !== publicOrigin) {
      delete req.headers.authorization
      delete req.headers.cookie
    }
  }

  requestProxy(options)(req, res, next)
})

router.get('/:remoteServiceId/api-docs.json', permissions.middleware('readApiDoc', 'read'), (req, res) => {
  res.send(req.resourceApiDoc)
})
