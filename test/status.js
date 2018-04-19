const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Get status', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/status')
  t.is(res.status, 200)
  t.is(res.data.status, 'ok')
  t.is(res.data.details.length, 3)
})

test('Ping service', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/ping')
  t.is(res.status, 200)
  t.is(res.data, 'ok')
})
