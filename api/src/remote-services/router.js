import path from 'path'
import http from 'http'
import https from 'https'
import express from 'express'
import moment from 'moment'
import slug from 'slugify'
import axios from '../misc/utils/axios.js'
import pump from '../misc/utils/pipe.ts'
import CacheableLookup from 'cacheable-lookup'
import remoteServiceAPIDocs from '../../contract/remote-service-api-docs.js'
import mongoEscape from 'mongo-escape'
import config from '#config'
import mongo from '#mongo'
import * as cacheHeaders from '../misc/utils/cache-headers.js'
import * as rateLimiting from '../misc/utils/rate-limiting.ts'
import { httpAgent, httpsAgent } from '../misc/utils/http-agents.js'
import { clean, validateOpenApi, initNew, computeActions } from './utils.ts'
import { findRemoteServices, findActions } from './service.ts'
import debugModule from 'debug'
import { internalError } from '@data-fair/lib-node/observer.js'
import { reqUser, reqAdminMode } from '@data-fair/lib-express'

const debug = debugModule('remote-services')
const debugMasterData = debugModule('master-data')

const cacheableLookup = new CacheableLookup()

export const router = express.Router()

router.use((req, res, next) => {
  // @ts-ignore
  req.resourceType = 'remote-services'
  next()
})

// Get the list of remote-services
// Accessible to anybody
router.get('', cacheHeaders.noCache, async (req, res) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl

  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findRemoteServices(req.getLocale(), publicationSite, publicBaseUrl, reqQuery, reqUser(req))
  res.json(response)
})

export const actionsRouter = express.Router()

// get the unpacked list of actions inside the remote services
actionsRouter.get('', cacheHeaders.noCache, async (req, res) => {
  // @ts-ignore
  const publicationSite = req.publicationSite
  // @ts-ignore
  const publicBaseUrl = req.publicBaseUrl
  // @ts-ignore
  const reqQuery = /** @type {Record<string, string>} */(req.query)

  const response = await findActions(req.getLocale(), publicationSite, publicBaseUrl, reqQuery, reqUser(req))
  res.json(response)
})

// Create a remote Api as super admin
router.post('', async (req, res) => {
  const sessionState = reqAdminMode(req)
  // if title is set, we build id from it
  if (req.body.title && !req.body.id) req.body.id = slug(req.body.title, { lower: true, strict: true })
  debugMasterData(`POST remote service manually by ${sessionState.user.name} (${sessionState.user.id})`, req.body)
  const service = initNew(req.body)
  const { assertValid: validate } = await import('#types/remote-service/index.js')
  validate(service)

  // Generate ids and try insertion until there is no conflict on id
  const baseId = service.id || slug(service.apiDoc.info['x-api-id'], { lower: true, strict: true })
  service.id = baseId
  let insertOk = false
  let i = 1
  while (!insertOk) {
    try {
      await mongo.remoteServices.insertOne(mongoEscape.escape(service, true))
      insertOk = true
    } catch (err) {
      if (err.code !== 11000 || !err.errmsg.includes('x-api-id')) throw err
      i += 1
      service.id = `${baseId}-${i}`
    }
  }
  debugMasterData('inserted remote service with id', service.id)

  res.status(201).json(clean(service, sessionState))
})

// Shared middleware
const readService = async (req, res, next) => {
  const service = await mongo.remoteServices
    .findOne({ id: req.params.remoteServiceId }, { projection: { _id: 0 } })
  if (!service) return res.status(404).send('Remote Api not found')
  req.remoteService = req.resource = mongoEscape.unescape(service, true)
  next()
}

// retrieve a remoteService by its id as anybody
router.get('/:remoteServiceId', readService, cacheHeaders.resourceBased(), (req, res, next) => {
  // TODO: allow based on privateAccess ?
  const sessionState = reqAdminMode(req)

  res.status(200).send(clean(req.remoteService, sessionState, req.query.html === 'true'))
})

// PUT used to create or update as super admin
const attemptInsert = async (req, res, next) => {
  reqAdminMode(req)

  const newService = initNew(req.body)
  newService.id = req.params.remoteServiceId
  const { assertValid: validate } = await import('#types/remote-service/index.js')
  validate(newService)

  next()
}
router.put('/:remoteServiceId', attemptInsert, readService, async (req, res) => {
  const sessionState = reqAdminMode(req)

  const newService = req.body
  debugMasterData(`PUT remote service manually by ${sessionState.user.name} (${sessionState.user.id})`, req.params.remoteServiceId, newService.id)
  // preserve all readonly properties, the rest is overwritten
  const { schema: servicePatch } = await import('#doc/remote-services/patch-req/index.js')
  for (const key of Object.keys(req.remoteService)) {
    if (!servicePatch.properties.body.properties[key]) {
      newService[key] = req.remoteService[key]
    }
  }
  newService.updatedAt = moment().toISOString()
  newService.updatedBy = { id: sessionState.user.id, name: sessionState.user.name }
  if (newService.apiDoc) {
    newService.actions = computeActions(newService.apiDoc)
  }
  await mongo.remoteServices.replaceOne({ id: req.params.remoteServiceId }, mongoEscape.escape(newService, true))
  debugMasterData('replaced remote service')
  res.status(200).json(clean(newService, sessionState))
})

// Update a remote service configuration as super admin
router.patch('/:remoteServiceId', readService, async (req, res) => {
  const sessionState = reqAdminMode(req)

  debugMasterData(`PATCH remote service manually by ${sessionState.user.name} (${sessionState.user.id})`, req.params.remoteServiceId, req.body)

  const patch = req.body
  const { assertValid: validatePatch } = await import('#doc/remote-services/patch-req/index.js')
  validatePatch(patch)

  patch.updatedAt = moment().toISOString()
  patch.updatedBy = { id: sessionState.user.id, name: sessionState.user.name }
  if (patch.apiDoc) {
    patch.actions = computeActions(patch.apiDoc)
  }

  const patchedService = await mongo.remoteServices
    .findOneAndUpdate({ id: req.params.remoteServiceId }, { $set: mongoEscape.escape(patch, true) }, { returnDocument: 'after' })
  debugMasterData('patched remote service')
  res.status(200).json(clean(mongoEscape.unescape(patchedService), sessionState))
})

// Delete a remoteService as super admin
router.delete('/:remoteServiceId', readService, async (req, res) => {
  const sessionState = reqAdminMode(req)

  debugMasterData(`DELETE remote service manually by ${sessionState.user.name} (${sessionState.user.id})`, req.params.remoteServiceId)
  await mongo.remoteServices.deleteOne({
    id: req.params.remoteServiceId
  })
  res.sendStatus(204)
})

// Force update of API definition as super admin
router.post('/:remoteServiceId/_update', readService, async (req, res) => {
  const sessionState = reqAdminMode(req)

  if (!req.remoteService.url) return res.sendStatus(204)

  debugMasterData(`Force update remote service manually by ${sessionState.user.name} (${sessionState.user.id})`, req.params.remoteServiceId)

  const reponse = await axios.get(req.remoteService.url)
  validateOpenApi(reponse.data)
  req.remoteService.updatedAt = moment().toISOString()
  req.remoteService.updatedBy = { id: sessionState.user.id, name: sessionState.user.name }
  req.remoteService.apiDoc = reponse.data
  req.remoteService.actions = computeActions(req.remoteService.apiDoc)
  await mongo.remoteServices.replaceOne({
    id: req.params.remoteServiceId
  }, mongoEscape.escape(req.remoteService, true))
  res.status(200).json(clean(req.remoteService, sessionState))
})

// use the current referer url to determine the application that was used to call this remote service
// We will consume the quota of the owner of the application.
async function getAppOwner (req) {
  const referer = req.headers.referer || req.headers.referrer
  // unfortunately this can happen quite a lot when coming from web workers, very restrictive browsers, etc.
  if (!referer) return console.warn('remote service proxy called without a referer header')
  debug('Referer URL', referer)

  if (!referer.startsWith(req.publicBaseUrl + '/')) return console.warn('remote service proxy called from outside a data-fair page', referer)

  const refererAppId = referer.startsWith(req.publicBaseUrl + '/app/') && referer.replace(req.publicBaseUrl + '/app/', '').split('?')[0].split('/')[0]
  if (!refererAppId) return
  debug('Referer application id', refererAppId)

  const refererApp = await mongo.applications.findOne({ id: refererAppId }, { projection: { owner: 1 } })
  if (!refererApp) return console.warn(`remote service proxy called from outside a known application referer=${referer} id=${refererAppId}`)

  return refererApp.owner
}

// Use the proxy as a user of an application
// always apply restrictive rate limiting to remote services, privileged access does not go through here
router.use('/:remoteServiceId/proxy/*proxyPath', rateLimiting.middleware('remoteService'), async (req, res, next) => {
  const appOwner = await getAppOwner(req)
  debug('Referer application owner', appOwner)

  // preventing POST is a simple way to prevent exposing bulk methods through this public proxy
  if (req.method.toUpperCase() !== 'GET') {
    return res.status(405).send('Seules les opérations de type GET sont autorisées sur cette exposition de service')
  }

  // for perf, do not use the middleware readService, we want to read only absolutely necessary info
  const accessFilter = [{ public: true }]
  if (appOwner) accessFilter.push({ privateAccess: { $elemMatch: { type: appOwner.type, id: appOwner.id } } })

  const remoteService = await mongo.remoteServices
    .findOne({ id: req.params.remoteServiceId, $or: accessFilter }, { projection: { _id: 0, id: 1, server: 1, apiKey: 1 } })

  if (!remoteService) return res.status(404).send('service distant inconnu')

  const headers = {
    'x-forwarded-url': `${req.publicBaseUrl}/api/v1/remote-services/${remoteService.id}/proxy/`
  }
  // auth header, TODO handle query & cookie header types
  if (remoteService.apiKey && remoteService.apiKey.in === 'header' && remoteService.apiKey.value) {
    headers[remoteService.apiKey.name] = remoteService.apiKey.value
  } else if (config.defaultRemoteKey.in === 'header' && config.defaultRemoteKey.value) {
    headers[config.defaultRemoteKey.name] = config.defaultRemoteKey.value
  }
  // transmit some useful headers for REST endpoints
  for (const header of ['accept', 'accept-encoding', 'accept-language', 'if-none-match', 'if-modified-since']) {
    if (req.headers[header]) headers[header] = req.headers[header]
  }

  // merge incoming and target URL elements
  const incomingUrl = new URL('http://host' + req.url)
  const targetUrl = new URL(remoteService.server.replace(config.remoteServicesPrivateMapping[0], config.remoteServicesPrivateMapping[1]))
  const extraPath = '/' + path.join(...req.params.proxyPath)
  targetUrl.pathname = path.join(targetUrl.pathname, extraPath)
  targetUrl.search = incomingUrl.searchParams

  const options = {
    host: targetUrl.host,
    port: targetUrl.port,
    protocol: targetUrl.protocol,
    path: targetUrl.pathname + targetUrl.hash + targetUrl.search,
    timeout: config.remoteTimeout,
    headers,
    lookup: cacheableLookup.lookup,
    agent: targetUrl.protocol === 'http:' ? httpAgent : httpsAgent
  }
  await new Promise((resolve, reject) => {
    let timedout = false
    const reqTimeout = setTimeout(() => {
      timedout = true
      req.destroy()
    }, config.remoteTimeout * 1.5)
    const req = (targetUrl.protocol === 'http:' ? http.request : https.request)(options, async (appRes) => {
      try {
        for (const header of ['content-type', 'content-length', 'content-encoding', 'etag', 'pragma', 'cache-control', 'expires', 'last-modified', 'x-taxman-cache-status']) {
          if (appRes.headers[header]) res.set(header, appRes.headers[header])
        }
        // Prevent caches in front of data-fair
        // otherwise rate limiting is not accurate and we have complicated multi-cache cases
        if (!appRes.headers['cache-control']) {
          res.set('cache-control', 'private, no-cache')
        } else {
          res.set('cache-control', appRes.headers['cache-control'].replace('public', 'private'))
        }
        res.setHeader('X-Accel-Buffering', 'no')
        res.status(appRes.statusCode)
        const throttle = res.throttle('dynamic')
        await pump(appRes, throttle, res)
        resolve()
      } catch (err) {
        if (err.code === 'ERR_STREAM_PREMATURE_CLOSE' || err.message === 'premature close') {
          // nothing to do, happens when requests are interrupted by browser
          // pretty usual for map tiles for example
          resolve()
        } else {
          internalError('service-proxy-res', err)
          reject(err)
        }
      } finally {
        clearTimeout(reqTimeout)
      }
    })
    req.on('error', err => {
      if (timedout) {
        res.status(504).type('text/plain').send('remote-service timed out')
        resolve()
      } else {
        internalError('service-proxy-req', err)
        reject(err)
      }
    })
    req.end()
  })
})

// Anybody can read the API doc
router.get('/:remoteServiceId/api-docs.json', readService, cacheHeaders.resourceBased(), (req, res) => {
  res.send(remoteServiceAPIDocs(req.remoteService))
})
