const config = require('config')
const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const WebSocket = require('ws')
const http = require('http')
const util = require('util')
const eventToPromise = require('event-to-promise')
const dbUtils = require('./utils/db')
const esUtils = require('./utils/es')
const wsUtils = require('./utils/ws.js')
const locksUtils = require('./utils/locks.js')
const cache = require('./utils/cache')
const workers = require('./workers')
const upgrade = require('../upgrade')
const baseApplications = require('./routers/base-applications')
const session = require('@koumoul/sd-express')({
  directoryUrl: config.directoryUrl,
  privateDirectoryUrl: config.privateDirectoryUrl || config.directoryUrl,
  publicUrl: config.publicUrl
})

const app = express()

app.use((req, res, next) => {
  if (!req.app.get('api-ready')) res.status(503).send('Service indisponible pour cause de maintenance.')
  else next()
})

if (process.env.NODE_ENV === 'development') {
  app.set('json spaces', 2)

  // Create a mono-domain environment with other services in dev
  const proxy = require('http-proxy-middleware')
  app.use('/openapi-viewer', proxy({ target: 'http://localhost:5680', pathRewrite: { '^/openapi-viewer': '' } }))
}

app.use(bodyParser.json({ limit: '1000kb' }))
app.use(cookieParser())
// In production CORS is taken care of by the reverse proxy if necessary
if (process.env.NODE_ENV === 'development') app.use(require('cors')())

// Business routers
app.use('/api/v1', require('./routers/root'))
app.use('/api/v1/remote-services', session.auth, require('./routers/remote-services'))
app.use('/api/v1/catalogs', session.auth, require('./routers/catalogs'))
app.use('/api/v1/base-applications', session.auth, baseApplications.router)
app.use('/api/v1/applications', session.auth, require('./routers/applications'))
app.use('/api/v1/datasets', session.auth, require('./routers/datasets'))
app.use('/api/v1/stats', session.auth, require('./routers/stats'))
app.use('/api/v1/settings', session.auth, require('./routers/settings'))
app.use('/api/v1/admin', session.auth, require('./routers/admin'))
app.use('/api/v1/session', session.router)
// External applications proxy
app.use('/app', session.loginCallback, session.auth, require('./routers/application-proxy'))

// Error management
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).send('invalid token...')
  }
  if (err.statusCode === 500 || !err.statusCode) console.error('Error in express route', err)
  if (!res.headersSent) res.status(err.statusCode || 500).send(err.message)
})

const server = http.createServer(app)
const wss = new WebSocket.Server({ server })

// Run app and return it in a promise
exports.run = async () => {
  server.listen(config.port)
  await eventToPromise(server, 'listening')

  await upgrade()
  const { db, client } = await dbUtils.init()
  app.set('db', db)
  app.set('mongoClient', client)
  await cache.init(db)
  await baseApplications.init(db)
  app.set('es', await esUtils.init())
  app.publish = await wsUtils.init(wss, db)
  await locksUtils.init(db)
  workers.start(app)
  app.set('api-ready', true)

  app.use((req, res, next) => {
    if (!req.app.get('ui-ready')) res.status(503).send('Service indisponible pour cause de maintenance.')
    else next()
  })
  app.use(session.decode)
  app.use(session.loginCallback)
  const nuxt = await require('./nuxt')()
  app.use(nuxt)
  app.set('ui-ready', true)

  return app
}

exports.stop = async() => {
  await util.promisify((cb) => wss.close(cb))()
  server.close()
  await eventToPromise(server, 'close')
  await wsUtils.stop()
  locksUtils.stop()
  await workers.stop()
  await app.get('mongoClient').close()
  await app.get('es').close()
}
