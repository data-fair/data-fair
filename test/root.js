const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Get API documentation', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/api-docs.json')
  t.is(res.status, 200)
  t.is(res.data.openapi, '3.0.0')
})

test('Get vocabulary', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/vocabulary')
  t.is(res.status, 200)
  t.deepEqual(res.data, require('../contract/vocabulary.json'))
})

test('Check API format', async t => {
  const ax = await testUtils.axios()
  const api = require('./resources/geocoder-api.json')
  let res = await ax.post('/api/v1/_check-api', api)
  t.is(res.status, 200)
  delete api.openapi
  try {
    await ax.post('/api/v1/_check-api', api)
    t.fail()
  } catch (err) {
    t.is(err.status, 400)
  }
})
