const config = require('config')
const express = require('express')
const bodyParser = require('body-parser')
const cookieParser = require('cookie-parser')
const path = require('path')
const dbUtils = require('./utils/db')
const esUtils = require('./utils/es')
const status = require('./status')

let app = module.exports = express()
app.set('es', esUtils.client)
app.use(bodyParser.json({limit: '100kb'}))
app.use(cookieParser())

// Business routers
app.use('/api/v1', require('./root'))
app.use('/api/v1/external-apis', require('./external-apis'))
app.use('/api/v1/application-configs', require('./application-configs'))
app.use('/api/v1/datasets', require('./datasets'))
app.use('/api/v1/journals', require('./journals').router)
app.get('/api/v1/status', status.status)
app.get('/api/v1/ping', status.ping)
app.use('/api/v1/actions', require('./actions'))
app.use('/applications', require('./applications'))

// Static routing
const oneWeek = process.env.NODE_ENV === 'development' ? 0 : 7 * 24 * 60 * 60
const staticOptions = {
  setHeaders: (res) => {
    res.set('cache-control', 'public, max-age=' + oneWeek)
  }
}
app.use('/bundles', express.static(path.join(__dirname, '../public/bundles'), staticOptions))
app.use('/assets', express.static(path.join(__dirname, '../public/assets'), staticOptions))

const pug = require('pug')
const compiledIndex = pug.compileFile(path.join(__dirname, './index.pug'))
const renderedIndex = compiledIndex({
  appJS: config.publicUrl + '/bundles/' + require('../public/bundles/webpack-assets.json').main.js,
  config: JSON.stringify({
    publicUrl: config.publicUrl,
    directoryUrl: config.directoryUrl
  })
})
app.use('/*', (req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=0')
  res.send(renderedIndex)
})

// Error handling to complement express default error handling. TODO do something useful of errors.
app.use((err, req, res, next) => {
  // console.error('Error, what to do ?', err.stack)

  // Default error handler of express is actually not bad.
  // It will send stack to client only if not in production and manage interrupted streams.
  next(err)
})

dbUtils.init(function(err, db) {
  if (err) throw err
  app.set('db', db)
  app.listen(config.port, (err) => {
    if (err) {
      console.error('Could not run server : ', err.stack)
      app.get('db').close()
      throw err
    }
    console.log('Listening on http://localhost:%s', config.port)
    // Emit this event for the test suite
    app.emit('listening')
    require('./workers/analyzer').loop(db)
    require('./workers/schematizer').loop(db)
    require('./workers/indexer').loop(db, app.get('es'))
  })
})
