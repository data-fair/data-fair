// require('cache-require-paths')
const test = require('ava')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')
const nock = require('nock')
const FormData = require('form-data')
const axiosAuth = require('@koumoul/sd-express').axiosAuth
const debug = require('debug')('test')

const testDir = path.join(__dirname, '../')
const testFiles = fs.readdirSync(testDir).map(f => path.join(testDir, f))

async function clean(key) {
  debug('clean')
  const dataDir = './data/test-' + key
  const indicesPrefix = 'dataset-test-' + key
  const { db, client } = await require('../../server/utils/db.js').connect()
  await db.dropDatabase()
  await client.close()
  const es = await require('../../server/utils/es').init()
  await es.indices.delete({ index: `${indicesPrefix}-*`, ignore: [404] })
  await es.close()
  await fs.remove(dataDir)
  debug('clean ok')
}

exports.prepare = (testFile) => {
  debug('prepare test suite', testFile)
  const key = path.basename(testFile, '.js')
  const port = 5800 + testFiles.indexOf(testFile)
  const dataDir = './data/test-' + key
  const indicesPrefix = 'dataset-test-' + key
  process.env.NODE_CONFIG = JSON.stringify({
    port,
    publicUrl: 'http://localhost:' + port,
    dataDir,
    mongoUrl: 'mongodb://localhost:27017/data-fair-test-' + key,
    indicesPrefix,
    defaultRemoteKey: {
      in: 'header',
      name: 'x-apiKey',
      value: 'test_default_key'
    }
  })
  const config = require('config')
  const app = require('../../server/app.js')
  debug('test suite ready')

  test.serial.before('global mocks', async t => {
    debug('preparing mocks')
    nock('http://test.com')
      .persist()
      .get('/geocoder/api-docs.json').reply(200, require('./geocoder-api.json'))

    const html = '<html><head><meta name="application-name" content="test"></head><body></body></html>'
    nock('http://monapp1.com').persist()
      .get('/index.html').reply(200, html)
      .get('/config-schema.json').reply(200, {})
    nock('http://monapp2.com').persist()
      .get('/index.html').reply(200, html)
      .get('/config-schema.json').reply(200, {})
    debug('mocks ok')
  })

  test.serial.before('clean and run app', async t => {
    await clean(key)
    try {
      debug('run app')
      test.app = await app.run()
    } catch (err) {
      console.error('Failed to run the application', err)
      throw err
    }
    debug('app ok')
  })

  /* TODO: stopping the app breaks tests, with some mongodb interrupted operations errors
  test.serial.after.always('stop app', async t => {
    try {
      debug('stop app')
      await app.stop()
    } catch (err) {
      console.error('Failed to stop the application', err)
      throw err
    }
    debug('app stopped')
  })
  */

  const axiosBuilder = async (email, opts = {}) => {
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

  return { test, config, axiosBuilder, debug }
}

exports.formHeaders = (form, organizationId) => {
  const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  if (organizationId) headers['x-organizationId'] = organizationId
  return headers
}

exports.sendDataset = async(fileName, ax, organizationId) => {
  const datasetFd = fs.readFileSync('./test/resources/' + fileName)
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  const res = await ax.post('/api/v1/datasets', form, { headers: exports.formHeaders(form, organizationId) })
  const workers = require('../../server/workers')
  return workers.hook(`finalizer/${res.data.id}`)
}
