const config = require('config')
const fs = require('fs-extra')
const nock = require('nock')
const axios = require('axios')
const debug = require('debug')('test')
const app = require('../server/app')
const workers = require('../server/workers')
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
    global.ax.builder().then(ax => global.ax.anonymous = ax),
    global.ax.builder('dmeadus0@answers.com:passwd').then(ax => global.ax.dmeadus = ax),
    global.ax.builder('cdurning2@desdev.cn:passwd').then(ax => global.ax.cdurning2 = ax),
    global.ax.builder('alone@no.org').then(ax => global.ax.alone = ax),
    global.ax.builder('superadmin@test.com:superpasswd:adminMode').then(ax => global.ax.superadmin = ax),
    global.ax.builder('alban.mouton@koumoul.com:passwd:adminMode').then(ax => global.ax.alban = ax),
    global.ax.builder('hlalonde3@desdev.cn').then(ax => global.ax.hlalonde3 = ax),
    global.ax.builder('ngernier4@usa.gov').then(ax => global.ax.ngernier4 = ax),
    global.ax.builder('ddecruce5@phpbb.com').then(ax => global.ax.ddecruce5 = ax),
    global.ax.builder('bhazeldean7@cnbc.com').then(ax => global.ax.bhazeldean7 = ax)
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
  debug('run app')
  try {
    global.app = await app.run()
  } catch (err) {
    console.error('Failed to run the application', err)
    throw err
  }
  debug('app ok')
})

beforeEach('scratch data', async () => {
  debug('scratch data')
  workers.clear()
  await Promise.all([
    global.es.indices.delete({ index: `dataset-test-*`, ignore: [404] }),
    global.db.collection('datasets').deleteMany({}),
    global.db.collection('applications').deleteMany({}),
    global.db.collection('limits').deleteMany({}),
    global.db.collection('settings').deleteMany({}),
    global.db.collection('locks').deleteMany({}),
    // global.db.collection('remote-services').deleteMany({}),
    fs.emptyDir('./data/test')
  ])
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
