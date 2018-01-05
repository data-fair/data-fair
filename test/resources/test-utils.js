const test = require('ava')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')

const testDir = path.join(__dirname, '../')
const testFiles = fs.readdirSync(testDir).map(f => path.join(testDir, f))

exports.prepare = (testFile) => {
  const key = path.basename(testFile, '.js')
  const port = 5800 + testFiles.indexOf(testFile)
  const dataDir = './data/test-' + key
  const indicesPrefix = 'dataset-test-' + key
  process.env.NODE_CONFIG = JSON.stringify({
    port,
    publicUrl: 'http://localhost:' + port,
    dataDir,
    mongoUrl: 'mongodb://localhost:27017/accessible-data-test-' + key,
    indicesPrefix
  })
  const config = require('config')
  const app = require('../../server/app.js')

  test.before('run app', async t => {
    test.app = await app.run()
  })

  test.after.always('stop app', async t => {
    await app.stop()
  })

  test.after.always('drop db', async t => {
    const db = await require('../../server/utils/db.js').init()
    await db.dropDatabase()
    await db.close()
  })

  test.after.always('drop ES indices', async t => {
    const es = require('../../server/utils/es.js').init()
    await es.indices.delete({index: `${indicesPrefix}-*`, ignore: [404]})
    await es.close()
  })

  test.after.always('remove test data', async t => {
    await fs.remove(dataDir)
  })

  return [test, config]
}

const customReject = error => {
  if (!error.response) return Promise.reject(error)
  delete error.response.request
  return Promise.reject(error.response)
}

const axiosInstances = {}
exports.axios = async (email) => {
  const config = require('config')

  if (!email) {
    const ax = axios.create({baseURL: config.publicUrl})
    // customize axios errors for shorter stack traces when a request fails in a test
    ax.interceptors.response.use(response => response, customReject)
    return ax
  }
  if (axiosInstances[email]) return axiosInstances[email]
  const res = await axios.post('http://localhost:5700/api/auth/passwordless', {email}, {withCredentials: true})
  const idTokenCookie = res.headers['set-cookie'][0]
  const ax = axios.create({baseURL: config.publicUrl,
    headers: {
      'Cookie': idTokenCookie
    }})
  // customize axios errors for shorter stack traces when a request fails in a test
  ax.interceptors.response.use(response => response, customReject)
  axiosInstances[email] = ax
  return ax
}

exports.formHeaders = (form, organizationId) => {
  const headers = {'Content-Length': form.getLengthSync(), ...form.getHeaders()}
  if (organizationId) headers['x-organizationId'] = organizationId
  return headers
}
