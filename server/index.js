
const config = require('config')
const app = require('./app')

app.run().then(app => {
  console.log('Web socket and HTTP server listening on http://localhost:%s', config.port)
}, err => {
  console.error('Failure while starting server', err)
  process.exit(-1)
})

process.on('SIGTERM', function onSigterm () {
  console.info('Received SIGTERM signal, shutdown gracefully...')
  app.stop().then(() => {
    console.log('shutting down now')
    process.exit()
  }, err => {
    console.error('Failure while stopping service', err)
    process.exit(-1)
  })
})
