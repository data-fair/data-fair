
const config = require('config')
const app = require('./app')

console.log('Web socket and HTTP server will soon be listening on http://localhost:%s', config.port)
app.run().then(app => {
  console.log('Web socket and HTTP server started')
}, err => {
  console.error(err)
  process.exit(-1)
})

process.on('SIGTERM', function onSigterm () {
  console.info('Received SIGTERM signal, shutdown gracefully...')
  app.stop().then(() => {
    console.log('shutting down now')
    process.exit()
  }, err => {
    console.error(err)
    process.exit(-1)
  })
})
