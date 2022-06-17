/* eslint-disable no-new */
// code instrumentation to expose metrics for prometheus
// follow this doc for naming conventions https://prometheus.io/docs/practices/naming/
// /metrics serves container/process/pod specific metrics while /global-metrics
// serves metrics for the whole data-fair installation no matter the scaling

const config = require('config')
const express = require('express')
const client = require('prom-client')
const eventToPromise = require('event-to-promise')
const asyncWrap = require('./async-wrap')

const localRegister = new client.Registry()
const globalRegister = new client.Registry()

// metrics server
const app = express()
const server = require('http').createServer(app)
app.get('/metrics', asyncWrap(async (req, res) => {
  res.set('Content-Type', localRegister.contentType)
  res.send(await localRegister.metrics())
}))
app.get('/global-metrics', asyncWrap(async (req, res) => {
  res.set('Content-Type', globalRegister.contentType)
  res.send(await globalRegister.metrics())
}))

// local metrics incremented throughout the code
exports.internalError = new client.Counter({
  name: 'df_internal_error',
  help: 'Errors in some worker process, socket handler, etc.',
  labelNames: ['errorCode'],
  registers: [localRegister]
})
exports.workersTasks = new client.Histogram({
  name: 'df_datasets_workers_tasks',
  help: 'Number and duration in seconds of tasks run by the workers',
  buckets: [0.1, 1, 10, 60, 600],
  labelNames: ['task', 'status'],
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

  server.listen(config.prometheus.port)
  await eventToPromise(server, 'listening')
  console.log('Prometheus metrics server listening on http://localhost:' + config.prometheus.port)
}

exports.stop = async () => {
  server.close()
  await eventToPromise(server, 'close')
}
