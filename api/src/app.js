import * as metrics from './misc/utils/metrics.ts' // import early so that memoizee can be used in the following imports
import { resolve, parse as parsePath, join } from 'node:path'
import express from 'express'
import { parsePath as parseUrlPath } from 'ufo'
import pathToRegexp from 'path-to-regexp'
import config from '#config'
import uiConfig from './ui-config.ts'
import mongo from '#mongo'
import es from '#es'
import memoize from 'memoizee'
import * as wsServer from '@data-fair/lib-express/ws-server.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import locks from '@data-fair/lib-node/locks.js'
import * as observe from './misc/utils/observe.ts'
import catalogsPublicationQueue from './misc/utils/catalogs-publication-queue.ts'
import debug from 'debug'
import EventEmitter from 'node:events'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import upgradeScripts from '@data-fair/lib-node/upgrade-scripts.js'
import { cleanTmp } from './datasets/utils/files.ts'
import eventsQueue from '@data-fair/lib-node/events-queue.js'
import { isMainThread } from 'node:worker_threads'
import { reqSiteUrl } from '@data-fair/lib-express/site.js'

const debugDomain = debug('domain')

// a global event emitter for testing
if (process.env.NODE_ENV === 'test') {
  if (isMainThread) global.events = new EventEmitter()
}

let app, server, httpTerminator

// Run app and return it in a promise
export const run = async () => {
  app = express()

  // a middleware for performance analysis
  app.use(observe.observeReqMiddleware)

  await eventsQueue.start({ eventsUrl: config.privateEventsUrl, eventsSecret: config.secretKeys.events, inactive: !config.privateEventsUrl })
  if (config.privateCatalogsUrl) {
    await catalogsPublicationQueue.start({ catalogsUrl: config.privateCatalogsUrl, catalogsSecret: config.secretKeys.catalogs })
  }

  if (config.mode.includes('server')) {
    const limits = await import('./misc/utils/limits.ts')
    const rateLimiting = await import('./misc/utils/rate-limiting.ts')
    const { session } = await import('@data-fair/lib-express/index.js')
    const { reqIsInternal, reqHost, createSiteMiddleware } = await import('@data-fair/lib-express/index.js')
    session.init(config.privateDirectoryUrl || config.directoryUrl)

    app.set('trust proxy', 1)
    // app.set('json spaces', 2)

    app.set('query parser', 'simple')
    app.use((req, res, next) => {
      for (const key of Object.keys(req.query)) {
        if (Array.isArray(req.query[key])) {
          if (req.url.includes('/compat-ods/')) {
            // prevent breaking compatibility
          } else {
            return res.status(400).send(`query parameter "${key}" is defined multiple times`)
          }
        }
      }
      next()
    })

    app.use((req, res, next) => {
      // We use custom "X-Private-If-Modified-Since" and "X-Private-If-None-Match" headers as
      // alternatives to "If-Modified-Since" and "If-None-Match"
      // this is because nginx does not transmit these headers when proxy cache is activated
      // but in the case of a "Private" cache-control proxy pass is not used but it still breaks
      // summary :
      // this is necessary for private cache revalidation when public cache revalication is activated in nginx
      if (req.headers['x-private-if-modified-since'] && !req.headers['if-modified-since']) {
        req.headers['if-modified-since'] = req.headers['x-private-if-modified-since']
      }
      if (req.headers['x-private-if-none-match'] && !req.headers['if-none-match']) {
        req.headers['if-none-match'] = req.headers['x-private-if-none-match']
      }
      next()
    })

    app.use((await import('cors')).default())
    app.use((req, res, next) => {
      if (!req.app.get('api-ready')) res.status(503).type('text/plain').send('Service indisponible pour cause de maintenance.')
      else next()
    })

    const bodyParser = express.json({ limit: '1000kb' })
    app.use((req, res, next) => {
      // routes with _bulk are streamed, others are parsed as JSON
      const urlParts = req.url.split('/')
      if (urlParts[urlParts.length - 1].startsWith('_bulk')) return next()
      if (urlParts[urlParts.length - 2] === 'bulk-searchs') return next()
      bodyParser(req, res, next)
    })
    app.use(createSiteMiddleware('data-fair', { prefixOptional: true }))
    app.use((await import('cookie-parser')).default())
    app.use((await import('../i18n/utils.ts')).middleware)
    app.use(session.middleware())

    // TODO: we could make this better targetted but more verbose by adding it to all routes
    app.use((await import('./misc/utils/expect-type.js')).default(['application/json', 'application/x-ndjson', 'multipart/form-data', 'text/csv', 'text/csv+gzip']))

    // set current baseUrl, i.e. the url of data-fair on the current user's domain
    // check for the matching publicationSite, etc
    const parsedPublicUrl = new URL(config.publicUrl)
    const getPublicationSiteSettings = async (publicationSiteUrl, publicationSiteQuery, db) => {
      const elemMatch = publicationSiteQuery
        ? { type: publicationSiteQuery.split(':')[0], id: publicationSiteQuery.split(':')[1] }
        : { $or: [{ url: publicationSiteUrl }, { draftUrl: publicationSiteUrl }] }
      return db.collection('settings').findOne({ publicationSites: { $elemMatch: elemMatch } }, {
        projection: {
          type: 1,
          id: 1,
          department: 1,
          name: 1,
          publicationSites: { $elemMatch: elemMatch }
        }
      })
    }
    const memoizedGetPublicationSiteSettings = memoize(getPublicationSiteSettings, {
      profileName: 'getPublicationSiteSettings',
      promise: true,
      primitive: true,
      max: 10000,
      maxAge: 1000 * 60, // 1 minute
      length: 2 // only use publicationSite, not db as cache key
    })
    if (process.env.NODE_ENV === 'test') {
      global.memoizedGetPublicationSiteSettings = memoizedGetPublicationSiteSettings
    }
    app.use('/', async (req, res, next) => {
      const mainDomain = reqIsInternal(req) || reqHost(req) === parsedPublicUrl.host
      req.publicBaseUrl = mainDomain ? config.publicUrl : (reqSiteUrl(req) + '/data-fair')
      req.publicWsBaseUrl = req.publicBaseUrl.replace('http:', 'ws:').replace('https:', 'wss:') + '/'
      debugDomain('req.publicBaseUrl', req.publicBaseUrl)

      const siteUrl = mainDomain ? parsedPublicUrl.origin : reqSiteUrl(req)
      const settings = await memoizedGetPublicationSiteSettings(siteUrl, mainDomain && req.query.publicationSites, mongo.db)
      if (!settings && !mainDomain) {
        internalError('publication-site-unknown', 'no publication site is associated to URL ' + siteUrl)
        return res.status(404).send('publication site unknown')
      }
      if (settings) {
        const publicationSite = {
          owner: { type: settings.type, id: settings.id, department: settings.department, name: settings.name },
          ...settings.publicationSites[0]
        }
        if (mainDomain) {
          if (publicationSite.url === siteUrl) {
            req.mainPublicationSite = publicationSite
          }
          if (req.query.publicationSites === publicationSite.type + ':' + publicationSite.id) {
            req.publicationSite = publicationSite
          }
        } else {
          req.publicationSite = publicationSite
        }
      }
      next()
    })

    // Business routers
    const { middleware: apiKey } = await import('./misc/utils/api-key.ts')
    app.use('/api/v1', (await import('./misc/routers/root.ts')).default)
    app.use('/api/v1/remote-services', (await import('./remote-services/router.js')).router)
    app.use('/api/v1/remote-services-actions', (await import('./remote-services/router.js')).actionsRouter)
    app.use('/api/v1/catalog', apiKey('datasets'), (await import('./misc/routers/catalog.js')).default)
    app.use('/api/v1/base-applications', (await import('./base-applications/router.ts')).router)
    app.use('/api/v1/applications', apiKey('applications'), (await import('./applications/router.js')).default)
    app.use('/api/v1/datasets', rateLimiting.middleware(), (await import('./datasets/router.js')).default)
    app.use('/api/v1/stats', apiKey('stats'), (await import('./misc/routers/stats.ts')).default)
    app.use('/api/v1/settings', (await import('./misc/routers/settings.ts')).default)
    app.use('/api/v1/admin', (await import('./misc/routers/admin.js')).default)
    app.use('/api/v1/identities', (await import('./misc/routers/identities.js')).default)
    app.use('/api/v1/activity', (await import('./misc/routers/activity.js')).default)
    app.use('/api/v1/limits', limits.router)
    if (config.compatODS) {
      app.use('/api/v1/compat-ods', rateLimiting.middleware(), (await import('./api-compat/ods/index.ts')).default)
    }

    app.use('/api/', (req, res) => {
      return res.status(404).send('unknown api endpoint')
    })

    // External applications proxy
    const serviceWorkers = await import('./misc/utils/service-workers.js')
    app.get('/app-sw.js', (req, res) => {
      res.setHeader('Content-Type', 'application/javascript')
      res.send(serviceWorkers.sw(req.application))
    })
    app.use('/app', (await import('./applications/proxy.js')).default)

    // self hosting of streamsaver man in the middle service worker
    // see https://github.com/jimmywarting/StreamSaver.js/issues/183
    const streamsaverPath = parsePath(new URL(import.meta.resolve('streamsaver')).pathname).dir
    app.use('/streamsaver/mitm.html', express.static(join(streamsaverPath, 'mitm.html')))
    app.use('/streamsaver/sw.js', express.static(join(streamsaverPath, 'sw.js')))

    if (config.serveUi) {
      const { createSpaMiddleware, defaultNonceCSPDirectives } = await import('@data-fair/lib-express/serve-spa.js')

      const unsafePaths = [
        '/dataset/:id/table-edit',
        '/dataset/:id/form',
        '/application/:id/config',
        '/workflow/update-dataset',
        '/settings/:type/:id/licenses',
        '/settings/:type/:id/topics',
        '/settings/:type/:id/webhooks',
      ].map(p => pathToRegexp.match(p))
      app.use('/embed', await createSpaMiddleware(resolve(import.meta.dirname, '../../embed-ui/dist'), uiConfig, {
        ignoreSitePath: true,
        csp: {
          nonce: true,
          header: (req) => {
            const urlPath = parseUrlPath(req.url).pathname
            const directives = { ...defaultNonceCSPDirectives }
            for (const p of unsafePaths) {
              if (p(urlPath)) {
                // some embed pages require unsafe-eval as they use vjsf on dynamic schemas
                directives['script-src'] = "'unsafe-eval' " + defaultNonceCSPDirectives['script-src']
                directives['connect-src'] = "'self' https:"
              }
            }
            if (urlPath.startsWith('/embed/')) {
              directives['frame-ancestors'] = "'self' http: https:"
            }
            return directives
          }
        }
      }))
    }
    app.use('/next-ui', (req, res) => {
      // next-ui urls were a temporary alternate UI we redirect
      // them in case some are still in use somewhere
      res.redirect(reqSiteUrl(req) + '/data-fair' + req.url)
    })

    server = (await import('http')).createServer(app)
    const { createHttpTerminator } = await import('http-terminator')
    httpTerminator = createHttpTerminator({ server })
    // cf https://connectreport.com/blog/tuning-http-keep-alive-in-node-js/
    // timeout is often 60s on the reverse proxy, better to a have a longer one here
    // so that interruption is managed downstream instead of here
    server.keepAliveTimeout = (60 * 1000) + 1000
    server.headersTimeout = (60 * 1000) + 2000
    server.requestTimeout = (15 * 60 * 1000)

    if (!config.listenWhenReady) {
      server.listen(config.port)
      await eventPromise(server, 'listening')
    }
  }

  await mongo.init()
  const { db } = mongo

  await locks.start(db)
  if (config.mode.includes('worker')) {
    await cleanTmp()
    await upgradeScripts(db, locks, resolve(import.meta.dirname, '../..'))
  }

  await es.init()
  app.set('es', await es.client)

  await wsEmitter.init(db)

  if (config.mode.includes('worker')) {
    const workers = await import('./workers/index.ts')
    await workers.init()
    workers.loop().catch(error => {
      internalError('workers-loop-error', error)
      throw error
    })
  }

  if (config.mode.includes('server')) {
    const errorHandler = (await import('@data-fair/lib-express/error-handler.js')).default

    // Error management
    app.use(errorHandler)

    const permissions = await import('./misc/utils/permissions.ts')
    const { readApiKey } = await import('./misc/utils/api-key.ts')
    await Promise.all([
      (await import('./misc/utils/capture.ts')).init(),
      (await import('./misc/utils/cache.js')).init(),
      (await import('./remote-services/utils.ts')).init(),
      (await import('./base-applications/router.ts')).init(),
      wsServer.start(server, db, async (channel, sessionState, message) => {
        if (process.env.NODE_ENV === 'test') {
          // TODO: remove this ugly exception, this code should be tested
          return true
        }
        const [type, id, subject] = channel.split('/')
        const resource = await db.collection(type).findOne({ id })
        if (!resource) throw httpError(404, `Ressource ${type}/${id} inconnue.`)
        if (message.apiKey) sessionState = await readApiKey(message.apiKey, type, message.account)
        return permissions.can(type, resource, `realtime-${subject}`, sessionState)
      })
    ])
    // At this stage the server is ready to respond to API requests
    app.set('api-ready', true)

    app.use((req, res, next) => {
      if (!req.app.get('ui-ready')) res.status(503).type('text/plain').send('Service indisponible pour cause de maintenance.')
      else next()
    })

    const nuxt = await (await import('./nuxt.js')).default()
    app.set('nuxt', nuxt.instance)
    app.use(nuxt.trackEmbed)
    app.use(nuxt.render)
    app.set('ui-ready', true)

    if (config.listenWhenReady) {
      server.listen(config.port)
      await eventPromise(server, 'listening')
    }
  }

  if (config.observer.active) {
    const { startObserver } = await import('@data-fair/lib-node/observer.js')
    await metrics.init(db)
    if (config.mode.includes('server')) {
      await import('./misc/utils/metrics-api.ts')
    }
    await startObserver(config.observer.port)
  }

  return app
}

export const stop = async () => {
  if (config.mode.includes('server')) {
    await wsServer.stop()
    if (httpTerminator) await httpTerminator.terminate()
  }

  if (config.mode.includes('worker')) {
    await (await import('./workers/index.ts')).stop()
  }

  await locks.stop()

  if (config.observer.active) {
    const { stopObserver } = await import('@data-fair/lib-node/observer.js')
    await stopObserver()
  }

  // this timeout is because we can have a few small pending operations after worker and server were closed
  await new Promise(resolve => setTimeout(resolve, 1000))
  await Promise.all([
    mongo.client.close(),
    es.client.close()
  ])
}
