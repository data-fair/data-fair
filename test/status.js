const assert = require('assert').strict

describe('status', () => {
  it('Get status', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/status')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'ok')
    assert.equal(res.data.details.length, 5)
  })

  it('Ping service', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/ping')
    assert.equal(res.status, 200)
    assert.equal(res.data, 'ok')
  })
})
