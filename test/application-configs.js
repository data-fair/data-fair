const testUtils = require('./resources/test-utils')
const nock = require('nock')

const [test] = testUtils.prepare(__filename)

test('Get applications when not authenticated', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/application-configs')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

const html = '<html><head></head><body></body></html>'
nock('http://monapp.com').persist().get('/').reply(200, html)

test('Post an external application configuration, read it, update it and delete it', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/application-configs', {url: 'http://monapp.com'})
  t.is(res.status, 201)
  const acId = res.data.id
  res = await ax.get('/api/v1/application-configs')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
  res = await ax.get('/api/v1/application-configs/' + acId)
  t.is(res.data.url, 'http://monapp.com')
  res = await ax.put('/api/v1/application-configs/' + acId, Object.assign(res.data, {title: 'Test application config'}))
  t.is(res.status, 200)
  t.is(res.data.title, 'Test application config')
  res = await ax.get('/applications/' + acId)
  t.is(res.data, html)
  res = await ax.delete('/api/v1/application-configs/' + acId)
  t.is(res.status, 204)
  res = await ax.get('/api/v1/application-configs')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Access an unknown applicationId on proxy endpoint', async t => {
  const ax = await testUtils.axios()
  try {
    await ax.get('/applications/unknownId')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
})
