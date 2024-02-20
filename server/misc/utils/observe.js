/* eslint-disable no-new */
// code instrumentation to expose metrics for prometheus
// follow this doc for naming conventions https://prometheus.io/docs/practices/naming/
// /metrics serves container/process/pod specific metrics while /global-metrics
// serves metrics for the whole data-fair installation no matter the scaling

const { hostname } = require('node:os')
const config = require('config')
const express = require('express')
const client = require('prom-client')
const eventToPromise = require('event-to-promise')
const { createHttpTerminator } = require('http-terminator')
const debugReq = require('debug')('df:observe:req')
const asyncWrap = require('./async-handler')

const localRegister = new client.Registry()
const globalRegister = new client.Registry()

client.collectDefaultMetrics({ register: localRegister })

// metrics server
const app = express()
const server = require('http').createServer(app)
const httpTerminator = createHttpTerminator({ server })

app.get('/metrics', asyncWrap(async (req, res) => {
  res.set('Content-Type', localRegister.contentType)
  res.send(await localRegister.metrics())
}))
app.get('/global-metrics', asyncWrap(async (req, res) => {
  res.set('Content-Type', globalRegister.contentType)
  res.send(await globalRegister.metrics())
}))

// live CPU performance inspection
exports.getCPUProfile = async (duration = 2000) => {
  const { Session } = require('node:inspector/promises')
  const session = new Session()
  session.connect()
  await session.post('Profiler.enable')
  await session.post('Profiler.start')
  await new Promise(resolve => setTimeout(resolve, duration))
  const { profile } = await session.post('Profiler.stop')
  session.disconnect()
  return profile
}

app.get('/cpu-profile', asyncWrap(async (req, res, next) => {
  const duration = req.query.duration ? parseInt(req.query.duration) : 2000
  const profile = await exports.getCPUProfile(duration)
  res.set('Content-Disposition', `attachment; filename="data-fair-${hostname}-${new Date().toISOString()}.cpuprofile"`)
  res.send(profile)
}))

// local metrics incremented throughout the code
exports.internalError = new client.Counter({
  name: 'df_internal_error',
  help: 'Errors in some worker process, socket handler, etc.',
  labelNames: ['errorCode'],
  registers: [localRegister]
})
exports.esQueryError = new client.Counter({
  name: 'df_es_query_error',
  help: 'Errors in elasticearch queries',
  registers: [localRegister]
})
exports.workersTasks = new client.Histogram({
  name: 'df_datasets_workers_tasks',
  help: 'Number and duration in seconds of tasks run by the workers',
  buckets: [0.1, 1, 10, 60, 600],
  labelNames: ['task', 'status'],
  registers: [localRegister]
})
exports.infectedFiles = new client.Counter({
  name: 'df_infected_files',
  help: 'A warning about uploaded infected files.',
  labelNames: [],
  registers: [localRegister]
})
const reqStep = new client.Histogram({
  name: 'df_req_step_seconds',
  help: 'Duration in seconds of steps in API requests',
  buckets: [0.03, 0.1, 1, 10, 60],
  labelNames: ['routeName', 'step'],
  registers: [localRegister]
})

exports.start = async (db) => {
  // global metrics based on db connection

  new client.Gauge({
    name: 'df_datasets_total',
    help: 'Total number of datasets',
    registers: [globalRegister],
    async collect () {
      this.set(await db.collection('datasets').estimatedDocumentCount())
    }
  })

  new client.Gauge({
    name: 'df_applications_total',
    help: 'Total number of applications',
    registers: [globalRegister],
    async collect () {
      this.set(await db.collection('applications').estimatedDocumentCount())
    }
  })

  server.listen(config.observer.port)
  await eventToPromise(server, 'listening')
  console.log('Observe server listening on http://localhost:' + config.observer.port)
}

exports.stop = async () => {
  await httpTerminator.terminate()
}

const reqObserveKey = Symbol('reqObserveKey')

exports.observeReqMiddleware = (req, res, next) => {
  const start = Date.now()
  req[reqObserveKey] = { start, step: start }
  res.on('finish', () => {
    exports.reqStep(req, 'finish')
    exports.reqStep(req, 'total')
  })
  next()
}

exports.reqRouteName = (req, routeName) => {
  req[reqObserveKey].routeName = routeName
}

exports.reqStep = (req, stepName) => {
  if (!req.route) return
  if (!req[reqObserveKey].routeName) req[reqObserveKey].routeName = req.route.path

  const now = Date.now()
  const duration = now - (stepName === 'total' ? req[reqObserveKey].start : req[reqObserveKey].step)
  reqStep.labels(req[reqObserveKey].routeName, stepName).observe(duration / 1000)
  debugReq('request', req.method, req.originalUrl, stepName, duration, 'ms')
  if (duration > 1000 && stepName !== 'total' && stepName !== 'finish') {
    console.log('request', req.method, req.originalUrl, stepName, duration, 'ms')
  }
  req[reqObserveKey].step = now
}
