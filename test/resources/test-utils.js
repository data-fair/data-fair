const test = require('ava')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')
const axiosAuth = require('@koumoul/sd-express').axiosAuth

const testDir = path.join(__dirname, '../')
const testFiles = fs.readdirSync(testDir).map(f => path.join(testDir, f))

async function clean(key) {
  const dataDir = './data/test-' + key
  const indicesPrefix = 'dataset-test-' + key
  const {db, client} = await require('../../server/utils/db.js').init()
  await db.dropDatabase()
  await client.close()
  const es = require('../../server/utils/es.js').init()
  await es.indices.delete({index: `${indicesPrefix}-*`, ignore: [404]})
  await es.close()
  await fs.remove(dataDir)
}

exports.prepare = (testFile) => {
  const key = path.basename(testFile, '.js')
  const port = 5800 + testFiles.indexOf(testFile)
  const dataDir = './data/test-' + key
  const indicesPrefix = 'dataset-test-' + key
  process.env.NODE_CONFIG = JSON.stringify({
    port,
    publicUrl: 'http://localhost:' + port,
    dataDir,
    mongoUrl: 'mongodb://localhost:27017/data-fair-test-' + key,
    indicesPrefix
  })
  const config = require('config')
  const app = require('../../server/app.js')

  test.serial.before('clean and run app', async t => {
    await clean(key)
    test.app = await app.run()
  })

  test.serial.after.always('stop app and clean', async t => {
    await app.stop()
    await clean(key)
  })

  const axiosBuilder = async (email) => {
    const opts = {baseURL: config.publicUrl}

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

  return {test, config, axiosBuilder}
}

exports.formHeaders = (form, organizationId) => {
  const headers = {'Content-Length': form.getLengthSync(), ...form.getHeaders()}
  if (organizationId) headers['x-organizationId'] = organizationId
  return headers
}
