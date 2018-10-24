const express = require('express')
const ajvErrorMessages = require('ajv-error-messages')
const moment = require('moment')
const slug = require('slugify')
const soasLoader = require('soas')
const axios = require('axios')
const requestProxy = require('express-request-proxy')
const remoteServiceAPIDocs = require('../../contract/remote-service-api-docs')
const matchstick = require('matchstick')
const mongoEscape = require('mongo-escape')
const config = require('config')

const ajv = require('ajv')()
const validate = ajv.compile(require('../../contract/remote-service'))
const servicePatch = require('../../contract/remote-service-patch')
const validatePatch = ajv.compile(servicePatch)
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
    a.input = Object.keys(a.input).map(concept => ({ concept, ...a.input[concept] }))
    const outputSchema = a.outputSchema
    if (outputSchema) {
      const outputProps = a.outputSchema.properties || (a.outputSchema.items && a.outputSchema.items.properties) || {}
      a.output = Object.keys(outputProps).map(prop => ({ name: prop, concept: outputProps[prop]['x-refersTo'], ...outputProps[prop] }))
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
    remoteServices.countDocuments(query)
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
  res.json({ results: results.map(result => mongoEscape.unescape(result, true)), count, facets })
}))

const initNew = (req) => {
  const service = { ...req.body }
  service.owner = usersUtils.owner(req)
  const date = moment().toISOString()
  service.createdAt = service.updatedAt = date
  service.createdBy = service.updatedBy = { id: req.user.id, name: req.user.name }
  if (service.apiDoc) {
    if (service.apiDoc.info) {
      service.title = service.apiDoc.info.title
      service.description = service.apiDoc.info.description
    }
    service.actions = computeActions(service.apiDoc)
  }
  service.permissions = []
  return service
}

// Create a remote Api
router.post('', asyncWrap(async(req, res) => {
  const service = initNew(req)
  if (!permissions.canDoForOwner(service.owner, 'postRemoteService', req.user, req.app.get('db'))) return res.sendStatus(403)
  if (!validate(service)) return res.status(400).send(ajvErrorMessages(validate.errors))

  // Generate ids and try insertion until there is no conflict on id
  const baseId = service.id || slug(service.apiDoc.info['x-api-id'], { lower: true })
  service.id = baseId
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await req.app.get('db').collection('remote-services').insertOne(mongoEscape.escape(service, true))
      insertOk = true
    } catch (err) {
      if (err.code !== 11000) throw err
      i += 1
      service.id = `${baseId}-${i}`
    }
  }

  findUtils.setResourceLinks(service, 'remote-service')
  res.status(201).json(service)
}))

// Create default services for the user and all his organizations, if necessary
router.post('/_default_services', asyncWrap(async(req, res) => {
  if (!req.user) return res.sendStatus(401)
  const remoteServices = req.app.get('db').collection('remote-services')
  const query = { $or: [{ 'owner.type': 'user', 'owner.id': req.user.id }] }
  if (req.user.organizations && req.user.organizations.length) {
    query.$or.push({
      'owner.type': 'organization',
      'owner.id': { $in: req.user.organizations.map(o => o.id) }
    })
  }
  const existingServices = await remoteServices.find(query).project({ owner: 1, url: 1 }).toArray()

  const owners = [{ type: 'user', id: req.user.id, name: req.user.name }]
    .concat((req.user.organizations || []).map(o => ({ type: 'organization', id: o.id, name: o.name })))
  const ownerServices = [].concat(...owners.map(o => config.remoteServices.map(s => ({ owner: o, url: s.href, title: s.title }))))

  const servicesToAdd = ownerServices
    // exclude service with this owner and url
    .filter(os => !existingServices.find(es => es.owner.type === os.owner.type && es.owner.id === os.owner.id && es.url === os.url))

  const apisToFetch = new Set(servicesToAdd.map(s => s.url))
  const apisPromises = [...apisToFetch].map(url => {
    return axios.get(url)
      .then(resp => ({ url, api: resp.data }))
      .catch(err => console.error('Failure to init remote service', err))
  })
  const apis = (await Promise.all(apisPromises)).filter(a => a && a.api)
  const apisDict = Object.assign({}, ...apis.map(a => ({ [a.url]: a.api })))
  const servicesToInsert = servicesToAdd.filter(s => apisDict[s.url]).map(s => mongoEscape.escape({
    id: slug(apisDict[s.url].info['x-api-id']) + '-' + s.owner.type + '-' + s.owner.id,
    title: apisDict[s.url].info.title,
    description: apisDict[s.url].info.description,
    url: s.url,
    apiDoc: apisDict[s.url],
    server: apisDict[s.url].servers && apisDict[s.url].servers.length && apisDict[s.url].servers[0].url,
    actions: computeActions(apisDict[s.url]),
    owner: Object.assign(s.owner.type === 'organization' ? { role: config.adminRole } : {}, s.owner),
    permissions: (s.owner.type === 'organization' ? [{
      type: 'organization',
      id: s.owner.id,
      name: s.owner.name,
      classes: ['list', 'read', 'use'],
      roles: []
    }] : [])
  }, true))
  if (servicesToInsert.length) await remoteServices.insertMany(servicesToInsert)
  res.status(201).json(`Added ${servicesToInsert.length} services`)
}))

// Shared middleware
const readService = asyncWrap(async(req, res, next) => {
  const service = await req.app.get('db').collection('remote-services')
    .findOne({ id: req.params.remoteServiceId }, { projection: { _id: 0 } })
  if (!service) return res.status(404).send('Remote Api not found')
  findUtils.setResourceLinks(service, 'remote-service')
  req.remoteService = req.resource = mongoEscape.unescape(service, true)
  req.resourceApiDoc = remoteServiceAPIDocs(req.remoteService)
  next()
})

router.use('/:remoteServiceId/permissions', readService, permissions.router('remote-services', 'remoteService'))

// retrieve a remoteService by its id
router.get('/:remoteServiceId', readService, permissions.middleware('readDescription', 'read'), (req, res, next) => {
  req.remoteService.userPermissions = permissions.list(req.remoteService, operationsClasses, req.user)
  delete req.remoteService.permissions
  res.status(200).send(req.remoteService)
})

// PUT used to create or update
const attemptInsert = asyncWrap(async(req, res, next) => {
  const newService = initNew(req)
  newService.id = req.params.remoteServiceId
  if (!validate(newService)) return res.status(400).send(ajvErrorMessages(validate.errors))

  // Try insertion if the user is authorized, in case of conflict go on with the update scenario
  if (permissions.canDoForOwner(newService.owner, 'postRemoteService', req.user, req.app.get('db'))) {
    try {
      await req.app.get('db').collection('remote-services').insertOne(mongoEscape.escape(newService, true))
      findUtils.setResourceLinks(newService, 'remote-service')
      return res.status(201).json(newService)
    } catch (err) {
      if (err.code !== 11000) throw err
    }
  }
  next()
})
router.put('/:remoteServiceId', attemptInsert, readService, permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const newService = req.body
  // preserve all readonly properties, the rest is overwritten
  Object.keys(req.remoteService).forEach(key => {
    if (!servicePatch.properties[key]) {
      newService[key] = req.remoteService[key]
    }
  })
  newService.updatedAt = moment().toISOString()
  newService.updatedBy = { id: req.user.id, name: req.user.name }
  if (newService.apiDoc) {
    newService.actions = computeActions(newService.apiDoc)
  }
  await req.app.get('db').collection('remote-services').replaceOne({ id: req.params.remoteServiceId }, mongoEscape.escape(newService, true))
  findUtils.setResourceLinks(newService, 'remote-service')
  res.status(200).json(newService)
}))

// Update a remote service configuration
router.patch('/:remoteServiceId', readService, permissions.middleware('writeDescription', 'write'), asyncWrap(async(req, res) => {
  const patch = req.body
  var valid = validatePatch(patch)
  if (!valid) return res.status(400).send(validatePatch.errors)

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }
  if (patch.apiDoc) {
    patch.actions = computeActions(patch.apiDoc)
  }

  await req.app.get('db').collection('remote-services').updateOne({ id: req.params.remoteServiceId }, { '$set': mongoEscape.escape(patch, true) })
  res.status(200).json(patch)
}))

// Delete a remoteService
router.delete('/:remoteServiceId', readService, permissions.middleware('delete', 'admin'), asyncWrap(async(req, res) => {
  // TODO : Remove indexes
  await req.app.get('db').collection('remote-services').deleteOne({
    id: req.params.remoteServiceId
  })
  res.sendStatus(204)
}))

router.post('/:remoteServiceId/_update', readService, permissions.middleware('updateApiDoc', 'write'), asyncWrap(async(req, res) => {
  if (!req.remoteService.url) return res.sendStatus(204)

  const reponse = await axios.get(req.remoteService.url)
  var valid = validateOpenApi(reponse.data)
  if (!valid) return res.status(400).send(ajvErrorMessages(validateOpenApi.errors))
  req.remoteService.updatedAt = moment().toISOString()
  req.remoteService.updatedBy = { id: req.user.id, name: req.user.name }
  req.remoteService.apiDoc = reponse.data
  req.remoteService.actions = computeActions(req.remoteService.apiDoc)
  await req.app.get('db').collection('remote-services').replaceOne({
    id: req.params.remoteServiceId
  }, mongoEscape.escape(req.remoteService, true))
  res.status(200).json(req.remoteService)
}))

router.use('/:remoteServiceId/proxy*', readService, (req, res, next) => {
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
    headers: { 'x-forwarded-url': `${config.publicUrl}/api/v1/remote-services/${req.remoteService.id}/proxy/` },
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
  if (req.remoteService.apiKey && req.remoteService.apiKey.in === 'header' && req.remoteService.apiKey.value) {
    options.headers[req.remoteService.apiKey.name] = req.remoteService.apiKey.value
  } else if (config.defaultRemoteKey.in === 'header' && config.defaultRemoteKey.value) {
    options.headers[config.defaultRemoteKey.name] = config.defaultRemoteKey.value
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

  // We never transmit authentication
  delete req.headers.authorization
  delete req.headers.cookie

  requestProxy(options)(req, res, next)
})

router.get('/:remoteServiceId/api-docs.json', readService, permissions.middleware('readApiDoc', 'read'), (req, res) => {
  res.send(req.resourceApiDoc)
})
