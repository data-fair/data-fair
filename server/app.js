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
const session = require('simple-directory-client-express')({directoryUrl: config.directoryUrl, publicUrl: config.publicUrl})

const app = express()
app.use(bodyParser.json({limit: '1000kb'}))
app.use(cookieParser())
// In production CORS is taken care of by the reverse proxy if necessary
if (process.env.NODE_ENV === 'development') app.use(require('cors')())

// Business routers
app.use('/api/v1', require('./routers/root'))
app.use('/api/v1/remote-services', session.auth, require('./routers/remote-services'))
app.use('/api/v1/applications', session.auth, require('./routers/applications'))
app.use('/api/v1/datasets', session.auth, require('./routers/datasets'))
app.use('/api/v1/stats', session.auth, require('./routers/stats'))
app.use('/api/v1/settings', session.auth, require('./routers/settings'))
app.use('/app', session.auth, require('./routers/application-proxy'))
app.use('/api/v1/session', session.router)

// Error management
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).send('invalid token...')
  }
  if (err.statusCode === 500 || !err.statusCode) console.error('Error in express route', err)
  if (!res.headersSent) res.status(err.statusCode || 500).send(err.message)
})

const server = http.createServer(app)
const wss = new WebSocket.Server({server})

// Run app and return it in a promise
exports.run = async () => {
  app.use(session.decode)
  app.use(session.loginCallback)
  const nuxt = await require('./nuxt')()
  app.use(nuxt)
  const {db, client} = await dbUtils.init()
  app.set('db', db)
  app.set('mongoClient', client)
  await cache.init(db)
  app.set('es', esUtils.init())
  app.publish = await wsUtils.init(wss, db)
  await locksUtils.init(db)
  workers.start(app)
  server.listen(config.port)
  await eventToPromise(server, 'listening')
  return app
}

exports.stop = async() => {
  await util.promisify((cb) => wss.close(cb))()
  server.close()
  await eventToPromise(server, 'close')
  wsUtils.stop()
  locksUtils.stop()
  await workers.stop()
  await app.get('mongoClient').close()
  await app.get('es').close()
}
