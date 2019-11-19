const nock = require('nock')
const testUtils = require('./resources/test-utils')

const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Get external APIs when not authenticated', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/remote-services')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
})

test.serial('Post a minimal external API, read it, update it and delete it', async t => {
  const ax = await axiosBuilder('superadmin@test.com:superpasswd')
  const apiDoc = require('./resources/geocoder-api.json')
  apiDoc.info['x-api-id'] = 'geocoder2'
  let res = await ax.post('/api/v1/remote-services', { apiDoc, apiKey: { in: 'header', name: 'x-apiKey' } })
  t.is(res.status, 201)
  const eaId = res.data.id
  res = await ax.get('/api/v1/remote-services')
  t.is(res.status, 200)
  t.is(res.data.count, 2)
  res = await ax.get('/api/v1/remote-services/' + eaId + '/api-docs.json')
  t.is(res.status, 200)
  t.is(res.data.openapi, '3.0.0')
  res = await ax.get('/api/v1/remote-services/' + eaId)
  t.is(res.data.apiDoc.info['x-api-id'], 'geocoder2')
  res = await ax.patch('/api/v1/remote-services/' + eaId, { title: 'Test external api' })
  t.is(res.status, 200)
  t.is(res.data.title, 'Test external api')
  // Permissions
  const ax1 = await axiosBuilder('cdurning2@desdev.cn:passwd')
  try {
    await ax1.patch('/api/v1/remote-services/' + eaId, { title: 'Test external api' })
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  try {
    await ax1.delete('/api/v1/remote-services/' + eaId)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  // We delete the entity
  res = await ax.delete('/api/v1/remote-services/' + eaId)
  t.is(res.status, 204)
  res = await ax.get('/api/v1/remote-services')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
})

test.serial('Unknown external service', async t => {
  const ax = await axiosBuilder()
  try {
    await ax.get('/api/v1/remote-services/unknownId')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
})

test.serial('Handle timeout errors from proxied service', async t => {
  const ax = await axiosBuilder('superadmin@test.com:superpasswd')
  nock('http://test.com').get('/geocoder/coord').delay(60000).reply(200, { content: 'ok' })
  try {
    await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord')
  } catch (err) {
    t.is(err.status, 504)
  }
})

test.serial('Prevent abusing remote service re-exposition', async t => {
  const ax = await axiosBuilder('superadmin@test.com:superpasswd')

  const nockScope = nock('http://test.com').get('/geocoder/coord').reply(200, { content: 'ok' })
  const res = await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord')
  t.is(res.data.content, 'ok')
  nockScope.done()
  try {
    await ax.post('/api/v1/remote-services/geocoder-koumoul/proxy/coords')
    t.fail()
  } catch (err) {
    t.is(err.status, 405)
  }

  nock('http://test.com').persist().get('/geocoder/coords').reply(200, { content: Buffer.alloc(50000).toString('hex') })
  try {
    for (let i = 0; i < 4; i++) {
      await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coords')
    }
    t.fail()
  } catch (err) {
    t.is(err.status, 429)
  }

  nock('http://test.com').persist().get('/geocoder/coord').reply(200, { content: 'ok' })
  const promises = []
  for (let i = 0; i < 15; i++) {
    promises.push(ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord'))
  }
  try {
    await Promise.all(promises)
    t.fail()
  } catch (err) {
    t.is(err.status, 429)
  }
})
