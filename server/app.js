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
const status = require('./routers/status')
const workers = require('./workers')

const app = express()
app.use(bodyParser.json({limit: '1000kb'}))
app.use(cookieParser())
// In production CORS is taken care of by the reverse proxy if necessary
if (process.env.NODE_ENV === 'development') app.use(require('cors')())

// Business routers
app.use('/api/v1', require('./routers/root'))
app.use('/api/v1/remote-services', require('./routers/remote-services'))
app.use('/api/v1/applications', require('./routers/applications'))
app.use('/api/v1/datasets', require('./routers/datasets'))
app.get('/api/v1/status', status.status)
app.get('/api/v1/ping', status.ping)
app.use('/api/v1/stats', require('./routers/stats'))
app.use('/api/v1/settings', require('./routers/settings'))
app.use('/app', require('./routers/application-proxy'))

// Error management
app.use((err, req, res, next) => {
  if (err.name === 'UnauthorizedError') {
    return res.status(401).send('invalid token...')
  }
  if (err.statusCode === 500) console.error('Error in express route', err)
  if (!res.headersSent) res.status(err.statusCode || 500).send(err.message)
})

const server = http.createServer(app)
const wss = new WebSocket.Server({server})

// Run app and return it in a promise
exports.run = async () => {
  const nuxt = await require('./nuxt')()
  app.use(nuxt)
  const db = await dbUtils.init()
  app.set('db', db)
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
  await app.get('db').close()
  await app.get('es').close()
}
