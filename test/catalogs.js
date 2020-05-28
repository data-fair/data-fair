const assert = require('assert').strict
const nock = require('nock')

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .get('/api/1/site/').reply(200, { title: 'My catalog' })
  .get('/api/1/organizations/suggest/?q=koumoul').reply(200, [{ name: 'Koumoul' }])
  .get('/api/1/datasets/suggest/?q=test').reply(200, [{ title: 'Test dataset' }])

describe('Catalogs', () => {
  it('Get catalogs when not authenticated', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/catalogs')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Init catalog definition based on url', async () => {
    const ax = global.ax.anonymous
    const res = await ax.post('/api/v1/catalogs/_init', null, { params: { url: 'http://test-catalog.com' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.type, 'udata')
    assert.equal(res.data.title, 'My catalog')
  })

  it('Fail to init catalog definition based on bad url', async () => {
    const ax = global.ax.anonymous
    try {
      await ax.post('/api/v1/catalogs/_init', null, { params: { url: 'http://mycatalogTEST.com' } })
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('Search organizations in a udata catalog', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/catalogs/_organizations', { params: { type: 'udata', url: 'http://test-catalog.com', q: 'koumoul' } })
    assert.ok(res.data.results)
    assert.equal(res.data.results[0].name, 'Koumoul')
  })

  it('Search organizations in a unknown catalog type', async () => {
    const ax = global.ax.anonymous
    try {
      await ax.get('/api/v1/catalogs/_organizations', { params: { type: 'unknown', url: 'http://test-catalog.com', q: 'koumoul' } })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 404)
    }
  })

  it('Unknown catalog', async () => {
    const ax = global.ax.anonymous
    try {
      await ax.get('/api/v1/catalogs/unknownId')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 404)
    }
  })

  it('Post a minimal catalog definition, read it, update it and delete it', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/catalogs', { url: 'http://test-catalog.com', title: 'Test catalog', apiKey: 'apiKey', type: 'udata' })
    assert.equal(res.status, 201)
    const eaId = res.data.id
    res = await ax.get('/api/v1/catalogs')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    res = await ax.get('/api/v1/catalogs/' + eaId + '/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.0.0')
    res = await ax.get('/api/v1/catalogs/' + eaId)
    res = await ax.patch('/api/v1/catalogs/' + eaId, { title: 'Test catalog' })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'Test catalog')
    // Permissions
    const ax1 = global.ax.cdurning2
    try {
      await ax1.get('/api/v1/catalogs/' + eaId)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    try {
      await ax1.patch('/api/v1/catalogs/' + eaId, { title: 'Test catalog' })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    try {
      await ax1.delete('/api/v1/catalogs/' + eaId)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    // We delete the entity
    res = await ax.delete('/api/v1/catalogs/' + eaId)
    assert.equal(res.status, 204)
    res = await ax.get('/api/v1/catalogs')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Post catalog multiple times', async () => {
    const ax = global.ax.dmeadus
    const catalog = { url: 'http://test-catalog2.com', title: 'Test catalog', apiKey: 'apiKey', type: 'udata' }
    let res = await ax.post('/api/v1/catalogs', catalog)
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'test-catalog2.com')
    res = await ax.post('/api/v1/catalogs', catalog)
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'test-catalog2.com-2')
    res = await ax.post('/api/v1/catalogs', catalog)
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'test-catalog2.com-3')
  })

  it('Use PUT to create', async () => {
    const ax = global.ax.dmeadus
    const catalog = { url: 'http://test-catalog2.com', title: 'Test catalog', apiKey: 'apiKey', type: 'udata' }
    let res = await ax.put('/api/v1/catalogs/mycatalog', catalog)
    assert.equal(res.status, 201)

    // send same again
    res = await ax.put('/api/v1/catalogs/mycatalog', catalog)
    assert.equal(res.status, 200)

    // send with some change
    catalog.title = 'overwritten title'
    res = await ax.put('/api/v1/catalogs/mycatalog', catalog)
    assert.equal(res.status, 200)
    res = await ax.get('/api/v1/catalogs/mycatalog')
    assert.equal(res.data.title, 'overwritten title')

    // no permission to send as other user
    const ax2 = global.ax.hlalonde3
    try {
      res = await ax2.put('/api/v1/catalogs/mycatalog', catalog)
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })
})
