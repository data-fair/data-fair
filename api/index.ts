import { setTimeout as delay } from 'node:timers/promises'
import config from '#config'
import * as app from './src/app.js'
import log from '@data-fair/lib-node/log.js'

app.run().then(app => {
  if (config.mode.includes('worker')) {
    log.info('Worker loop is running')
  }
  if (config.mode.includes('server')) {
    log.info(`Web socket and HTTP server listening on http://localhost:${config.port}, exposed on ${config.publicUrl}`)
  }
}, err => {
  log.error('unhandled error in the process', { code: 'df-process', err })
  process.exit(-1)
})

const shutdownDrainDelay = 5000 // ms

process.on('SIGTERM', async function onSigterm () {
  const drainDelay = config.mode.includes('server') ? shutdownDrainDelay : 0
  log.info(`Received SIGTERM signal, draining for ${drainDelay}ms before graceful shutdown...`)
  await delay(drainDelay)
  app.stop().then(() => {
    log.info('shutting down now')
    process.exit()
  }, err => {
    log.error('failed to stop the process', { code: 'stop-process', err })
    process.exit(-1)
  })
})
