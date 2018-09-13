const testUtils = require('./resources/test-utils')

const {test, axiosBuilder, config} = testUtils.prepare(__filename)

test('Get external APIs when not authenticated', async t => {
  const ax = await axiosBuilder()
  const res = await ax.get('/api/v1/remote-services')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Initialize default services', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/remote-services/_default_services')
  t.is(res.status, 201)
  res = await ax.get('/api/v1/remote-services')
  // 3 times all services, for user himself and all the organizations he belongs to
  t.is(res.data.count, 3 * config.remoteServices.length)
})

test('Post a minimal external API, read it, update it and delete it', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/remote-services', {apiDoc: require('./resources/geocoder-api.json'), apiKey: {in: 'header', name: 'x-apiKey'}})
  t.is(res.status, 201)
  const eaId = res.data.id
  res = await ax.get('/api/v1/remote-services')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
  res = await ax.get('/api/v1/remote-services/' + eaId + '/api-docs.json')
  t.is(res.status, 200)
  t.is(res.data.openapi, '3.0.0')
  res = await ax.get('/api/v1/remote-services/' + eaId)
  t.is(res.data.apiDoc.info['x-api-id'], 'geocoder-koumoul')
  res = await ax.patch('/api/v1/remote-services/' + eaId, {title: 'Test external api'})
  t.is(res.status, 200)
  t.is(res.data.title, 'Test external api')
  // Permissions
  const ax1 = await axiosBuilder('cdurning2@desdev.cn')
  try {
    await ax1.get('/api/v1/remote-services/' + eaId)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  try {
    await ax1.patch('/api/v1/remote-services/' + eaId, {title: 'Test external api'})
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
  t.is(res.data.count, 0)
})

test('Unknown external service', async t => {
  const ax = await axiosBuilder()
  try {
    await ax.get('/api/v1/remote-services/unknownId')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
})
