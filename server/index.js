
const config = require('config')
const app = require('./app')

app.run().then(app => {
  if (config.mode.includes('worker')) {
    console.log('Worker loop is running')
  }
  if (config.mode.includes('server')) {
    console.log('Web socket and HTTP server listening on http://localhost:%s', config.port)
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
      console.debug('full error', JSON.stringify(err))
    } catch (err2) {
      console.debug(err2)
    }
    console.error(err.message)
  } else {
    console.error('Failure in data-fair process', err)
  }
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
