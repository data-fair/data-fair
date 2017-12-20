const test = require('ava')
const axios = require('axios')
const fs = require('fs-extra')
const path = require('path')

const testDir = path.join(__dirname, '../')
const testFiles = fs.readdirSync(testDir).map(f => path.join(testDir, f))

exports.prepare = (testFile) => {
  const key = path.basename(testFile, '.js')
  const port = 5601 + testFiles.indexOf(testFile)
  const dataDir = './data/test-' + key
  process.env.NODE_CONFIG = JSON.stringify({
    port: port,
    publicUrl: 'http://localhost:' + port,
    dataDir,
    mongoUrl: 'mongodb://localhost:27017/accessible-data-test-' + key,
    indicesPrefix: 'dataset-test-' + key
  })
  const config = require('config')

  let app
  test.cb.before('run app', t => {
    app = require('../../server/app.js')
    app.on('listening', t.end)
  })

  test.before('clear datasets', async t => {
    await app.get('db').collection('datasets').remove()
  })

  test.after('drop db', async t => {
    await app.get('db').dropDatabase()
  })

  test.before('drop ES indices', async t => {
    await app.get('es').indices.delete({index: `dataset-${key}-*`, ignore: [404]})
  })

  test.before('remove test data', async t => {
    await fs.remove(dataDir)
  })

  return [test, config]
}

const axiosInstances = {}
exports.axios = async (email) => {
  if (axiosInstances[email]) return axiosInstances[email]
  const config = require('config')
  let ax = axios.create({
    baseURL: config.publicUrl
  })
  if (email) {
    const res = await ax.post('http://localhost:5700/api/auth/passwordless', {email}, {withCredentials: true})
    const idTokenCookie = res.headers['set-cookie'][0]
    ax.defaults.headers.common['Cookie'] = idTokenCookie
  }

  axiosInstances[email] = ax
  return ax
}

exports.formHeaders = (form) => {
  return {'Content-Length': form.getLengthSync(), ...form.getHeaders()}
}
