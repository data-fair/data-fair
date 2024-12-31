import { strict as assert } from 'node:assert'

describe('root', () => {
  it('Get API documentation', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
  })

  it('Get vocabulary', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/vocabulary')
    assert.equal(res.status, 200)
  })

  it('Get service info', async () => {
    const ax = global.ax.superadmin
    const res = await ax.get('/api/v1/admin/info')
    assert.equal(res.status, 200)
    assert.equal(res.data.version, 'test')
  })

  it('Check API format', async () => {
    const ax = global.ax.dmeadus
    const api = await import('./resources/geocoder-api.json', { with: { type: 'json' } })
    const res = await ax.post('/api/v1/_check-api', api)
    assert.equal(res.status, 200)
    delete api.openapi
    try {
      await ax.post('/api/v1/_check-api', api)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })
})
