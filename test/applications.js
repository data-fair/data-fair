const testUtils = require('./resources/test-utils')
const nock = require('nock')

const { test, config, axiosBuilder } = testUtils.prepare(__filename)

const html = `
<html>
  <head>
    <script type="text/javascript">window.APPLICATION=%APPLICATION%;</script>
  </head>
  <body>My app body</body>
</html>
`
nock('http://monapp1.com/').persist().get('/index.html').reply(200, html)

test('Get applications when not authenticated', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/applications')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Access an unknown applicationId on proxy endpoint', async t => {
  const ax = await axiosBuilder()
  try {
    await ax.get('/app/unknownId')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
})

test.serial('Post an external application configuration, read it, update it and delete it', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
  t.is(res.status, 201)

  const appId = res.data.id
  res = await ax.get('/api/v1/applications')
  t.is(res.status, 200)
  t.true(res.data.count >= 1)
  res = await ax.get('/api/v1/applications/' + appId)
  t.is(res.data.url, 'http://monapp1.com/')
  res = await ax.get('/api/v1/applications/' + appId + '/api-docs.json')
  t.truthy(res.data.openapi)
  res = await ax.get('/api/v1/applications/' + appId + '/config')
  t.is(res.status, 200)
  res = await ax.patch('/api/v1/applications/' + appId, { title: 'Test application config' })
  t.is(res.status, 200)
  t.is(res.data.title, 'Test application config')
  res = await ax.delete('/api/v1/applications/' + appId)
  t.is(res.status, 204)
  res = await ax.get('/api/v1/applications')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test.serial('Manage the custom configuration part of the object', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
  const appId = res.data.id
  res = await ax.put('/api/v1/applications/' + appId + '/config', {
    datasets: [{ 'href': config.publicUrl + '/api/v1/datasets/111' }]
  })
  t.is(res.status, 200)
  res = await ax.get('/api/v1/applications/' + appId + '/config')
  t.is(res.status, 200)
  t.is(res.data.datasets.length, 1)
  res = await ax.get('/api/v1/applications', { params: { dataset: 'nope' } })
  t.is(res.data.count, 0)
  res = await ax.get('/api/v1/applications', { params: { dataset: '111' } })
  t.is(res.data.count, 1)
})

test.serial('Use an application through the application proxy', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
  const appId = res.data.id

  // The same content is returned with or without a trailing slash
  res = await ax.get(`/app/${appId}/`)
  t.is(res.status, 200)
  res = await ax.get('/app/' + appId)
  t.is(res.status, 200)

  // The HTML content is returned
  t.true(res.headers['content-type'].startsWith('text/html'))
  t.true(res.data.includes('My app body'))
  // The configuration is injected
  t.true(res.data.includes('window.APPLICATION={'))
  // A link to the manifest is injected
  t.true(res.data.includes(`<link rel="manifest" crossorigin="use-credentials" href="/app/${appId}/manifest.json">`))
  // The app reference a service worker
  t.true(res.data.includes(`/app-sw.js`))
})
