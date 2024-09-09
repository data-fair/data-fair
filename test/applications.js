const assert = require('assert').strict
const config = require('config')
const workers = require('../server/workers')
const testUtils = require('./resources/test-utils')

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

  it('Post an application configuration, read it, update it and delete it', async () => {
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

    const dataset = await testUtils.sendDataset('datasets/split.csv', ax)

    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/', configuration: { datasets: [{ id: dataset.id, href: config.publicUrl + '/api/v1/datasets/' + dataset.id }] } })
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
    const application = JSON.parse(/>window\.APPLICATION=(.*);</.exec(res.data)[1])
    assert.ok(application.configuration)
    assert.ok(application.configuration.datasets?.length, 1)
    const datasetRef = application.configuration.datasets[0]
    assert.deepEqual(Object.keys(datasetRef).sort(), ['finalizedAt', 'href', 'id', 'owner', 'page', 'previews', 'public', 'schema', 'title', 'userPermissions', 'visibility'])

    // A link to the manifest is injected
    assert.ok(res.data.includes(`<link rel="manifest" crossorigin="use-credentials" href="/data-fair/app/${appId}/manifest.json">`))
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

  it('Read capture of application', async function () {
    const ax = global.ax.dmeadus
    try {
      await ax.get(config.captureUrl + '/api/v1/api-docs.json')
    } catch (err) {
      console.warn('capture is not available in this test environment')
      assert.equal(err.status, 502)
      return
    }

    const { data: app } = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const { data: dataset } = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
    await workers.hook('finalizer/' + dataset.id)
    await ax.put('/api/v1/applications/' + app.id + '/config', { datasets: [{ href: dataset.href, id: dataset.id }] })
    const updatedAt = (await ax.get('/api/v1/applications/' + app.id)).data.updatedAt
    assert.ok(updatedAt)

    // 1rst call, the capture file is created
    let res = await ax.get('/api/v1/applications/' + app.id + '/capture')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'MISS')
    assert.equal(res.headers['cache-control'], 'no-cache, private')

    // 2nd call, the capture file is served directly
    res = await ax.get('/api/v1/applications/' + app.id + '/capture?updatedAt=' + updatedAt)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'HIT')
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=604800')

    // after a config change file should be recreated
    await ax.put('/api/v1/applications/' + app.id + '/config', { datasets: [{ href: dataset.href, id: dataset.id }], test: 'ok' })
    res = await ax.get('/api/v1/applications/' + app.id + '/capture')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'EXPIRED')

    // with some extra param no file cache is used
    res = await ax.get('/api/v1/applications/' + app.id + '/capture?app_test=ok')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'BYPASS')

    // when an error is thrown it is forwarded
    await assert.rejects(ax.get('/api/v1/applications/' + app.id + '/capture?app_test=1&app_capture-test-error=true'), (err) => {
      assert.equal(err.headers['cache-control'], 'no-cache')
      assert.equal(err.status, 500)
      return true
    })
    // when an error in cached default thumbnail mode a no-preview image is returned
    await ax.put('/api/v1/applications/' + app.id + '/config', { datasets: [{ href: dataset.href, id: dataset.id }], test: 'ok2' })
    await assert.rejects(ax.get('/api/v1/applications/' + app.id + '/capture?app_capture-test-error=true', { maxRedirects: 0 }), (err) => {
      assert.equal(err.status, 302)
      assert.ok(err.headers.location.endsWith('/no-preview.png'))
      return true
    })

    // use /print to get a PDF print instead of image capture
    res = await ax.get('/api/v1/applications/' + app.id + '/print?app_test=ok')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/pdf')
  })

  it('Sort applications by title', async () => {
    const ax = global.ax.dmeadus

    await ax.post('/api/v1/applications', { title: 'aa', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: 'bb', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: 'àb', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: ' àb', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: '1a', url: 'http://monapp1.com/' })

    let res = await ax.get('/api/v1/applications', { params: { select: 'title', raw: true, sort: 'title:1' } })
    assert.deepEqual(res.data.results.map(d => d.title), ['1a', 'aa', 'àb', 'àb', 'bb'])
    res = await ax.get('/api/v1/applications', { params: { select: 'title', raw: true, sort: 'title:-1' } })
    assert.deepEqual(res.data.results.map(d => d.title), ['bb', 'àb', 'àb', 'aa', '1a'])
  })
})
