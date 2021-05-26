const nock = require('nock')
const assert = require('assert').strict

describe('remote-services', () => {
  it('Get external APIs when not authenticated', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  it('Post a minimal external API, read it, update it and delete it', async () => {
    const ax = global.ax.superadmin
    const apiDoc = require('./resources/geocoder-api.json')
    apiDoc.info['x-api-id'] = 'geocoder2'
    let res = await ax.post('/api/v1/remote-services', { apiDoc, apiKey: { in: 'header', name: 'x-apiKey' }, public: true })
    assert.equal(res.status, 201)
    const eaId = res.data.id
    res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    res = await ax.get('/api/v1/remote-services/' + eaId + '/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
    res = await ax.get('/api/v1/remote-services/' + eaId)
    assert.equal(res.data.apiDoc.info['x-api-id'], 'geocoder2')
    res = await ax.patch('/api/v1/remote-services/' + eaId, { title: 'Test external api' })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'Test external api')
    // Permissions
    const ax1 = global.ax.cdurning2
    try {
      await ax1.patch('/api/v1/remote-services/' + eaId, { title: 'Test external api' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    try {
      await ax1.delete('/api/v1/remote-services/' + eaId)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    // We delete the entity
    res = await ax.delete('/api/v1/remote-services/' + eaId)
    assert.equal(res.status, 204)
    res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  it('Unknown external service', async () => {
    const ax = global.ax.anonymous
    try {
      await ax.get('/api/v1/remote-services/unknownId')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 404)
    }
  })

  it('Handle timeout errors from proxied service', async () => {
    const ax = global.ax.superadmin
    nock('http://test.com').get('/geocoder/coord').delay(60000).reply(200, { content: 'ok' })
    try {
      await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord')
    } catch (err) {
      assert.equal(err.status, 504)
    }
  })

  it('Prevent abusing remote service re-exposition', async () => {
    const ax = global.ax.superadmin

    const nockScope = nock('http://test.com').get('/geocoder/coord').reply(200, { content: 'ok' })
    const res = await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord')
    assert.equal(res.data.content, 'ok')
    nockScope.done()
    try {
      await ax.post('/api/v1/remote-services/geocoder-koumoul/proxy/coords')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 405)
    }

    nock('http://test.com').persist().get('/geocoder/coords').reply(200, { content: Buffer.alloc(50000).toString('hex') })
    try {
      for (let i = 0; i < 4; i++) {
        await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coords')
      }
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 429)
    }

    nock('http://test.com').persist().get('/geocoder/coord').reply(200, { content: 'ok' })
    const promises = []
    for (let i = 0; i < 15; i++) {
      promises.push(ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord'))
    }
    try {
      await Promise.all(promises)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 429)
    }
  })
})
