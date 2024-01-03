
const config = require('config')
const observe = require('./utils/observe')
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
    observe.internalError.inc({ errorCode: 'task-process' })
    console.error(err.message)
  } else {
    observe.internalError.inc({ errorCode: 'df-process' })
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
    observe.internalError.inc({ errorCode: 'stop-process' })
    console.error('Failure while stopping service', err)
    process.exit(-1)
  })
})
