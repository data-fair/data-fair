import { resolve, parse as parsePath, join } from 'node:path'
import express from 'express'
import config from '#config'
import uiConfig from './ui-config.ts'
import mongo from '#mongo'
import memoize from 'memoizee'
import * as esUtils from './datasets/es/index.ts'
import * as wsServer from '@data-fair/lib-express/ws-server.js'
import * as wsEmitter from '@data-fair/lib-node/ws-emitter.js'
import locks from '@data-fair/lib-node/locks.js'
import * as observe from './misc/utils/observe.js'
import * as metrics from './misc/utils/metrics.js'
import debug from 'debug'
import EventEmitter from 'node:events'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import { internalError } from '@data-fair/lib-node/observer.js'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import upgradeScripts from '@data-fair/lib-node/upgrade-scripts.js'
import { createSpaMiddleware } from '@data-fair/lib-express/serve-spa.js'

const debugDomain = debug('domain')

// a global event emitter for testing
if (process.env.NODE_ENV === 'test') {
  global.events = new EventEmitter()
}

let app, server, httpTerminator

// Run app and return it in a promise
export const run = async () => {
  app = express()

  // a middleware for performance analysis
  app.use(observe.observeReqMiddleware)

  if (config.mode.includes('server')) {
    const limits = await import('./misc/utils/limits.js')
    const rateLimiting = await import('./misc/utils/rate-limiting.js')
    const session = (await import('@data-fair/sd-express')).default({
      directoryUrl: config.directoryUrl,
      privateDirectoryUrl: config.privateDirectoryUrl
    })
    const { session: libSession } = await import('@data-fair/lib-express/index.js')
    libSession.init(config.directoryUrl)
    app.set('session', session)

    app.set('trust proxy', 1)
    app.set('json spaces', 2)

    app.set('query parser', 'simple')
    app.use((req, res, next) => {
      for (const key of Object.keys(req.query)) {
        if (Array.isArray(req.query[key])) {
          return res.status(400).send(`query parameter "${key}" is defined multiple times`)
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
    app.use((await import('cookie-parser')).default())
    app.use((await import('../i18n/utils.js')).middleware)
    app.use(session.auth)

    // TODO: we could make this better targetted but more verbose by adding it to all routes
    app.use((await import('./misc/utils/expect-type.js')).default(['application/json', 'application/x-ndjson', 'multipart/form-data', 'text/csv', 'text/csv+gzip']))

    // set current baseUrl, i.e. the url of data-fair on the current user's domain
    // check for the matching publicationSite, etc
    const parsedPublicUrl = new URL(config.publicUrl)
    let basePath = parsedPublicUrl.pathname
    if (!basePath.endsWith('/')) basePath += '/'
    const { default: originalUrl } = await import('original-url')
    const { format: formatUrl } = await import('url')
    const getPublicationSiteSettings = async (publicationSiteUrl, publicationSiteQuery, db) => {
      const elemMatch = publicationSiteQuery
        ? { type: publicationSiteQuery.split(':')[0], id: publicationSiteQuery.split(':')[1] }
        : { url: publicationSiteUrl }
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
      const u = originalUrl(req)
      const urlParts = { protocol: parsedPublicUrl.protocol, hostname: u.hostname, pathname: basePath.slice(0, -1) }
      if (u.port !== 443 && u.port !== 80) urlParts.port = u.port
      req.publicBaseUrl = u.full ? formatUrl(urlParts) : config.publicUrl

      const mainDomain = req.publicBaseUrl === config.publicUrl

      const publicationSiteUrl = parsedPublicUrl.protocol + '//' + u.hostname + ((u.port && u.port !== 80 && u.port !== 443) ? ':' + u.port : '')
      const settings = await memoizedGetPublicationSiteSettings(publicationSiteUrl, mainDomain && req.query.publicationSites, mongo.db)
      if (!settings && !mainDomain) {
        internalError('publication-site-unknown', 'no publication site is associated to URL ' + publicationSiteUrl)
        return res.status(404).send('publication site unknown')
      }
      if (settings) {
        const publicationSite = {
          owner: { type: settings.type, id: settings.id, department: settings.department, name: settings.name },
          ...settings.publicationSites[0]
        }
        if (mainDomain) {
          if (publicationSite.url === publicationSiteUrl) {
            req.mainPublicationSite = publicationSite
          }
          if (req.query.publicationSites === publicationSite.type + ':' + publicationSite.id) {
            req.publicationSite = publicationSite
          }
        } else {
          req.publicationSite = publicationSite
        }
      }

      req.directoryUrl = u.full ? formatUrl({ ...urlParts, pathname: '/simple-directory' }) : config.directoryUrl
      debugDomain('req.publicBaseUrl', req.publicBaseUrl)
      req.publicWsBaseUrl = req.publicBaseUrl.replace('http:', 'ws:').replace('https:', 'wss:') + '/'
      debugDomain('req.publicWsBaseUrl', req.publicWsBaseUrl)
      req.publicBasePath = basePath
      debugDomain('req.publicBasePath', req.publicBasePath)
      next()
    })

    // Business routers
    const { middleware: apiKey } = await import('./misc/utils/api-key.js')
    app.use('/api/v1', (await import('./misc/routers/root.js')).default)
    app.use('/api/v1/remote-services', (await import('./remote-services/router.js')).router)
    app.use('/api/v1/remote-services-actions', (await import('./remote-services/router.js')).actionsRouter)
    app.use('/api/v1/catalog', apiKey('datasets'), (await import('./misc/routers/catalog.js')).default)
    app.use('/api/v1/catalogs', apiKey('catalogs'), (await import('./catalogs/router.js')).default)
    app.use('/api/v1/base-applications', (await import('./base-applications/router.js')).router)
    app.use('/api/v1/applications', apiKey('applications'), (await import('./applications/router.js')).default)
    app.use('/api/v1/datasets', rateLimiting.middleware(), (await import('./datasets/router.js')).default)
    app.use('/api/v1/stats', apiKey('stats'), (await import('./misc/routers/stats.js')).default)
    app.use('/api/v1/settings', (await import('./misc/routers/settings.js')).default)
    app.use('/api/v1/admin', (await import('./misc/routers/admin.js')).default)
    app.use('/api/v1/identities', (await import('./misc/routers/identities.js')).default)
    app.use('/api/v1/activity', (await import('./misc/routers/activity.js')).default)
    app.use('/api/v1/limits', limits.router)

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
      app.use('/next-ui', await createSpaMiddleware(resolve(import.meta.dirname, '../../next-ui/dist'), uiConfig, { ignoreSitePath: true }))
    }

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
    await upgradeScripts(db, locks, resolve(import.meta.dirname, '../..'))
  }

  app.set('es', await esUtils.init())

  await wsEmitter.init(db)

  if (config.mode.includes('server')) {
    const errorHandler = (await import('@data-fair/lib-express/error-handler.js')).default

    // Error management
    app.use(errorHandler)

    const limits = await import('./misc/utils/limits.js')
    const permissions = await import('./misc/utils/permissions.js')
    const { readApiKey } = await import('./misc/utils/api-key.js')
    await Promise.all([
      (await import('./misc/utils/capture.js')).init(),
      (await import('./misc/utils/cache.js')).init(db),
      (await import('./remote-services/utils.js')).init(db),
      (await import('./base-applications/router.js')).init(db),
      limits.init(db),
      wsServer.start(server, db, async (channel, sessionState, message) => {
        if (process.env.NODE_ENV === 'test') {
          // TODO: remove this ugly exception, this code should be tested
          return true
        }
        const [type, id, subject] = channel.split('/')
        const resource = await db.collection(type).findOne({ id })
        if (!resource) throw httpError(404, `Ressource ${type}/${id} inconnue.`)
        let user = sessionState.user
        if (message.apiKey) user = await readApiKey(db, message.apiKey, type, message.account)
        return !permissions.can(type, resource, `realtime-${subject}`, user)
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

  if (config.mode.includes('worker')) {
    (await import('./workers/index.js')).start(app)
  }

  // special mode: run the process to execute a single worker tasks
  // for  extra resiliency to fatal memory exceptions
  if (config.mode === 'task') {
    const resource = await mongo.db.collection(process.argv[3] + 's').findOne({ id: process.argv[4] })
    if (process.env.DATASET_DRAFT === 'true') {
      const datasetUtils = await import('./datasets/utils/index.js')

      datasetUtils.mergeDraft(resource)
    }
    const task = await (await import('./workers/index.js')).tasks[process.argv[2]]()
    await task.process(app, resource)
  } else if (config.observer.active) {
    const { startObserver } = await import('@data-fair/lib-node/observer.js')
    await metrics.init(db)
    await startObserver()
  }

  return app
}

export const stop = async () => {
  if (config.mode.includes('server')) {
    await wsServer.stop()
    await httpTerminator.terminate()
  }

  if (config.mode.includes('worker')) {
    await (await import('./workers/index.js')).stop()
  }

  await locks.stop()

  if (config.mode !== 'task' && config.observer.active) {
    const { stopObserver } = await import('@data-fair/lib-node/observer.js')
    await stopObserver()
  }

  // this timeout is because we can have a few small pending operations after worker and server were closed
  await new Promise(resolve => setTimeout(resolve, 1000))
  await Promise.all([
    mongo.client.close(),
    app.get('es').close()
  ])
}
