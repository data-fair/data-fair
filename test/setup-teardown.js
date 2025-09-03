/* eslint-disable mocha/no-sibling-hooks */
/* eslint-disable mocha/no-top-level-hooks */
import path from 'node:path'
import { readFileSync } from 'node:fs'
import config from '../api/src/config.ts'
import mongo from '../api/src/mongo.ts'
import es from '../api/src/es.ts'
import fs from 'fs-extra'
import nock from 'nock'
import { forceResetWorkers } from '../api/src/workers/tasks.ts'
import { reset as resetPing } from '@data-fair/data-fair-api/src/workers/ping.ts'
import axios from 'axios'
import debugModule from 'debug'
import * as app from '../api/src/app.js'
import * as rateLimiting from '../api/src/misc/utils/rate-limiting.ts'

import { axiosAuth } from '@data-fair/lib-node/axios-auth.js'

const geocoderApi = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './resources/geocoder-api.json'), 'utf8'))
const sireneApi = JSON.parse(readFileSync(path.resolve(import.meta.dirname, './resources/sirene-api.json'), 'utf8'))

const debug = debugModule('test')

before('global mocks', async function () {
  debug('preparing mocks')

  // fake remote service
  nock('http://test.com')
    .persist()
    .get('/geocoder/api-docs.json').reply(200, geocoderApi)
    .get('/sirene/api-docs.json').reply(200, sireneApi)

  // fake catalog
  nock('http://test-catalog.com')
    .persist()
    .get('/api/1/site/').reply(200, { title: 'My catalog' })
    .get('/api/1/organizations/suggest/?q=koumoul').reply(200, [{ name: 'Koumoul' }])
    .get('/api/1/datasets/suggest/?q=test').reply(200, [{ title: 'Test dataset' }])
  // fake catalog
  nock('http://not-a-catalog.com')
    .persist()

  // fake applications
  const html = `
    <html>
      <head>
        <meta name="application-name" content="test">
        <script type="text/javascript">window.APPLICATION=%APPLICATION%;</script>
      </head>
      <body>My app body</body>
      <script>
        setTimeout(() => {
          if (window.triggerCapture) {
            window.triggerCapture()
          }
        }, 10)
      </script>
    </html>
  `
  nock('http://monapp1.com/')
    .persist()
    .get('/index.html').query(true).reply(200, html)
    .get('/dir1/info.txt').query(true).reply(200, 'into txt dir1')
    .get('/config-schema.json').query(true).reply(200, {
      type: 'object',
      required: ['datasets'],
      properties: {
        datasets: {
          type: 'array',
          items: [
            {
              title: 'Jeu de données',
              description: 'Ce jeu doit contenir au moins une colonne avec valeur numérique',
              type: 'object',
              'x-fromUrl': 'api/v1/datasets?status=finalized&field-type=integer,number&q={q}&select=id,title,schema,userPermissions&{context.datasetFilter}',
              'x-itemsProp': 'results',
              'x-itemTitle': 'title',
              'x-itemKey': 'href',
              additionalProperties: false,
              properties: {
                href: {
                  type: 'string'
                },
                title: {
                  type: 'string'
                },
                id: {
                  type: 'string'
                },
                finalizedAt: {
                  type: 'string'
                }
              }
            },
            {
              title: 'Jeu de données de contribution',
              type: 'object',
              'x-fromUrl': 'api/v1/datasets?status=finalized&q={q}&select=id,title,schema,userPermissions&{context.datasetFilter}',
              'x-itemsProp': 'results',
              'x-itemTitle': 'title',
              'x-itemKey': 'href',
              additionalProperties: false,
              properties: {
                href: {
                  type: 'string'
                },
                title: {
                  type: 'string'
                },
                id: {
                  type: 'string'
                },
                finalizedAt: {
                  type: 'string'
                },
                applicationKeyPermissions: {
                  type: 'object',
                  const: { operations: ['readSafeSchema', 'createLine'] }
                }
              }
            }
          ]
        }
      }
    })
  nock('http://monapp2.com')
    .persist()
    .get('/index.html').query(true).reply(200, html)
    .get('/config-schema.json').query(true).reply(200, {})

  debug('mocks ok')
})

before('init globals', async function () {
  debug('init globals')
  await mongo.init()
  global.db = mongo.db
  global.mongoClient = mongo.client
  await es.init()
  global.es = es.client

  global.ax = {}
  global.ax.builder = async (email, password, org, adminMode = false, opts = {}) => {
    debug('prepare axios instance', email)
    opts.baseURL = config.publicUrl
    opts.headers = opts.headers || {}
    opts.headers['x-cache-bypass'] = opts.headers['x-cache-bypass'] || '1'

    let ax
    if (email) {
      ax = await axiosAuth({
        email,
        password,
        directoryUrl: config.directoryUrl,
        org,
        axiosOpts: opts,
        adminMode
      })
    } else ax = axios.create(opts)

    debug('axios instance ok')
    return ax
  }
  await Promise.all([
    global.ax.builder().then(ax => { global.ax.anonymous = ax }),
    global.ax.builder('dmeadus0@answers.com', 'passwd').then(ax => { global.ax.dmeadus = ax }),
    global.ax.builder('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG').then(ax => { global.ax.dmeadusOrg = ax }),
    global.ax.builder('cdurning2@desdev.cn', 'passwd').then(ax => { global.ax.cdurning2 = ax }),
    global.ax.builder('alone@no.org', 'passwd').then(ax => { global.ax.alone = ax }),
    global.ax.builder('superadmin@test.com', 'superpasswd', undefined, true).then(ax => { global.ax.superadmin = ax }),
    global.ax.builder('superadmin@test.com', 'superpasswd').then(ax => { global.ax.superadminPersonal = ax }),
    global.ax.builder('alban.mouton@koumoul.com', 'passwd', undefined, true).then(ax => { global.ax.alban = ax }),
    global.ax.builder('hlalonde3@desdev.cn', 'passwd').then(ax => { global.ax.hlalonde3 = ax }),
    global.ax.builder('hlalonde3@desdev.cn', 'passwd', 'KWqAGZ4mG').then(ax => { global.ax.hlalonde3Org = ax }),
    global.ax.builder('ngernier4@usa.gov', 'passwd').then(ax => { global.ax.ngernier4 = ax }),
    global.ax.builder('ddecruce5@phpbb.com', 'passwd').then(ax => { global.ax.ddecruce5 = ax }),
    global.ax.builder('ddecruce5@phpbb.com', 'passwd', 'KWqAGZ4mG').then(ax => { global.ax.ddecruce5Org = ax }),
    global.ax.builder('bhazeldean7@cnbc.com', 'passwd').then(ax => { global.ax.bhazeldean7 = ax }),
    global.ax.builder('bhazeldean7@cnbc.com', 'passwd', 'KWqAGZ4mG').then(ax => { global.ax.bhazeldean7Org = ax }),
    global.ax.builder('ngernier4@usa.gov', 'passwd', 'KWqAGZ4mG').then(ax => { global.ax.ngernier4Org = ax }),
    global.ax.builder('icarlens9@independent.co.uk', 'passwd').then(ax => { global.ax.icarlens9 = ax }),
    global.ax.builder('icarlens9@independent.co.uk', 'passwd', 'KWqAGZ4mG').then(ax => { global.ax.icarlens9Org = ax })
  ])
  debug('init globals ok')
})

before('scratch all', async function () {
  debug('scratch all')
  await global.db.dropDatabase()
  await fs.remove('../data/test')
  await global.es.indices.delete({ index: 'dataset-test-*', ignore_unavailable: true }).catch(err => { console.log(err) })
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

beforeEach('scratch data', async function () {
  if (this.currentTest.state === 'failed') {
    // not scratching in case of failure can be handy to check the data
    return
  }

  debug('force reset the workers')
  await resetPing()
  await forceResetWorkers()

  debug('scratch data')
  try {
    await Promise.all([
      global.db.collection('datasets').deleteMany({}),
      global.db.collection('applications').deleteMany({}),
      global.db.collection('applications-keys').deleteMany({}),
      global.db.collection('catalogs').deleteMany({}),
      global.db.collection('limits').deleteMany({}),
      global.db.collection('settings').deleteMany({}),
      global.db.collection('locks').deleteMany({}),
      global.db.collection('extensions-cache').deleteMany({}),
      global.db.collection('remote-services').deleteMany({ id: /dataset:(.*)/ }),
      global.db.collection('journals').deleteMany({}),
      fs.emptyDir('../data/test')
    ])
    await fs.ensureDir('../data/test/captures')
    global.memoizedGetPublicationSiteSettings.clear()
    rateLimiting.clear()
  } catch (err) {
    console.warn('error while scratching data before test', err)
  }
  global.events.removeAllListeners()
  debug('scratch data ok')
})

after('stop app', async function () {
  debug('stop app')
  await Promise.race([
    new Promise(resolve => setTimeout(resolve, 5000)),
    app.stop()
  ])
  debug('stop app ok')
})

after('cleanup globals', async function () {
  debug('cleanup globals')
  await global.es.close()
  await global.mongoClient.close()
  debug('cleanup globals ok')
})
