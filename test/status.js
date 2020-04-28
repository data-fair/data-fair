const testUtils = require('./resources/test-utils')



it('Get status', async () => {
  const ax = await global.ax.builder()
  const res = await ax.get('/api/v1/status')
  assert.equal(res.status, 200)
  assert.equal(res.data.status, 'ok')
  assert.equal(res.data.details.length, 5)
})

it('Ping service', async () => {
  const ax = await global.ax.builder()
  const res = await ax.get('/api/v1/ping')
  assert.equal(res.status, 200)
  assert.equal(res.data, 'ok')
})
