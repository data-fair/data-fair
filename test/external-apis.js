const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Get external APIs when not authenticated', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/external-apis')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Post a minimal external API', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const res = await ax.post('/api/v1/external-apis', {})
  t.is(res.status, 201)
})
