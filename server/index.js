
const config = require('config')
const metrics = require('./misc/utils/metrics')
const app = require('./app')

app.run().then(app => {
  if (config.mode.includes('worker')) {
    console.log('Worker loop is running')
  }
  if (config.mode.includes('server')) {
    console.log('Web socket and HTTP server listening on http://localhost:%s\nExposed on %s', config.port, config.publicUrl)
  }
  if (config.mode === 'task') {
    // console.log(`Ran task ${process.argv[2]} / ${process.argv[3]} / ${process.argv[4]}`)
    process.exit()
  }
}, err => {
  if (config.mode === 'task') {
    console.debug(`Failure in data-fair task ${process.argv[2]} / ${process.argv[3]} / ${process.argv[4]}`, err)
    try {
      // sometimes we miss details from the error response, safer to do this in a try/catch in case of circular data
      console.debug('full error', JSON.stringify(err, null, 2))
    } catch (err2) {
      console.debug(err2)
    }
    console.error(err.message)
    process.exit(-1)
  } else {
    metrics.internalError('df-process', err)
      .finally(() => process.exit(-1))
  }
})

process.on('SIGTERM', function onSigterm () {
  console.info('Received SIGTERM signal, shutdown gracefully...')
  app.stop().then(() => {
    console.log('shutting down now')
    process.exit()
  }, err => {
    metrics.internalError('stop-process', err)
    process.exit(-1)
  })
})
