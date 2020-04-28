const config = require('config')
const fs = require('fs-extra')
const nock = require('nock')
const axios = require('axios')
const debug = require('debug')('test')
const app = require('../server/app')
const axiosAuth = require('@koumoul/sd-express').axiosAuth

before('global mocks', () => {
  debug('preparing mocks')
  nock('http://test.com')
    .persist()
    .get('/geocoder/api-docs.json').reply(200, require('./resources/geocoder-api.json'))

  const html = '<html><head><meta name="application-name" content="test"></head><body></body></html>'
  nock('http://monapp1.com').persist()
    .get('/index.html').reply(200, html)
    .get('/config-schema.json').reply(200, {})
  nock('http://monapp2.com').persist()
    .get('/index.html').reply(200, html)
    .get('/config-schema.json').reply(200, {})
  debug('mocks ok')
})

before('init globals', async () => {
  debug('init globals')
  const { db, client } = await require('../server/utils/db.js').connect()
  global.db = db
  global.mongoClient = client
  global.es = await require('../server/utils/es').init()

  global.ax = {}
  global.ax.builder = async (email, opts = {}) => {
    debug('prepare axios instance', email)
    opts.baseURL = config.publicUrl

    let ax
    if (email) ax = await axiosAuth(email, null, opts)
    else ax = axios.create(opts)

    // customize axios errors for shorter stack traces when a request fails in a test
    ax.interceptors.response.use(response => response, error => {
      if (!error.response) return Promise.reject(error)
      delete error.response.request
      return Promise.reject(error.response)
    })
    debug('axios instance ok')
    return ax
  }
  await Promise.all([
    global.ax.builder('dmeadus0@answers.com:passwd').then(ax => global.ax.dmeadus = ax),
    global.ax.builder('cdurning2@desdev.cn:passwd').then(ax => global.ax.cdurning2 = ax),
  ])
  debug('init globals ok')
})

before('scratch all', async() => {
  debug('scratch all')
   await global.db.dropDatabase()
   await fs.remove('./data/test')
   debug('scratch all ok')
})

before('start app', async function () {
  this.timeout(5000)
  debug('run app')
  try {
    await app.run()
  } catch (err) {
    console.error('Failed to run the application', err)
    throw err
  }
  debug('app ok')
})

beforeEach('scratch data', async () => {
  debug('scratch data')
  const indicesPrefix = 'dataset-test'
  await global.es.indices.delete({ index: `${indicesPrefix}-*`, ignore: [404] })
  await global.db.collection('datasets').deleteMany({})
  await global.db.collection('applications').deleteMany({})
  await global.db.collection('remote-services').deleteMany({})
  await fs.emptyDir('./data/test')
  debug('scratch data ok')
})

after('stop app', async () => {
  debug('stop app')
  await app.stop()
  debug('stop app ok')
})

after('cleanup globals', async () => {
  debug('cleanup globals')
  await global.es.close()
  await global.mongoClient.close()
  debug('cleanup globals ok')
})
