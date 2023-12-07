const config = require('config')
const express = require('express')
const memoize = require('memoizee')
const dbUtils = require('./utils/db')
const esUtils = require('./utils/es')
const wsUtils = require('./utils/ws')
const locksUtils = require('./utils/locks')
const prometheus = require('./utils/prometheus')
const asyncWrap = require('./utils/async-wrap')
const sanitizeHtml = require('../shared/sanitize-html')
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
  const session = require('@data-fair/sd-express')({
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
    return await db.collection('settings').findOne({ publicationSites: { $elemMatch: elemMatch } }, {
      projection: {
        type: 1,
        id: 1,
        department: 1,
        name: 1,
        publicationSites: { $elemMatch: elemMatch }
      }
    }
    )
  }
  const memoizedGetPublicationSiteSettings = exports.memoizedGetPublicationSiteSettings = memoize(getPublicationSiteSettings, {
    primitive: true,
    max: 10000,
    maxAge: 1000 * 60, // 1 minute
    length: 1 // only use publicationSite, not db as cache key
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
      console.error('(publication-site-unknown) no publication site is associated to URL ' + publicationSiteUrl)
      prometheus.internalError.inc({ errorCode: 'publication-site-unknown' })
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
  const apiKey = require('./utils/api-key').middleware
  app.use('/api/v1', require('./routers/root'))
  app.use('/api/v1/remote-services', require('./routers/remote-services').router)
  app.use('/api/v1/remote-services-actions', require('./routers/remote-services').actionsRouter)
  app.use('/api/v1/catalog', apiKey('datasets'), require('./routers/catalog'))
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
  app.use('/api/v1/inspector', require('./utils/inspect').router)

  app.use('/api/', (req, res) => {
    return res.status(404).send('unknown api endpoint')
  })

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
    err.message = err.message?.replace('[noretry] ', '')
    if (!res.headersSent) {
      res.set('Cache-Control', 'no-cache')
      res.set('Expires', '-1')
      // settings content-type as plain text instead of html to prevent XSS attack
      res.type('text/plain')
      // sanitize is not strictly necessary as the error is in plain text
      // but it is added for extra-caution if UI choses to show the error message as html
      res.status(status).send(sanitizeHtml(err.message))
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
