const test = require('ava')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')

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

  test.serial.before('clean', async t => {
    await clean(key)
  })

  test.serial.before('run app', async t => {
    test.app = await app.run()
  })

  test.serial.after.always('stop app', async t => {
    await app.stop()
  })

  test.serial.after.always('clean', async t => {
    await clean(key)
  })

  const axiosInstances = {}
  const axiosBuilder = async (email) => {
    const config = require('config')

    if (!email) {
      const ax = axios.create({baseURL: config.publicUrl})
      // customize axios errors for shorter stack traces when a request fails in a test
      ax.interceptors.response.use(response => response, customReject)
      return ax
    }
    if (axiosInstances[email]) return axiosInstances[email]

    // await axios.delete('http://localhost:1080/email/all')
    await axios.post(`http://localhost:8080/api/auth/passwordless`, {email}, {params: {redirect: `http://localhost:${port}?id_token=`}})
    const emails = (await axios.get('http://localhost:1080/email')).data
    const match = emails
      .find(e => e.subject.indexOf('localhost:' + port) !== -1 && e.to[0].address === email)
      .text.match(/id_token=(.*)\s/)
    if (!match) throw new Error('Failed to extract id_token from mail content')
    const ax = axios.create({baseURL: config.publicUrl,
      headers: {
        'Cookie': 'id_token=' + match[1]
      }})
    // customize axios errors for shorter stack traces when a request fails in a test
    ax.interceptors.response.use(response => response, customReject)
    axiosInstances[email] = ax
    return ax
  }

  return {test, config, axiosBuilder}
}

const customReject = error => {
  if (!error.response) return Promise.reject(error)
  delete error.response.request
  return Promise.reject(error.response)
}

exports.formHeaders = (form, organizationId) => {
  const headers = {'Content-Length': form.getLengthSync(), ...form.getHeaders()}
  if (organizationId) headers['x-organizationId'] = organizationId
  return headers
}
