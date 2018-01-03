const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Get external APIs when not authenticated', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/external-apis')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Post a minimal external API, read it, update it and delete it', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/external-apis', {apiDoc: require('./resources/geocoder-api.json')})
  t.is(res.status, 201)
  const eaId = res.data.id
  res = await ax.get('/api/v1/external-apis')
  t.is(res.status, 200)
  t.is(res.data.count, 1)
  res = await ax.get('/api/v1/external-apis/' + eaId)
  t.is(res.data.apiDoc.info['x-api-id'], 'geocoder-koumoul')
  res = await ax.put('/api/v1/external-apis/' + eaId, Object.assign(res.data, {title: 'Test external api'}))
  t.is(res.status, 200)
  t.is(res.data.title, 'Test external api')
  // Permissions
  const ax1 = await testUtils.axios('cdurning2@desdev.cn')
  try {
    await ax1.get('/api/v1/external-apis/' + eaId)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  try {
    await ax1.put('/api/v1/external-apis/' + eaId, Object.assign(res.data, {title: 'Test external api'}))
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  try {
    await ax1.delete('/api/v1/external-apis/' + eaId)
    t.fail()
  } catch (err) {
    t.is(err.status, 403)
  }
  // We delete the entity
  res = await ax.delete('/api/v1/external-apis/' + eaId)
  t.is(res.status, 204)
  res = await ax.get('/api/v1/external-apis')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Unknown external service', async t => {
  const ax = await testUtils.axios()
  try {
    await ax.get('/api/v1/external-apis/unknownId')
    t.fail()
  } catch (err) {
    t.is(err.status, 404)
  }
})
