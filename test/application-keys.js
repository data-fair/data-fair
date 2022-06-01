const assert = require('assert').strict
const config = require('config')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')
const rateLimitingUtils = require('../server/utils/rate-limiting')

describe('Applications keys for unauthenticated readOnly access', () => {
  it('Empty array by default', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.get(`/api/v1/applications/${appId}/keys`)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 0)
  })

  it('Restricted to admins', async () => {
    const res = await global.ax.dmeadusOrg.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    try {
      await global.ax.bhazeldean7Org.get(`/api/v1/applications/${appId}/keys`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
  })

  it('Automatically filled ids', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 1)
    assert.ok(!!res.data[0].id)
  })

  it('Use an application key to access application', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.get(`/app/${appId}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)

    try {
      await global.ax.anonymous.get(`/app/${appId}/`, { maxRedirects: 0 })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 302)
    }

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id

    res = await global.ax.anonymous.get(`/app/${appId}/?key=${key}`, { maxRedirects: 0 })
    assert.equal(res.status, 200)
  })

  it('Use an application key to access datasets referenced in config', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}` }]
    })

    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`), err => err.status === 403)

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key', permissions: { read: true, createLine: false } }])
    const key = res.data[0].id
    res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
  })

  it('Reject an application without the read permission', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{
        href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`,
        applicationKeyPermissions: { operations: ['createLine'] }
      }]
    })

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id
    await assert.rejects(
      global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } }),
      err => err.status === 403)
  })

  it('Use an application key to post lines into referenced datasets', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    await ax.put('/api/v1/datasets/restcrowd', {
      isRest: true,
      title: 'restcrowd',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/restcrowd')

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{
        href: `${config.publicUrl}/api/v1/datasets/restcrowd`,
        applicationKeyPermissions: { operations: ['createLine', 'readSchema', 'readDescription'] }
      }]
    })
    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id
    assert.rejects(
      global.ax.anonymous.get('/api/v1/datasets/restcrowd/lines', { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } }),
      err => err.status === 403)
    res = await global.ax.anonymous.get('/api/v1/datasets/restcrowd', { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    res = await global.ax.anonymous.get('/api/v1/datasets/restcrowd/schema', { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    const anonymousToken = (await global.ax.anonymous.get('http://localhost:8080/api/auth/anonymous-action')).data
    // rejected because token is too young
    await assert.rejects(
      global.ax.anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } }),
      err => err.status === 429)
    rateLimitingUtils.postApplicationKey.reward(1)
    await new Promise(resolve => setTimeout(resolve, 2000))
    // accepted because token is the right age
    res = await global.ax.anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } })
    assert.equal(res.status, 201)

    // rejected because ok simple rate limiting
    await assert.rejects(
      global.ax.anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } }),
      err => err.status === 429)
  })
})
