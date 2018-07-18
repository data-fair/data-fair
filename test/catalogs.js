const nock = require('nock')
const testUtils = require('./resources/test-utils')

const {test, axiosBuilder} = testUtils.prepare(__filename)

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .get('/api/1/site/').reply(200, {title: 'My catalog'})
  .get('/api/1/organizations/suggest/?q=koumoul').reply(200, [{name: 'Koumoul'}])

test('Get catalogs when not authenticated', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/catalogs')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Init catalog definition based on url', async t => {
  const ax = await axiosBuilder()
  const res = await ax.post('/api/v1/catalogs/_init', null, {params: {url: 'http://test-catalog.com'}})
  t.is(res.status, 200)
  t.is(res.data.type, 'udata')
  t.is(res.data.title, 'My catalog')
})

test('Fail to init catalog definition based on bad url', async t => {
  const ax = await axiosBuilder()
  try {
    await ax.post('/api/v1/catalogs/_init', null, {params: {url: 'http://mycatalogTEST.com'}})
  } catch (err) {
    t.is(err.status, 400)
  }
})

test('Search organizations in a udata catalog', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/catalogs/_organizations', {params: {type: 'udata', url: 'http://test-catalog.com', q: 'koumoul'}})
  t.truthy(res.data.results)
  t.is(res.data.results[0].name, 'Koumoul')
})

test('Post a minimal catalog definition, read it, update it and delete it', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/catalogs', {url: 'http://test-catalog.com', title: 'Test catalog', apiKey: 'apiKey', type: 'udata'})
  t.is(res.status, 201)
  const eaId = res.data.id
  res = await ax.get('/api/v1/catalogs')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
  res = await ax.get('/api/v1/catalogs/' + eaId + '/api-docs.json')
  t.is(res.status, 200)
  t.is(res.data.openapi, '3.0.0')
  res = await ax.get('/api/v1/catalogs/' + eaId)
  res = await ax.patch('/api/v1/catalogs/' + eaId, {title: 'Test catalog'})
  t.is(res.status, 200)
  t.is(res.data.title, 'Test catalog')
  // Permissions
  const ax1 = await axiosBuilder('cdurning2@desdev.cn')
  try {
    await ax1.get('/api/v1/catalogs/' + eaId)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  try {
    await ax1.patch('/api/v1/catalogs/' + eaId, {title: 'Test catalog'})
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  try {
    await ax1.delete('/api/v1/catalogs/' + eaId)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  // We delete the entity
  res = await ax.delete('/api/v1/catalogs/' + eaId)
  t.is(res.status, 204)
  res = await ax.get('/api/v1/catalogs')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Unknown catalog', async t => {
  const ax = await axiosBuilder()
  try {
    await ax.get('/api/v1/catalogs/unknownId')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
})
