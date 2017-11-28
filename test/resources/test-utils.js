const test = require('ava')
const axios = require('axios')

exports.prepare = (key, port) => {
  process.env.NODE_CONFIG = JSON.stringify({
    port: port,
    publicUrl: 'http://localhost:' + port,
    mongoUrl: 'mongodb://localhost:27017/accessible-data-test-' + key
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
    await app.get('es').indices.delete({index: 'dataset-*'})
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
