const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Get API documentation', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/api-docs.json')
  t.is(res.status, 200)
  t.is(res.data.openapi, '3.0.0')
})
