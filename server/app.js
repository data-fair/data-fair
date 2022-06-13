const config = require('config')
const express = require('express')
const eventToPromise = require('event-to-promise')
const originalUrl = require('original-url')
const { format: formatUrl } = require('url')
const cors = require('cors')
const EventEmitter = require('events')
const dbUtils = require('./utils/db')
const esUtils = require('./utils/es')
const wsUtils = require('./utils/ws')
const limits = require('./utils/limits')
const locksUtils = require('./utils/locks')
const rateLimiting = require('./utils/rate-limiting')
const datasetUtils = require('./utils/dataset')
const i18n = require('./utils/i18n')
const expectType = require('./utils/expect-type')
const workers = require('./workers')
const prometheus = require('./utils/prometheus')
const session = require('@koumoul/sd-express')({
  directoryUrl: config.directoryUrl,
  privateDirectoryUrl: config.privateDirectoryUrl || config.directoryUrl
})
const debugDomain = require('debug')('domain')

// a global event emitter for testing
global.events = new EventEmitter()

const app = express()
let server, wss

if (config.mode.includes('server')) {
  app.use((req, res, next) => {
    if (!req.app.get('api-ready')) res.status(503).send('Service indisponible pour cause de maintenance.')
    else next()
  })

  app.set('trust proxy', 1)
  app.set('json spaces', 2)

  if (process.env.NODE_ENV === 'development') {
    // Create a mono-domain environment with other services in dev
    const { createProxyMiddleware } = require('http-proxy-middleware')
    app.use('/openapi-viewer', createProxyMiddleware({ target: 'http://localhost:5680', pathRewrite: { '^/openapi-viewer': '' } }))
    app.use('/simple-directory', createProxyMiddleware({ target: 'http://localhost:8080', pathRewrite: { '^/simple-directory': '' } }))
    app.use('/capture', createProxyMiddleware({ target: 'http://localhost:8087', pathRewrite: { '^/capture': '' } }))
    app.use('/notify', createProxyMiddleware({ target: 'http://localhost:8088', pathRewrite: { '^/notify': '' } }))

    // but also serve this whole service on another domain, use this to simulate a portal exposed independantly
    const mirrorApp = express()
    mirrorApp.use('/', createProxyMiddleware({ target: 'http://localhost:5600' }))
    mirrorApp.listen(5601, () => {
      console.log('mirror server listening on http://localhost:5601')
    })
  }

  const bodyParser = express.json({ limit: '1000kb' })
  app.use((req, res, next) => {
    // routes with _bulk are streamed, others are parsed as JSON
    if (req.url.split('/').pop().indexOf('_bulk') === 0) return next()
    bodyParser(req, res, next)
  })
  app.use(require('cookie-parser')())
  app.use(i18n.middleware)
  app.use(cors())
  app.use(session.auth)

  // TODO: we could make this better targetted but more verbose by adding it to all routes
  app.use(expectType(['application/json', 'application/x-ndjson', 'multipart/form-data', 'text/csv', 'text/csv+gzip']))

  // set current baseUrl, i.e. the url of data-fair on the current user's domain
  let basePath = new URL(config.publicUrl).pathname
  if (!basePath.endsWith('/')) basePath += '/'
  app.use('/', (req, res, next) => {
    const u = originalUrl(req)
    const urlParts = { protocol: u.protocol, hostname: u.hostname, pathname: basePath.slice(0, -1) }
    if (u.port !== 443 && u.port !== 80) urlParts.port = u.port
    req.publicBaseUrl = u.full ? formatUrl(urlParts) : config.publicUrl
    req.directoryUrl = u.full ? formatUrl({ ...urlParts, pathname: '/simple-directory' }) : config.directoryUrl
    debugDomain('req.publicBaseUrl', req.publicBaseUrl)
    req.publicWsBaseUrl = req.publicBaseUrl.replace('http:', 'ws:').replace('https:', 'wss:') + '/'
    debugDomain('req.publicWsBaseUrl', req.publicWsBaseUrl)
    req.publicBasePath = basePath
    debugDomain('req.publicBasePath', req.publicBasePath)
    next()
  })

  // Business routers
  const apiKey = require('./utils/api-key')
  app.use('/api/v1', require('./routers/root'))
  app.use('/api/v1/remote-services', require('./routers/remote-services').router)
  app.use('/api/v1/catalogs', apiKey('catalogs'), require('./routers/catalogs'))
  app.use('/api/v1/base-applications', require('./routers/base-applications').router)
  app.use('/api/v1/applications', apiKey('applications'), require('./routers/applications'))
  app.use('/api/v1/datasets', rateLimiting.middleware, apiKey('datasets'), require('./routers/datasets'))
  app.use('/api/v1/stats', apiKey('stats'), require('./routers/stats'))
  app.use('/api/v1/settings', require('./routers/settings'))
  app.use('/api/v1/admin', require('./routers/admin'))
  app.use('/api/v1/identities', require('./routers/identities'))
  app.use('/api/v1/activity', require('./routers/activity'))
  app.use('/api/v1/limits', limits.router)

  // External applications proxy
  const serviceWorkers = require('./utils/service-workers')
  app.get('/app-sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.send(serviceWorkers.sw(req.application))
  })
  app.use('/app', require('./routers/application-proxy'))

  // self hosting of streamsaver man in the middle service worker
  // see https://github.com/jimmywarting/StreamSaver.js/issues/183
  app.use('/streamsaver/mitm.html', express.static('node_modules/streamsaver/mitm.html'))
  app.use('/streamsaver/sw.js', express.static('node_modules/streamsaver/sw.js'))

  // Error management
  app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
      return res.status(401).send('invalid token...')
    }
    const status = err.statusCode || err.status || 500
    if (status === 500) {
      console.error('(http) Error in express route', err)
      prometheus.internalError.inc({ errorCode: 'http' })
    }
    if (!res.headersSent) {
      res.set('Cache-Control', 'no-cache')
      res.set('Expires', '-1')
      res.status(status).send(err.message)
    } else {
      res.end()
    }
  })

  const WebSocket = require('ws')
  server = require('http').createServer(app)
  wss = new WebSocket.Server({ server })
}

// Run app and return it in a promise
exports.run = async () => {
  if (!config.listenWhenReady && config.mode.includes('server')) {
    server.listen(config.port)
    await eventToPromise(server, 'listening')
  }

  let db, client
  if (config.mode.includes('worker')) {
    ({ db, client } = await require('../upgrade')())
  } else {
    ({ db, client } = await dbUtils.connect())
  }

  await Promise.all([
    dbUtils.init(db),
    esUtils.init().then(es => app.set('es', es))
  ])
  app.set('db', db)
  app.set('mongoClient', client)

  app.publish = await wsUtils.initPublisher(db)

  if (config.mode.includes('server')) {
    await Promise.all([
      require('./utils/capture').init(),
      require('./utils/cache').init(db),
      require('./routers/remote-services').init(db),
      require('./routers/base-applications').init(db),
      limits.init(db),
      wsUtils.initServer(wss, db, session)
    ])
    // At this stage the server is ready to respond to API requests
    app.set('api-ready', true)

    app.use((req, res, next) => {
      if (!req.app.get('ui-ready')) res.status(503).send('Service indisponible pour cause de maintenance.')
      else next()
    })
    app.use(session.auth)
    app.set('session', session)

    const nuxt = await require('./nuxt')()
    app.set('nuxt', nuxt.instance)
    app.use(nuxt.render)
    app.set('ui-ready', true)

    if (config.listenWhenReady) {
      server.listen(config.port)
      await eventToPromise(server, 'listening')
    }
  }

  if (config.mode.includes('worker')) {
    workers.start(app)
  }

  await locksUtils.init(db)

  // special mode: run the process to execute a single worker tasks
  // for  extra resiliency to fatal memory exceptions
  if (config.mode === 'task') {
    const resource = await app.get('db').collection(process.argv[3] + 's').findOne({ id: process.argv[4] })
    if (process.env.DATASET_DRAFT === 'true') {
      datasetUtils.mergeDraft(resource)
    }
    await workers.tasks[process.argv[2]].process(app, resource)
  } else if (config.prometheus.active) {
    await prometheus.start(db)
  }

  return app
}

exports.stop = async () => {
  if (config.mode.includes('server')) {
    wss.close()
    wsUtils.stop(wss)
    await eventToPromise(wss, 'close')
    server.close()
    await eventToPromise(server, 'close')
  }

  if (config.mode.includes('worker')) {
    await workers.stop()
  }

  await locksUtils.stop(app.get('db'))

  if (config.mode !== 'task' && config.prometheus.active) {
    await prometheus.stop()
  }

  // this timeout is because we can a few small pending operations after worker and server were closed
  await new Promise(resolve => setTimeout(resolve, 1000))
  await Promise.all([
    app.get('mongoClient').close(),
    app.get('es').close()
  ])
}
