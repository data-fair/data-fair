const config = require('config')

const app = require('./app')

app.run().then(app => {
  console.log('Web socket and HTTP server listening on http://localhost:%s', config.port)
}, error => { throw error })

process.on('SIGTERM', function onSigterm () {
  console.info('Received SIGTERM signal, shutdown gracefully...')
  app.stop().then(() => process.exit(), error => { throw error })
})
