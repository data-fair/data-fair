const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Get applications when not authenticated', async t => {
  const ax = await testUtils.axios()
  const res = await ax.get('/api/v1/application-configs')
  t.is(res.status, 200)
  t.is(res.data.count, 0)
})

test('Post a minimal external application configuration', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const res = await ax.post('/api/v1/application-configs', {url: 'http://monapp.com'})
  t.is(res.status, 201)
})
