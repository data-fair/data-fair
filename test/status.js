const assert = require('assert').strict

describe('status', () => {
  it('Get status', async () => {
    await assert.rejects(global.ax.anonymous.get('/api/v1/admin/status'), (err) => err.status === 401)
    await assert.rejects(global.ax.superadminPersonal.get('/api/v1/admin/status'), (err) => err.status === 403)
    const res = await global.ax.superadmin.get('/api/v1/admin/status')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'ok')
    assert.equal(res.data.details.length, 5)
  })

  it('Ping service', async () => {
    const res = await global.ax.anonymous.get('/api/v1/ping')
    assert.equal(res.status, 200)
    assert.equal(res.data, 'ok')
  })
})
