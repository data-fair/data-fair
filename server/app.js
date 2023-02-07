const config = require('config')
const express = require('express')
const dbUtils = require('./utils/db')
const esUtils = require('./utils/es')
const wsUtils = require('./utils/ws')
const locksUtils = require('./utils/locks')
const prometheus = require('./utils/prometheus')
const debugDomain = require('debug')('domain')

// a global event emitter for testing
if (process.env.NODE_ENV === 'test') {
  const EventEmitter = require('events')
  global.events = new EventEmitter()
}

const app = express()
let server, wss, httpTerminator

// a middleware for performance analysis
app.use((req, res, next) => {
  req.ts = new Date().getTime()
  next()
})

if (config.mode.includes('server')) {
  const limits = require('./utils/limits')
  const rateLimiting = require('./utils/rate-limiting')
  const session = require('@koumoul/sd-express')({
    directoryUrl: config.directoryUrl,
    privateDirectoryUrl: config.privateDirectoryUrl
  })
  app.set('session', session)

  app.set('trust proxy', 1)
  app.set('json spaces', 2)

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
    if (!req.app.get('api-ready')) res.status(503).send('Service indisponible pour cause de maintenance.')
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
  app.use(require('./utils/i18n').middleware)
  app.use(session.auth)

  // TODO: we could make this better targetted but more verbose by adding it to all routes
  app.use(require('./utils/expect-type')(['application/json', 'application/x-ndjson', 'multipart/form-data', 'text/csv', 'text/csv+gzip']))

  // set current baseUrl, i.e. the url of data-fair on the current user's domain
  let basePath = new URL(config.publicUrl).pathname
  if (!basePath.endsWith('/')) basePath += '/'
  const originalUrl = require('original-url')
  const { format: formatUrl } = require('url')
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
  const apiKey = require('./utils/api-key').middleware
  app.use('/api/v1', require('./routers/root'))
  app.use('/api/v1/remote-services', require('./routers/remote-services').router)
  app.use('/api/v1/catalogs', apiKey('catalogs'), require('./routers/catalogs'))
  app.use('/api/v1/base-applications', require('./routers/base-applications').router)
  app.use('/api/v1/applications', apiKey('applications'), require('./routers/applications'))
  app.use('/api/v1/datasets', rateLimiting.middleware(), apiKey('datasets'), require('./routers/datasets'))
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
    if (err.code === 'ECONNRESET') err.statusCode = 400
    const status = err.statusCode || err.status || 500
    if (status === 500) {
      console.error('(http) Error in express route', req.originalUrl, err)
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
  const { createHttpTerminator } = require('http-terminator')
  httpTerminator = createHttpTerminator({ server })
  // cf https://connectreport.com/blog/tuning-http-keep-alive-in-node-js/
  // timeout is often 60s on the reverse proxy, better to a have a longer one here
  // so that interruption is managed downstream instead of here
  server.keepAliveTimeout = (60 * 1000) + 1000
  server.headersTimeout = (60 * 1000) + 2000
  wss = new WebSocket.Server({ server })
}

// Run app and return it in a promise
exports.run = async () => {
  if (!config.listenWhenReady && config.mode.includes('server')) {
    server.listen(config.port)
    await require('event-to-promise')(server, 'listening')
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
    const limits = require('./utils/limits')
    await Promise.all([
      require('./utils/capture').init(),
      require('./utils/cache').init(db),
      require('./routers/remote-services').init(db),
      require('./routers/base-applications').init(db),
      limits.init(db),
      wsUtils.initServer(wss, db, app.get('session'))
    ])
    // At this stage the server is ready to respond to API requests
    app.set('api-ready', true)

    app.use((req, res, next) => {
      if (!req.app.get('ui-ready')) res.status(503).send('Service indisponible pour cause de maintenance.')
      else next()
    })
    app.use(app.get('session').auth)

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

  await locksUtils.init(db)

  // special mode: run the process to execute a single worker tasks
  // for  extra resiliency to fatal memory exceptions
  if (config.mode === 'task') {
    const resource = await app.get('db').collection(process.argv[3] + 's').findOne({ id: process.argv[4] })
    if (process.env.DATASET_DRAFT === 'true') {
      const datasetUtils = require('./utils/dataset')
      datasetUtils.mergeDraft(resource)
    }
    await require('./workers').tasks[process.argv[2]].process(app, resource)
  } else if (config.prometheus.active) {
    await prometheus.start(db)
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

  if (config.mode !== 'task' && config.prometheus.active) {
    await prometheus.stop()
  }

  // this timeout is because we can have a few small pending operations after worker and server were closed
  await new Promise(resolve => setTimeout(resolve, 1000))
  await Promise.all([
    app.get('mongoClient').close(),
    app.get('es').close()
  ])
}
