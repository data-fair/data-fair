const { Transform } = require('stream')
const express = require('express')
const moment = require('moment')
const slug = require('slugify')
const soasLoader = require('soas')
const axios = require('../utils/axios')
const requestProxy = require('@koumoul/express-request-proxy')
const remoteServiceAPIDocs = require('../../contract/remote-service-api-docs')
const mongoEscape = require('mongo-escape')
const config = require('config')
const requestIp = require('request-ip')
const ajv = require('ajv')()
const createError = require('http-errors')
const validate = ajv.compile(require('../../contract/remote-service'))
const servicePatch = require('../../contract/remote-service-patch')
const validatePatch = ajv.compile(servicePatch)
const openApiSchema = require('../../contract/openapi-3.1.json')
openApiSchema.$id = openApiSchema.$id + '-2' // dirty hack to handle ajv error
const validateOpenApi = ajv.compile(openApiSchema)

const findUtils = require('../utils/find')
const asyncWrap = require('../utils/async-wrap')
const cacheHeaders = require('../utils/cache-headers')
const rateLimiting = require('../utils/rate-limiting')
const datasetAPIDocs = require('../../contract/dataset-api-docs')

const debug = require('debug')('remote-services')

const router = exports.router = express.Router()

exports.syncDataset = async (db, dataset) => {
  const id = 'dataset:' + dataset.id
  if (dataset.masterData && ((dataset.masterData.singleSearchs && dataset.masterData.singleSearchs.length) || (dataset.masterData.bulkSearchs && dataset.masterData.bulkSearchs.length))) {
    const apiDoc = datasetAPIDocs(dataset).api
    const service = initNew({
      id,
      apiDoc,
      url: `${config.publicUrl}/api/v1/datasets/${dataset.id}/api-docs.json`,
      server: apiDoc.servers && apiDoc.servers.length && apiDoc.servers[0].url,
      privateAccess: [{ type: dataset.owner.type, id: dataset.owner.id, name: dataset.owner.name }]
    })
    if (!validate(service)) throw createError(400, JSON.stringify(validate.errors))
    await db.collection('remote-services').replaceOne({ id }, mongoEscape.escape(service, true), { upsert: true })
  } else {
    await db.collection('remote-services').deleteOne({ id })
  }
}

// Create default services for the data-fair instance
exports.init = async (db) => {
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
  const servicesToInsert = servicesToAdd.filter(s => apisDict[s.url] && apisDict[s.url].info).map(s => mongoEscape.escape({
    id: slug(apisDict[s.url].info['x-api-id']),
    title: apisDict[s.url].info.title,
    description: apisDict[s.url].info.description,
    url: s.url,
    apiDoc: apisDict[s.url],
    server: apisDict[s.url].servers && apisDict[s.url].servers.length && apisDict[s.url].servers[0].url,
    actions: computeActions(apisDict[s.url]),
    public: true,
    privateAccess: []
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

function clean (remoteService, user) {
  delete remoteService._id
  if (remoteService.apiKey && remoteService.apiKey.value) remoteService.apiKey.value = '**********'
  if (!user || !user.adminMode) delete remoteService.privateAccess
  findUtils.setResourceLinks(remoteService, 'remote-service')
  return remoteService
}

// Get the list of remote-services
// Accessible to anybody
router.get('', cacheHeaders.noCache, asyncWrap(async (req, res) => {
  const remoteServices = req.app.get('db').collection('remote-services')
  const query = findUtils.query(req, {
    'input-concepts': 'actions.input.concept',
    'output-concepts': 'actions.output.concept',
    'api-id': 'apiDoc.info.x-api-id',
    ids: 'id',
    id: 'id'
  }, true)

  delete req.query.owner
  query.owner = { $exists: false } // restrict to the newly centralized remote services
  const sort = findUtils.sort(req.query.sort)
  const project = findUtils.project(req.query.select, ['apiDoc'])
  const [skip, size] = findUtils.pagination(req.query)
  const mongoQueries = [
    size > 0 ? remoteServices.find(query).collation({ locale: 'en' }).limit(size).skip(skip).sort(sort).project(project).toArray() : Promise.resolve([]),
    remoteServices.countDocuments(query)
  ]
  if (req.query.facets) {
    mongoQueries.push(remoteServices.aggregate(findUtils.facetsQuery(req, {})).toArray())
  }
  let [results, count, facets] = await Promise.all(mongoQueries)
  results.forEach(r => clean(r, req.user))
  facets = findUtils.parseFacets(facets)
  res.json({ count, results: results.map(result => mongoEscape.unescape(result, true)), facets })
}))

const initNew = (body) => {
  const service = { ...body }
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
router.post('', asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  // if title is set, we build id from it
  if (req.body.title && !req.body.id) req.body.id = slug(req.body.title, { lower: true, strict: true })
  const service = initNew(req.body)
  if (!validate(service)) return res.status(400).send(validate.errors)

  // Generate ids and try insertion until there is no conflict on id
  const baseId = service.id || slug(service.apiDoc.info['x-api-id'], { lower: true, strict: true })
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

  res.status(201).json(clean(service, req.user))
}))

// Shared middleware
const readService = asyncWrap(async (req, res, next) => {
  req.t0 = new Date().getTime()
  const service = await req.app.get('db').collection('remote-services')
    .findOne({ id: req.params.remoteServiceId }, { projection: { _id: 0 } })
  if (!service) return res.status(404).send('Remote Api not found')
  req.remoteService = req.resource = mongoEscape.unescape(service, true)
  req.resourceType = 'remote-services'
  // console.log('read service', new Date().getTime() - req.t0)
  next()
})

// retrieve a remoteService by its id as anybody
router.get('/:remoteServiceId', readService, cacheHeaders.resourceBased, (req, res, next) => {
  // TODO: allow based on privateAccess ?
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()

  res.status(200).send(clean(req.remoteService, req.user))
})

// PUT used to create or update as super admin
const attemptInsert = asyncWrap(async (req, res, next) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()

  const newService = initNew(req.body)
  newService.id = req.params.remoteServiceId
  if (!validate(newService)) return res.status(400).send(validate.errors)

  next()
})
router.put('/:remoteServiceId', attemptInsert, readService, asyncWrap(async (req, res) => {
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
  res.status(200).json(clean(newService, req.user))
}))

// Update a remote service configuration as super admin
router.patch('/:remoteServiceId', readService, asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()

  const patch = req.body
  const valid = validatePatch(patch)
  if (!valid) return res.status(400).send(validatePatch.errors)

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: req.user.id, name: req.user.name }
  if (patch.apiDoc) {
    patch.actions = computeActions(patch.apiDoc)
  }

  const patchedService = (await req.app.get('db').collection('remote-services')
    .findOneAndUpdate({ id: req.params.remoteServiceId }, { $set: mongoEscape.escape(patch, true) }, { returnDocument: 'after' })).value
  res.status(200).json(clean(mongoEscape.unescape(patchedService, req.user)))
}))

// Delete a remoteService as super admin
router.delete('/:remoteServiceId', readService, asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()
  await req.app.get('db').collection('remote-services').deleteOne({
    id: req.params.remoteServiceId
  })
  res.sendStatus(204)
}))

// Force update of API definition as super admin
router.post('/:remoteServiceId/_update', readService, asyncWrap(async (req, res) => {
  if (!req.user) return res.status(401).send()
  if (!req.user.adminMode) return res.status(403).send()

  if (!req.remoteService.url) return res.sendStatus(204)

  const reponse = await axios.get(req.remoteService.url)
  const valid = validateOpenApi(reponse.data)
  if (!valid) return res.status(400).send(validateOpenApi.errors)
  req.remoteService.updatedAt = moment().toISOString()
  req.remoteService.updatedBy = { id: req.user.id, name: req.user.name }
  req.remoteService.apiDoc = reponse.data
  req.remoteService.actions = computeActions(req.remoteService.apiDoc)
  await req.app.get('db').collection('remote-services').replaceOne({
    id: req.params.remoteServiceId
  }, mongoEscape.escape(req.remoteService, true))
  res.status(200).json(clean(req.remoteService, req.user))
}))

// use the current referer url to determine the application that was used to call this remote service
// We will consume the quota of the owner of the application.
async function getAppOwner (req) {
  const referer = req.headers.referer || req.headers.referrer
  // unfortunately this can happen quite a lot when coming from web workers, very restrictive browsers, etc.
  if (!referer) return console.warn('remote service proxy called without a referer header')
  debug('Referer URL', referer)

  const refererAppId = referer.startsWith(req.publicBaseUrl + '/app/') && referer.replace(req.publicBaseUrl + '/app/', '').split('?')[0].split('/')[0]
  if (!refererAppId) return console.warn('remote service proxy called from outside an application page', referer)
  debug('Referer application id', refererAppId)

  const refererApp = await req.app.get('db').collection('applications').findOne({ id: refererAppId }, { projection: { owner: 1 } })
  if (!refererApp) return console.warn(`remote service proxy called from outside a known application referer=${referer} id=${refererAppId}`)

  return refererApp.owner
}

// Use the proxy as a user of an application
// TODO: replace express-request-proxy by a simple use of https.request as done in application proxy
router.use('/:remoteServiceId/proxy*', asyncWrap(async (req, res, next) => {
  const appOwner = await getAppOwner(req)
  debug('Referer application owner', appOwner)

  // preventing POST is a simple way to prevent exposing bulk methods through this public proxy
  if (req.method.toUpperCase() !== 'GET') {
    return res.status(405).send('Seules les opérations de type GET sont autorisées sur cette exposition de service')
  }

  // rate limiting both on number of requests and total size to prevent abuse of this public proxy
  // it is only meant to be used by applications, not scripts
  const limiterId = requestIp.getClientIp(req)
  try {
    await Promise.all([rateLimiting.remoteServices.nb.consume(limiterId, 1), rateLimiting.remoteServices.kb.consume(limiterId, 1)])
  } catch (err) {
    return res.status(429).send('Trop de traffic dans un interval restreint pour cette exposition de service.')
  }

  // for perf, do not use the middleware readService, we want to read only absolutely necessary info
  const accessFilter = [{ public: true }]
  if (appOwner) accessFilter.push({ privateAccess: { $elemMatch: { type: appOwner.type, id: appOwner.id } } })

  const remoteService = await req.app.get('db').collection('remote-services')
    .findOne({ id: req.params.remoteServiceId, $or: accessFilter }, { projection: { _id: 0, id: 1, server: 1, apiKey: 1 } })

  if (!remoteService) return res.status(404).send('service distant inconnu')

  const headers = { 'x-forwarded-url': `${req.publicBaseUrl}/api/v1/remote-services/${remoteService.id}/proxy/` }
  // if (appOwner) headers['x-consumer'] = JSON.stringify(appOwner)

  const options = {
    url: remoteService.server + '*',
    headers,
    query: {},
    timeout: config.remoteTimeout,
    transforms: [{
      name: 'rate-limiter',
      match: (resp) => {
        // Prevent caches in front of data-fair to cache public expositions of remote-services
        // otherwise rate limiting is not accurate and we have complicated multi-cache cases
        if (!resp.headers['cache-control']) {
          resp.headers['cache-control'] = 'private, max-age=0, must-revalidate'
        } else {
          resp.headers['cache-control'] = resp.headers['cache-control'].replace('public', 'private')
        }

        // If we apply to non 200 codes, the code is transformed in 200
        // so no kb rate limiting on other codes
        return resp.statusCode === 200
      },
      transform: () => new Transform({
        transform (chunk, encoding, cb) {
          cb(null, chunk)
          this.consumed = (this.consumed || 0) + chunk.length
          // for perf do not update rate limiter at every chunk, but only every 100kb
          if (this.consumed > 100000) {
            rateLimiting.remoteServices.kb.consume(limiterId, this.consumed).catch(() => {})
            this.consumed = 0
          }
        },
        flush (cb) {
          cb()
          rateLimiting.remoteServices.kb.consume(limiterId, this.consumed).catch(() => {})
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
  requestProxy(options)(req, res, err => {
    if (err) console.error('Error while proxying remote service', err)
    next(err)
  })
}))

// Anybody can read the API doc
router.get('/:remoteServiceId/api-docs.json', readService, cacheHeaders.resourceBased, (req, res) => {
  res.send(remoteServiceAPIDocs(req.remoteService))
})
