const config = require('config')
const express = require('express')
const eventToPromise = require('event-to-promise')
const dbUtils = require('./utils/db')
const esUtils = require('./utils/es')
const wsUtils = require('./utils/ws')
const locksUtils = require('./utils/locks')
const workers = require('./workers')
const session = require('@koumoul/sd-express')({
  directoryUrl: config.directoryUrl,
  privateDirectoryUrl: config.privateDirectoryUrl || config.directoryUrl,
  publicUrl: config.publicUrl,
  cookieDomain: config.sessionDomain
})

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
    const proxy = require('http-proxy-middleware')
    app.use('/openapi-viewer', proxy({ target: 'http://localhost:5680', pathRewrite: { '^/openapi-viewer': '' } }))
    app.use('/simple-directory', proxy({ target: 'http://localhost:8080', pathRewrite: { '^/simple-directory': '' } }))
    app.use('/capture', proxy({ target: 'http://localhost:8087', pathRewrite: { '^/capture': '' } }))
  }

  const bodyParser = require('body-parser').json({ limit: '1000kb' })
  app.use((req, res, next) => {
    // routes with _bulk are streamed, others are parsed as JSON
    if (req.url.split('/').pop().indexOf('_bulk') === 0) return next()
    bodyParser(req, res, next)
  })
  app.use(require('cookie-parser')())
  app.use(session.cors({ acceptAllOrigins: true }))

  // Business routers
  const apiKey = require('./utils/api-key')
  app.use('/api/v1', require('./routers/root'))
  app.use('/api/v1/remote-services', session.auth, require('./routers/remote-services').router)
  app.use('/api/v1/catalogs', session.auth, apiKey('catalogs'), require('./routers/catalogs'))
  app.use('/api/v1/base-applications', session.auth, require('./routers/base-applications').router)
  app.use('/api/v1/applications', session.auth, apiKey('applications'), require('./routers/applications'))
  app.use('/api/v1/datasets', session.auth, apiKey('datasets'), require('./routers/datasets'))
  app.use('/api/v1/stats', session.auth, apiKey('stats'), require('./routers/stats'))
  app.use('/api/v1/settings', session.auth, require('./routers/settings'))
  app.use('/api/v1/admin', session.auth, require('./routers/admin'))
  app.use('/api/v1/identities', require('./routers/identities'))
  app.use('/api/v1/quotas', session.auth, require('./routers/quotas'))
  app.use('/api/v1/session', session.router)

  // External applications proxy
  const serviceWorkers = require('./utils/service-workers')
  app.get('/app-sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript')
    res.send(serviceWorkers.sw(req.application))
  })
  app.use('/app', session.loginCallback, session.auth, require('./routers/application-proxy'))

  // Error management
  app.use((err, req, res, next) => {
    if (err.name === 'UnauthorizedError') {
      return res.status(401).send('invalid token...')
    }
    if (err.statusCode === 500 || !err.statusCode) console.error('Error in express route', err)
    if (!res.headersSent) res.status(err.statusCode || 500).send(err.message)
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

  await dbUtils.init(db)
  app.set('db', db)
  app.set('mongoClient', client)
  app.set('es', await esUtils.init())
  app.publish = await wsUtils.initPublisher(db)

  if (config.mode.includes('server')) {
    const anonymSession = await require('./utils/anonym-session').init(db)
    app.set('anonymSession', anonymSession)
    await require('./utils/capture').init()
    await require('./utils/cache').init(db)
    require('./routers/base-applications').init(db)
    await require('./routers/remote-services').init(db)
    await wsUtils.initServer(wss, db)
    // At this stage the server is ready to respond to API requests
    app.set('api-ready', true)

    app.use((req, res, next) => {
      if (!req.app.get('ui-ready')) res.status(503).send('Service indisponible pour cause de maintenance.')
      else next()
    })
    app.use(session.decode)
    app.use(session.loginCallback)
    const nuxtMiddleware = await require('./nuxt')()
    // init anonym session on data-fair UI to support using remote services from outside application
    // for example map embeds
    app.use(anonymSession)
    app.use((req, res, next) => {
      req.session.activeApplications = req.session.activeApplications || []
      next()
    })
    app.use(nuxtMiddleware)
    app.set('ui-ready', true)

    if (config.listenWhenReady) {
      server.listen(config.port)
      await eventToPromise(server, 'listening')
    }
  }

  if (config.mode.includes('worker')) {
    await locksUtils.init(db)
    workers.start(app)
  }

  // special mode: run the process to execute a single worker tasks
  // for  extra resiliency to fatal memory exceptions
  if (config.mode === 'task') {
    const resource = await app.get('db').collection(process.argv[3] + 's').findOne({ id: process.argv[4] })
    await workers.tasks[process.argv[2]].process(app, resource)
  }

  return app
}

exports.stop = async() => {
  if (config.mode.includes('server')) {
    await require('util').promisify((cb) => wss.close(cb))()
    server.close()
    await eventToPromise(server, 'close')
    await wsUtils.stop()
  }

  if (config.mode.includes('worker')) {
    locksUtils.stop()
    await workers.stop()
  }

  await app.get('mongoClient').close()
  await app.get('es').close()
}
