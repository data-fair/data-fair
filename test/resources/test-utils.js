const test = require('ava')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')
const nock = require('nock')
const FormData = require('form-data')
const axiosAuth = require('@koumoul/sd-express').axiosAuth
const workers = require('../../server/workers')

const testDir = path.join(__dirname, '../')
const testFiles = fs.readdirSync(testDir).map(f => path.join(testDir, f))

async function clean(key) {
  const dataDir = './data/test-' + key
  const indicesPrefix = 'dataset-test-' + key
  const { db, client } = await require('../../server/utils/db.js').connect()
  await db.dropDatabase()
  await client.close()
  const es = await require('../../server/utils/es').init()
  await es.indices.delete({ index: `${indicesPrefix}-*`, ignore: [404] })
  await es.close()
  await fs.remove(dataDir)
}

exports.prepare = (testFile) => {
  const key = path.basename(testFile, '.js')
  const port = 5800 + testFiles.indexOf(testFile)
  const dataDir = './data/test-' + key
  const indicesPrefix = 'dataset-test-' + key
  const config = require('config')
  Object.assign(config, {
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

  const app = require('../../server/app.js')

  test.serial.before('global mocks', async t => {
    nock('http://test.com')
      .persist()
      .get('/geocoder/api-docs.json').reply(200, require('./geocoder-api.json'))

    const html = '<html><head><meta name="application-name" content="test"></head><body></body></html>'
    nock('http://monapp1.com').persist()
      .get('/').reply(200, html)
      .get('/config-schema.json').reply(200, {})
    nock('http://monapp2.com').persist()
      .get('/').reply(200, html)
      .get('/config-schema.json').reply(200, {})
  })

  test.serial.before('clean and run app', async t => {
    await clean(key)
    try {
      test.app = await app.run()
    } catch (err) {
      console.error('Failed to run the application', err)
      throw err
    }
  })

  test.serial.after.always('stop app and clean', async t => {
    try {
      await app.stop()
    } catch (err) {
      console.error('Failed to stop the application', err)
      throw err
    }
  })

  const axiosBuilder = async (email, opts = {}) => {
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

    return ax
  }

  return { test, config, axiosBuilder }
}

exports.formHeaders = (form, organizationId) => {
  const headers = { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }
  if (organizationId) headers['x-organizationId'] = organizationId
  return headers
}

exports.sendDataset = async(fileName, ax) => {
  const datasetFd = fs.readFileSync('./test/resources/' + fileName)
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  await ax.post('/api/v1/datasets', form, { headers: exports.formHeaders(form) })
  return workers.hook('finalizer')
}
