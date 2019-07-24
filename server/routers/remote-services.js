const { Transform } = require('stream')
const express = require('express')
const moment = require('moment')
const url = require('url')
const slug = require('slugify')
const soasLoader = require('soas')
const axios = require('axios')
const requestProxy = require('express-request-proxy')
const remoteServiceAPIDocs = require('../../contract/remote-service-api-docs')
const mongoEscape = require('mongo-escape')
const config = require('config')
const { RateLimiterMongo } = require('rate-limiter-flexible')
const requestIp = require('request-ip')

const ajv = require('ajv')()
const validate = ajv.compile(require('../../contract/remote-service'))
const servicePatch = require('../../contract/remote-service-patch')
const validatePatch = ajv.compile(servicePatch)
const openApiSchema = require('../../contract/openapi-3.0.json')
openApiSchema.$id = openApiSchema.$id + '-2' // dirty hack to handle ajv error
const validateOpenApi = ajv.compile(openApiSchema)

const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const cacheHeaders = require('../utils/cache-headers')

const debug = require('debug')('remote-services')

const router = exports.router = express.Router()

// Create default services for the data-fair instance
exports.init = async(db) => {
  const remoteServices = db.collection('remote-services')
  const existingServices = await remoteServices.find({ owner: { $exists: false } }).limit(1000).project({ url: 1, id: 1 }).toArray()

  const servicesToAdd = config.remoteServices
    .filter(s => !existingServices.find(es => es.url === s.url))

  const apisToFetch = new Set(servicesToAdd.map(s => s.url))
  const apisPromises = [...apisToFetch].map(url => {
    return axios.get(url)
      .then(resp => ({ url, api: resp.data }))
      .catch(err => console.error('Failure to init remote service', err))
  })
  const apis = (await Promise.all(apisPromises)).filter(a => a && a.api)
  const apisDict = Object.assign({}, ...apis.map(a => ({ [a.url]: a.api })))
  const servicesToInsert = servicesToAdd.filter(s => apisDict[s.url]).map(s => mongoEscape.escape({
    id: slug(apisDict[s.url].info['x-api-id']),
    title: apisDict[s.url].info.title,
    description: apisDict[s.url].info.description,
    url: s.url,
    apiDoc: apisDict[s.url],
    server: apisDict[s.url].servers && apisDict[s.url].servers.length && apisDict[s.url].servers[0].url,
    actions: computeActions(apisDict[s.url])
  }, true)).filter(s => !existingServices.find(es => es.id === s.id))
  if (servicesToInsert.length) await remoteServices.insertMany(servicesToInsert)
}

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

function clean(remoteService) {
  delete remoteService._id
  if (remoteService.apiKey && remoteService.apiKey.value) remoteService.apiKey.value = '**********'
  findUtils.setResourceLinks(remoteService, 'remote-service')
  return remoteService
}

// Get the list of remote-services
// Accessible to anybody
router.get('', cacheHeaders.noCache, asyncWrap(async(req, res) => {
  const remoteServices = req.app.get('db').collection('remote-services')
  const query = findUtils.query(req, {
    'input-concepts': 'actions.input.concept',
    'output-concepts': 'actions.output.concept',
    'api-id': 'apiDoc.info.x-api-id',
    'ids': 'id',
    'id': 'id'
  }, true)
  delete req.query.owner
  query.owner = { $exists: false } // restrict to the newly centralized remote services
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select, ['apiDoc'])
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? remoteServices.find(query).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    remoteServices.countDocuments(query)
  ]
  if (req.query.facets) {
    mongoQueries.push(remoteServices.aggregate(findUtils.facetsQuery(req, {})).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => clean(r))
  facets = findUtils.parseFacets(facets)
  res.json({ count, results: results.map(result => mongoEscape.unescape(result, true)), facets })
}))

const initNew = (req) => {
  const service = { ...req.body }
  if (service.apiDoc) {
    if (service.apiDoc.info) {
      service.title = service.title || service.apiDoc.info.title
      service.description = service.apiDoc.info.description
    }
    service.actions = computeActions(service.apiDoc)
  }
  return service
}

// Create a remote Api as super admin
router.post('', asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  // if title is set, we build id from it
  if (req.body.title && !req.body.id) req.body.id = slug(req.body.title, { lower: true })
  const service = initNew(req)
  if (!validate(service)) return res.status(400).send(validate.errors)

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
      if (err.code !== 11000 || !err.errmsg.includes('x-api-id')) throw err
      i += 1
      service.id = `${baseId}-${i}`
    }
  }

  res.status(201).json(clean(service))
}))

// Shared middleware
const readService = asyncWrap(async(req, res, next) => {
  req.t0 = new Date().getTime()
  const service = await req.app.get('db').collection('remote-services')
    .findOne({ id: req.params.remoteServiceId }, { projection: { _id: 0 } })
  if (!service) return res.status(404).send('Remote Api not found')
  req.remoteService = req.resource = mongoEscape.unescape(service, true)
  req.resourceApiDoc = remoteServiceAPIDocs(req.remoteService)
  // console.log('read service', new Date().getTime() - req.t0)
  next()
})

// retrieve a remoteService by its id as anybody
router.get('/:remoteServiceId', readService, cacheHeaders.resourceBased, (req, res, next) => {
  res.status(200).send(clean(req.remoteService))
})

// PUT used to create or update as super admin
const attemptInsert = asyncWrap(async(req, res, next) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()

  const newService = initNew(req)
  newService.id = req.params.remoteServiceId
  if (!validate(newService)) return res.status(400).send(validate.errors)

  next()
})
router.put('/:remoteServiceId', attemptInsert, readService, asyncWrap(async(req, res) => {
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
  res.status(200).json(clean(newService))
}))

// Update a remote service configuration as super admin
router.patch('/:remoteServiceId', readService, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()

  const patch = req.body
  var valid = validatePatch(patch)
  if (!valid) return res.status(400).send(validatePatch.errors)

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }
  if (patch.apiDoc) {
    patch.actions = computeActions(patch.apiDoc)
  }

  const patchedService = (await req.app.get('db').collection('remote-services')
    .findOneAndUpdate({ id: req.params.remoteServiceId }, { '$set': mongoEscape.escape(patch, true) }, { returnOriginal: false })).value
  res.status(200).json(clean(mongoEscape.unescape(patchedService)))
}))

// Delete a remoteService as super admin
router.delete('/:remoteServiceId', readService, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()
  // TODO : Remove indexes
  await req.app.get('db').collection('remote-services').deleteOne({
    id: req.params.remoteServiceId
  })
  res.sendStatus(204)
}))

// Force update of API definition as super admin
router.post('/:remoteServiceId/_update', readService, asyncWrap(async(req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.isAdmin) return res.status(403).send()

  if (!req.remoteService.url) return res.sendStatus(204)

  const reponse = await axios.get(req.remoteService.url)
  var valid = validateOpenApi(reponse.data)
  if (!valid) return res.status(400).send(validateOpenApi.errors)
  req.remoteService.updatedAt = moment().toISOString()
  req.remoteService.updatedBy = { id: req.user.id, name: req.user.name }
  req.remoteService.apiDoc = reponse.data
  req.remoteService.actions = computeActions(req.remoteService.apiDoc)
  await req.app.get('db').collection('remote-services').replaceOne({
    id: req.params.remoteServiceId
  }, mongoEscape.escape(req.remoteService, true))
  res.status(200).json(clean(req.remoteService))
}))

// Use the proxy as a user with an active session on an application
let nbLimiter, kbLimiter
router.use('/:remoteServiceId/proxy*', (req, res, next) => { req.app.get('anonymSession')(req, res, next) }, asyncWrap(async (req, res, next) => {
  if (!req.user && !(req.session && req.session.activeApplications)) {
    return res.status(401).send(`
Pas de session active. Cette erreur peut subvenir si vous utilisez une extension qui bloque les cookies.

Les cookies de session sont utilisés par cette application pour protéger notre infrastructure contre les abus.
    `)
  }

  // Use the anonymous session and the current referer url to determine the application.
  // that was used to call this remote service. We will consume the quota of the owner of the application.
  let appOwner
  if (req.session && req.session.activeApplications && req.headers.referer) {
    debug('Anonymous session with active applications', req.session.activeApplications)
    debug('Referer URL', req.headers.referer)
    const refererAppId = url.parse(req.headers.referer.replace(config.publicUrl + '/app/', '')).pathname.split('/')[0]
    const refererApp = req.session.activeApplications.find(a => a.id === refererAppId)
    if (refererApp) appOwner = refererApp.owner
    debug('Referer application owner', appOwner)
  }

  // preventing POST is a simple way to prevent exposing bulk methods through this public proxy
  if (req.method.toUpperCase() !== 'GET') return res.status(405).send('Seules les opérations de type GET sont autorisées sur cette exposition de service')

  // rate limiting both on number of requests and total size to prevent abuse of this public proxy
  const limiterId = req.session ? req.session.id : requestIp.getClientIp(req)
  nbLimiter = nbLimiter || new RateLimiterMongo({
    storeClient: req.app.get('mongoClient'),
    keyPrefix: 'data-fair-rate-limiter-nb',
    points: config.defaultLimits.remoteServiceRate.nb,
    duration: config.defaultLimits.remoteServiceRate.duration
  })
  kbLimiter = kbLimiter || new RateLimiterMongo({
    storeClient: req.app.get('mongoClient'),
    keyPrefix: 'data-fair-rate-limiter-kb',
    points: config.defaultLimits.remoteServiceRate.kb * 1000,
    duration: config.defaultLimits.remoteServiceRate.duration
  })
  try {
    await Promise.all([nbLimiter.consume(limiterId, 1), kbLimiter.consume(limiterId, 1)])
  } catch (err) {
    return res.status(429).send('Trop de traffic dans un interval restreint pour cette exposition de service.')
  }

  // for perf, do not use the middleware readService, we want to read only absolutely necessary info
  const remoteService = await req.app.get('db').collection('remote-services')
    .findOne({ id: req.params.remoteServiceId }, { projection: { _id: 0, id: 1, server: 1, apiKey: 1 } })

  const headers = { 'x-forwarded-url': `${config.publicUrl}/api/v1/remote-services/${remoteService.id}/proxy/` }
  if (appOwner) headers['x-consumer'] = JSON.stringify(appOwner)

  const options = {
    url: remoteService.server + '*',
    headers,
    query: {},
    transforms: [{
      name: 'rate-limiter',
      match: (resp) => {
        // Prevent caches in front of data-fair to cache public expositions of remote-services
        // otherwise rate limiting is not accurate and we have complicated multi-cache cases
        if (!resp.headers['cache-control']) {
          resp.headers['cache-control'] = 'private, max-age=0'
        } else {
          resp.headers['cache-control'] = resp.headers['cache-control'].replace('public', 'private')
        }

        // If we apply to non 200 codes, the code is transformed in 200
        // so no kb rate limiting on other codes
        return resp.statusCode === 200
      },
      transform: () => new Transform({
        transform(chunk, encoding, cb) {
          cb(null, chunk)
          this.consumed = (this.consumed || 0) + chunk.length
          // for perf do not update rate limiter at every chunk, but only every 100kb
          if (this.consumed > 100000) {
            kbLimiter.consume(limiterId, this.consumed).catch(() => {})
            this.consumed = 0
          }
        },
        flush(cb) {
          cb()
          kbLimiter.consume(limiterId, this.consumed).catch(() => {})
        }
      })
    }]
  }
  // TODO handle query & cookie header types
  if (remoteService.apiKey && remoteService.apiKey.in === 'header' && remoteService.apiKey.value) {
    options.headers[remoteService.apiKey.name] = remoteService.apiKey.value
  } else if (config.defaultRemoteKey.in === 'header' && config.defaultRemoteKey.value) {
    options.headers[config.defaultRemoteKey.name] = config.defaultRemoteKey.value
  }

  // We never transmit authentication
  delete req.headers.authorization
  delete req.headers.cookie
  requestProxy(options)(req, res, next)
}))

// Anybody can read the API doc
router.get('/:remoteServiceId/api-docs.json', readService, cacheHeaders.resourceBased, (req, res) => {
  res.send(req.resourceApiDoc)
})
