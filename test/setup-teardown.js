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

  // fake remote service
  nock('http://test.com')
    .persist()
    .get('/geocoder/api-docs.json').reply(200, require('./resources/geocoder-api.json'))
    .get('/sirene/api-docs.json').reply(200, require('./resources/sirene-api.json'))

  // fake catalog
  nock('http://test-catalog.com')
    .persist()
    .get('/api/1/site/').reply(200, { title: 'My catalog' })
    .get('/api/1/organizations/suggest/?q=koumoul').reply(200, [{ name: 'Koumoul' }])
    .get('/api/1/datasets/suggest/?q=test').reply(200, [{ title: 'Test dataset' }])

  // fake applications
  const html = `
    <html>
      <head>
        <meta name="application-name" content="test">
        <script type="text/javascript">window.APPLICATION=%APPLICATION%;</script>
      </head>
      <body>My app body</body>
    </html>
  `
  nock('http://monapp1.com/')
    .persist()
    .get('/index.html').query(true).reply(200, html)
    .get('/config-schema.json').query(true).reply(200, {})
  nock('http://monapp2.com')
    .persist()
    .get('/index.html').query(true).reply(200, html)
    .get('/config-schema.json').query(true).reply(200, {})

  debug('mocks ok')
})

before('init globals', async () => {
  debug('init globals')
  const { db, client } = await require('../server/utils/db.js').connect()
  global.db = db
  global.mongoClient = client
  global.es = await require('../server/utils/es').init()

  global.ax = {}
  global.ax.builder = async (email, org, opts = {}) => {
    debug('prepare axios instance', email)
    opts.baseURL = config.publicUrl

    let ax
    if (email) ax = await axiosAuth(email, org, opts)
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
    global.ax.builder().then(ax => { global.ax.anonymous = ax }),
    global.ax.builder('dmeadus0@answers.com:passwd').then(ax => { global.ax.dmeadus = ax }),
    global.ax.builder('dmeadus0@answers.com:passwd', 'KWqAGZ4mG').then(ax => { global.ax.dmeadusOrg = ax }),
    global.ax.builder('cdurning2@desdev.cn:passwd').then(ax => { global.ax.cdurning2 = ax }),
    global.ax.builder('alone@no.org:passwd').then(ax => { global.ax.alone = ax }),
    global.ax.builder('superadmin@test.com:superpasswd:adminMode').then(ax => { global.ax.superadmin = ax }),
    global.ax.builder('superadmin@test.com:superpasswd').then(ax => { global.ax.superadminPersonal = ax }),
    global.ax.builder('alban.mouton@koumoul.com:passwd:adminMode').then(ax => { global.ax.alban = ax }),
    global.ax.builder('hlalonde3@desdev.cn:passwd').then(ax => { global.ax.hlalonde3 = ax }),
    global.ax.builder('ngernier4@usa.gov:passwd').then(ax => { global.ax.ngernier4 = ax }),
    global.ax.builder('ddecruce5@phpbb.com:passwd').then(ax => { global.ax.ddecruce5 = ax }),
    global.ax.builder('ddecruce5@phpbb.com:passwd', 'KWqAGZ4mG').then(ax => { global.ax.ddecruce5Org = ax }),
    global.ax.builder('bhazeldean7@cnbc.com:passwd').then(ax => { global.ax.bhazeldean7 = ax }),
    global.ax.builder('bhazeldean7@cnbc.com:passwd', 'KWqAGZ4mG').then(ax => { global.ax.bhazeldean7Org = ax }),
    global.ax.builder('ngernier4@usa.gov:passwd', 'KWqAGZ4mG').then(ax => { global.ax.ngernier4Org = ax }),
    global.ax.builder('icarlens9@independent.co.uk:passwd').then(ax => { global.ax.icarlens9 = ax }),
    global.ax.builder('icarlens9@independent.co.uk:passwd', 'KWqAGZ4mG').then(ax => { global.ax.icarlens9Org = ax })
  ])
  debug('init globals ok')
})

before('scratch all', async () => {
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
  await Promise.race([
    new Promise(resolve => setTimeout(resolve, 5000)),
    workers.clear()
  ])
  try {
    await Promise.all([
      global.es.indices.delete({ index: 'dataset-test-*', ignore_unavailable: true }).catch(err => { console.log(err) }),
      global.db.collection('datasets').deleteMany({}),
      global.db.collection('applications').deleteMany({}),
      global.db.collection('applications-keys').deleteMany({}),
      global.db.collection('catalogs').deleteMany({}),
      global.db.collection('limits').deleteMany({}),
      global.db.collection('settings').deleteMany({}),
      global.db.collection('locks').deleteMany({}),
      global.db.collection('extensions-cache').deleteMany({}),
      global.db.collection('remote-services').deleteMany({ id: /localhost-dataset-(.*)/ }),
      global.db.collection('journals').deleteMany({}),
      fs.emptyDir('./data/test')
    ])
  } catch (err) {
    console.warn('error while scratching data before test', err)
  }
  global.events.removeAllListeners()
  debug('scratch data ok')
})

after('stop app', async () => {
  debug('stop app')
  await Promise.race([
    new Promise(resolve => setTimeout(resolve, 5000)),
    app.stop()
  ])
  debug('stop app ok')
})

after('cleanup globals', async () => {
  debug('cleanup globals')
  await global.es.close()
  await global.mongoClient.close()
  debug('cleanup globals ok')
})
