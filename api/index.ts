import { setTimeout as delay } from 'node:timers/promises'
import config from '#config'
import * as app from './src/app.js'
import { internalError } from '@data-fair/lib-node/observer.js'

app.run().then(app => {
  if (config.mode.includes('worker')) {
    console.log('Worker loop is running')
  }
  if (config.mode.includes('server')) {
    console.log('Web socket and HTTP server listening on http://localhost:%s\nExposed on %s', config.port, config.publicUrl)
  }
}, err => {
  internalError('df-process', err)
  process.exit(-1)
})

const shutdownDrainDelay = 5000 // ms

process.on('SIGTERM', async function onSigterm () {
  const drainDelay = config.mode.includes('server') ? shutdownDrainDelay : 0
  console.info(`Received SIGTERM signal, draining for ${drainDelay}ms before graceful shutdown...`)
  await delay(drainDelay)
  app.stop().then(() => {
    console.log('shutting down now')
    process.exit()
  }, err => {
    internalError('stop-process', err)
    process.exit(-1)
  })
})
