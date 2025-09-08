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

process.on('SIGTERM', function onSigterm () {
  console.info('Received SIGTERM signal, shutdown gracefully...')
  app.stop().then(() => {
    console.log('shutting down now')
    process.exit()
  }, err => {
    internalError('stop-process', err)
    process.exit(-1)
  })
})
