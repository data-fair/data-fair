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
  res = await ax.delete('/api/v1/external-apis/' + eaId)
  t.is(res.status, 204)
  res = await ax.get('/api/v1/external-apis')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})
