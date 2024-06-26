const config = /** @type {any} */(require('config'))
const express = require('express')
const memoize = require('memoizee')
const dbUtils = require('./misc/utils/db')
const esUtils = require('./datasets//es')
const wsUtils = require('./misc/utils/ws')
const locksUtils = require('./misc/utils/locks')
const observe = require('./misc/utils/observe')
const asyncWrap = require('./misc/utils/async-handler')
const metrics = require('./misc/utils/metrics')
const debugDomain = require('debug')('domain')

// a global event emitter for testing
if (process.env.NODE_ENV === 'test') {
  const EventEmitter = require('events')
  global.events = new EventEmitter()
}

const app = express()
let server, wss, httpTerminator

// a middleware for performance analysis
app.use(observe.observeReqMiddleware)

if (config.mode.includes('server')) {
  const limits = require('./misc/utils/limits')
  const rateLimiting = require('./misc/utils/rate-limiting')
  const session = require('@data-fair/sd-express')({
    directoryUrl: config.directoryUrl,
    privateDirectoryUrl: config.privateDirectoryUrl
  })
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

  app.use(require('cors')())
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
  app.use(require('cookie-parser')())
  app.use(require('./i18n/utils').middleware)
  app.use(session.auth)

  // TODO: we could make this better targetted but more verbose by adding it to all routes
  app.use(require('./misc/utils/expect-type')(['application/json', 'application/x-ndjson', 'multipart/form-data', 'text/csv', 'text/csv+gzip']))

  // set current baseUrl, i.e. the url of data-fair on the current user's domain
  // check for the matching publicationSite, etc
  const parsedPublicUrl = new URL(config.publicUrl)
  let basePath = parsedPublicUrl.pathname
  if (!basePath.endsWith('/')) basePath += '/'
  const originalUrl = require('original-url')
  const { format: formatUrl } = require('url')
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
  const memoizedGetPublicationSiteSettings = exports.memoizedGetPublicationSiteSettings = memoize(getPublicationSiteSettings, {
    profileName: 'getPublicationSiteSettings',
    promise: true,
    primitive: true,
    max: 10000,
    maxAge: 1000 * 60, // 1 minute
    length: 2 // only use publicationSite, not db as cache key
  })
  app.use('/', asyncWrap(async (req, res, next) => {
    const u = originalUrl(req)
    const urlParts = { protocol: parsedPublicUrl.protocol, hostname: u.hostname, pathname: basePath.slice(0, -1) }
    if (u.port !== 443 && u.port !== 80) urlParts.port = u.port
    req.publicBaseUrl = u.full ? formatUrl(urlParts) : config.publicUrl

    const mainDomain = req.publicBaseUrl === config.publicUrl

    const publicationSiteUrl = parsedPublicUrl.protocol + '//' + u.hostname + ((u.port && u.port !== 80 && u.port !== 443) ? ':' + u.port : '')
    const settings = await memoizedGetPublicationSiteSettings(publicationSiteUrl, mainDomain && req.query.publicationSites, req.app.get('db'))
    if (!settings && !mainDomain) {
      metrics.internalError('publication-site-unknown', 'no publication site is associated to URL ' + publicationSiteUrl)
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
  }))

  // Business routers
  const apiKey = require('./misc/utils/api-key').middleware
  app.use('/api/v1', require('./misc/routers/root'))
  app.use('/api/v1/remote-services', require('./remote-services/router').router)
  app.use('/api/v1/remote-services-actions', require('./remote-services/router').actionsRouter)
  app.use('/api/v1/catalog', apiKey('datasets'), require('./misc/routers/catalog'))
  app.use('/api/v1/catalogs', apiKey('catalogs'), require('./catalogs/router'))
  app.use('/api/v1/base-applications', require('./base-applications/router').router)
  app.use('/api/v1/applications', apiKey('applications'), require('./applications/router'))
  app.use('/api/v1/datasets', rateLimiting.middleware(), require('./datasets/router'))
  app.use('/api/v1/stats', apiKey('stats'), require('./misc/routers/stats'))
  app.use('/api/v1/settings', require('./misc/routers/settings'))
  app.use('/api/v1/admin', require('./misc/routers/admin'))
  app.use('/api/v1/identities', require('./misc/routers/identities'))
  app.use('/api/v1/activity', require('./misc/routers/activity'))
  app.use('/api/v1/limits', limits.router)

  app.use('/api/', (req, res) => {
    return res.status(404).send('unknown api endpoint')
  })

  // External applications proxy
  const serviceWorkers = require('./misc/utils/service-workers')
  app.get('/app-sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.send(serviceWorkers.sw(req.application))
  })
  app.use('/app', require('./applications/proxy'))

  // self hosting of streamsaver man in the middle service worker
  // see https://github.com/jimmywarting/StreamSaver.js/issues/183
  app.use('/streamsaver/mitm.html', express.static('node_modules/streamsaver/mitm.html'))
  app.use('/streamsaver/sw.js', express.static('node_modules/streamsaver/sw.js'))

  const WebSocket = require('ws')
  server = require('http').createServer(app)
  const { createHttpTerminator } = require('http-terminator')
  httpTerminator = createHttpTerminator({ server })
  // cf https://connectreport.com/blog/tuning-http-keep-alive-in-node-js/
  // timeout is often 60s on the reverse proxy, better to a have a longer one here
  // so that interruption is managed downstream instead of here
  server.keepAliveTimeout = (60 * 1000) + 1000
  server.headersTimeout = (60 * 1000) + 2000
  server.requestTimeout = (15 * 60 * 1000)
  wss = new WebSocket.Server({ server })
}

// Run app and return it in a promise
exports.run = async () => {
  if (!config.listenWhenReady && config.mode.includes('server')) {
    server.listen(config.port)
    await require('event-to-promise')(server, 'listening')
  }

  const { db, client } = await dbUtils.connect()

  await locksUtils.init(db)
  if (config.mode.includes('worker')) {
    const ack = await locksUtils.acquire(db, 'upgrade', 'worker')
    if (!ack) {
      console.warn('upgrade scripts lock is already acquired, skip them')
      // IMPORTANT: this behaviour of running the worker when the upgrade scripts are still running implies
      // that they cannot be considered as a pre-requisite. Note that this was already tru for the API anyway.
      // if we want to consider the upgrade scripts as a pre-requisite we should implement a wait on all
      // containers for the scripts that are running in only 1 (while loop on "acquire" ?) and a healthcheck so that workers
      // are not considered "up" and the previous versions keep running in the mean time
    } else {
      await require('../upgrade')(db, client)
      await locksUtils.release(db, 'upgrade')
    }
  }

  await Promise.all([
    dbUtils.init(db),
    esUtils.init().then(es => app.set('es', es))
  ])
  app.set('db', db)
  app.set('mongoClient', client)

  app.publish = await wsUtils.initPublisher(db)

  if (config.mode.includes('server')) {
    const errorHandler = (await import('@data-fair/lib/express/error-handler.js')).default

    // Error management
    app.use(errorHandler)

    const limits = require('./misc/utils/limits')
    await Promise.all([
      require('./misc/utils/capture').init(),
      require('./misc/utils/cache').init(db),
      require('./remote-services/utils').init(db),
      require('./base-applications/router').init(db),
      limits.init(db),
      wsUtils.initServer(wss, db, app.get('session'))
    ])
    // At this stage the server is ready to respond to API requests
    app.set('api-ready', true)

    app.use((req, res, next) => {
      if (!req.app.get('ui-ready')) res.status(503).type('text/plain').send('Service indisponible pour cause de maintenance.')
      else next()
    })

    const nuxt = await require('./nuxt')()
    app.set('nuxt', nuxt.instance)
    app.use(nuxt.trackEmbed)
    app.use(nuxt.render)
    app.set('ui-ready', true)

    if (config.listenWhenReady) {
      server.listen(config.port)
      await require('event-to-promise')(server, 'listening')
    }
  }

  if (config.mode.includes('worker')) {
    require('./workers').start(app)
  }

  // special mode: run the process to execute a single worker tasks
  // for  extra resiliency to fatal memory exceptions
  if (config.mode === 'task') {
    const resource = await app.get('db').collection(process.argv[3] + 's').findOne({ id: process.argv[4] })
    if (process.env.DATASET_DRAFT === 'true') {
      const datasetUtils = require('./datasets/utils')
      datasetUtils.mergeDraft(resource)
    }
    await require('./workers').tasks[process.argv[2]].process(app, resource)
  } else if (config.observer.active) {
    const { startObserver } = await import('@data-fair/lib/node/observer.js')
    await metrics.init(db)
    await startObserver()
  }

  return app
}

exports.stop = async () => {
  if (config.mode.includes('server')) {
    wss.close()
    wsUtils.stop(wss)
    await require('event-to-promise')(wss, 'close')
    await httpTerminator.terminate()
  }

  if (config.mode.includes('worker')) {
    await require('./workers').stop()
  }

  await locksUtils.stop(app.get('db'))

  if (config.mode !== 'task' && config.observer.active) {
    const { stopObserver } = await import('@data-fair/lib/node/observer.js')
    await stopObserver()
  }

  // this timeout is because we can have a few small pending operations after worker and server were closed
  await new Promise(resolve => setTimeout(resolve, 1000))
  await Promise.all([
    app.get('mongoClient').close(),
    app.get('es').close()
  ])
}
