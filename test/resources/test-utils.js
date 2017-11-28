const test = require('ava')
const axios = require('axios')

exports.prepare = (key, port) => {
  process.env.NODE_CONFIG = JSON.stringify({
    port: 5605,
    publicUrl: 'http://localhost:5605',
    mongoUrl: 'mongodb://localhost:27017/accessible-data-test-status'
  })
  const config = require('config')

  let app
  test.cb.before('run app', t => {
    app = require('../../server/app.js')
    app.on('listening', t.end)
  })

  test.cb.after('drop db', t => {
    app.get('db').dropDatabase(t.end)
  })

  const ax = axios.create({
    baseURL: config.publicUrl
  })

  return [test, ax, config]
}
