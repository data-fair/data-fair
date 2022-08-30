const assert = require('assert').strict
const config = require('config')
const workers = require('../server/workers')

describe('Applications', () => {
  it('Get applications when not authenticated', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Access an unknown applicationId on proxy endpoint', async () => {
    const ax = global.ax.anonymous
    try {
      await ax.get('/app/unknownId')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 404)
    }
  })

  it('Post an external application configuration, read it, update it and delete it', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    assert.equal(res.status, 201)

    const appId = res.data.id
    res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.ok(res.data.count >= 1)
    res = await ax.get('/api/v1/applications/' + appId)
    assert.equal(res.data.url, 'http://monapp1.com/')
    res = await ax.get('/api/v1/applications/' + appId + '/api-docs.json')
    assert.ok(res.data.openapi)
    res = await ax.get('/api/v1/applications/' + appId + '/config')
    assert.equal(res.status, 200)
    res = await ax.patch('/api/v1/applications/' + appId, { title: 'Test application config' })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'Test application config')
    res = await ax.delete('/api/v1/applications/' + appId)
    assert.equal(res.status, 204)
    res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Manage the custom configuration part of the object', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id
    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{ href: config.publicUrl + '/api/v1/datasets/111' }]
    })
    assert.equal(res.status, 200)
    res = await ax.get('/api/v1/applications/' + appId + '/config')
    assert.equal(res.status, 200)
    assert.equal(res.data.datasets.length, 1)
    res = await ax.get('/api/v1/applications', { params: { dataset: 'nope' } })
    assert.equal(res.data.count, 0)
    res = await ax.get('/api/v1/applications', { params: { dataset: '111' } })
    assert.equal(res.data.count, 1)
  })

  it('Use an application through the application proxy', async () => {
    const ax = global.ax.dmeadus
    const adminAx = global.ax.alban
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    // The same content is returned with or without a trailing slash
    res = await ax.get(`/app/${appId}/`)
    assert.equal(res.status, 200)
    res = await ax.get('/app/' + appId)
    assert.equal(res.status, 200)

    // The HTML content is returned
    assert.ok(res.headers['content-type'].startsWith('text/html'))
    assert.ok(res.data.includes('My app body'))
    // The configuration is injected
    assert.ok(res.data.includes('window.APPLICATION={'))
    // A link to the manifest is injected
    assert.ok(res.data.includes(`<link rel="manifest" crossorigin="use-credentials" href="/app/${appId}/manifest.json">`))
    // The app reference a service worker
    assert.ok(res.data.includes('/app-sw.js'))
    // the app contains the brand embed (cf config.brand.embed)
    assert.ok(res.data.includes('<div>application embed</div>'))

    // no brand embed if the specific limit is defined
    await adminAx.post('/api/v1/limits/user/dmeadus0', { hide_brand: { limit: 1 }, lastUpdate: new Date().toISOString() }, { params: { key: config.secretKeys.limits } })
    res = await ax.get('/app/' + appId)
    assert.equal(res.data.includes('<div>application embed</div>'), false)
  })

  it('Read base app info of an application', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id
    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{ href: config.publicUrl + '/api/v1/datasets/111' }]
    })
    assert.equal(res.status, 200)
    res = await ax.get('/api/v1/applications/' + appId + '/base-application')
    assert.equal(res.status, 200)
    assert.equal(res.data.applicationName, 'test')
    assert.equal(res.data.image, 'http://monapp1.com/thumbnail.png')
  })

  it('Read capture of application', async () => {
    const ax = global.ax.dmeadus
    try {
      await ax.get(config.captureUrl + '/api/v1/api-docs.json')
    } catch (err) {
      console.warn('capture is not available in this test environment')
      assert.equal(err.code, 'ECONNREFUSED')
      return
    }

    const { data: app } = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const { data: dataset } = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
    await workers.hook('finalizer/' + dataset.id)
    await ax.put('/api/v1/applications/' + app.id + '/config', {
      datasets: [{ href: dataset.href, id: dataset.id }]
    })
    let res = await ax.get('/api/v1/applications/' + app.id + '/capture')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'MISS')
    res = await ax.get('/api/v1/applications/' + app.id + '/capture')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'HIT')
    await ax.put('/api/v1/applications/' + app.id + '/config', {
      datasets: [{ href: dataset.href, id: dataset.id }],
      test: 'ok'
    })
    res = await ax.get('/api/v1/applications/' + app.id + '/capture')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'EXPIRED')

    res = await ax.get('/api/v1/applications/' + app.id + '/capture?app_test=ok')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'BYPASS')
  })
})
