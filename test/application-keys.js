const assert = require('assert').strict
const config = require('config')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')
const rateLimitingUtils = require('../server/misc/utils/rate-limiting')

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

    res = await global.ax.anonymous.get(`/app/${encodeURIComponent(key + ':' + appId)}/`, { maxRedirects: 0 })
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
    res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    assert.ok(res.data.userPermissions.includes('readDescription'))
    assert.ok(res.data.userPermissions.includes('readLines'))
    assert.ok(res.data.userPermissions.includes('readDescription'))
    assert.ok(!res.data.userPermissions.includes('writeDescription'))

    res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + appId)}/` } })
    assert.equal(res.status, 200)
    res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + appId)}/` } })
    assert.equal(res.status, 200)
  })

  it('Use an application key to access child application (used for dashboards)', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const otherOwnerDataset = await testUtils.sendDataset('datasets/dataset1.csv', global.ax.cdurning2)
    const app1 = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    await ax.put('/api/v1/applications/' + app1.id + '/config', {
      datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}` }, { href: `${config.publicUrl}/api/v1/datasets/${otherOwnerDataset.id}` }]
    })
    const app2 = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    const app3 = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    const appOtherOwner = (await global.ax.cdurning2.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    const appParent = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    await ax.put('/api/v1/applications/' + appParent.id + '/config', {
      applications: [{ id: app1.id }, { id: app2.id }, { id: appOtherOwner.id }]
    })

    let res = await ax.get(`/app/${appParent.id}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)

    await assert.rejects(global.ax.anonymous.get(`/app/${app1.id}/`, { maxRedirects: 0 }), { status: 302 })
    await assert.rejects(global.ax.anonymous.get(`/app/${app2.id}/`, { maxRedirects: 0 }), { status: 302 })
    await assert.rejects(global.ax.anonymous.get(`/app/${appParent.id}/`, { maxRedirects: 0 }), { status: 302 })

    res = await ax.post(`/api/v1/applications/${appParent.id}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id

    res = await global.ax.anonymous.get(`/app/${encodeURIComponent(key + ':' + app1.id)}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)
    res = await global.ax.anonymous.get(`/app/${encodeURIComponent(key + ':' + app2.id)}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)
    res = await global.ax.anonymous.get(`/app/${encodeURIComponent(key + ':' + appParent.id)}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)

    await assert.rejects(global.ax.anonymous.get(`/app/${encodeURIComponent(key + ':' + app3.id)}/`, { maxRedirects: 0 }), { status: 302 })
    await assert.rejects(global.ax.anonymous.get(`/app/${encodeURIComponent(key + ':' + appOtherOwner.id)}/`, { maxRedirects: 0 }), { status: 302 })

    res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app1.id)}/` } })
    assert.equal(res.status, 200)
    res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app1.id)}/` } })
    assert.equal(res.status, 200)
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app2.id)}/` } }), { status: 403 })
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${otherOwnerDataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app1.id)}/` } }), { status: 403 })
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
    assert.deepEqual(res.data.userPermissions, ['createLine', 'readSchema', 'readDescription'])
    res = await global.ax.anonymous.get('/api/v1/datasets/restcrowd/schema', { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    const anonymousToken = (await global.ax.anonymous.get('http://localhost:8080/api/auth/anonymous-action')).data
    // rejected because token is too young
    await assert.rejects(
      global.ax.anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } }),
      err => err.status === 429)
    rateLimitingUtils.clear()
    await new Promise(resolve => setTimeout(resolve, 2000))
    // accepted because token is the right age
    res = await global.ax.anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } })
    assert.equal(res.status, 201)
    await workers.hook('finalizer/restcrowd')

    // rejected because of simple rate limiting
    await assert.rejects(
      global.ax.anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } }),
      err => err.status === 429)
  })

  it('Use an application key to manage own lines', async () => {
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    await ax.put('/api/v1/datasets/restcrowdown', {
      isRest: true,
      rest: { lineOwnership: true },
      title: 'restcrowdown',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })
    await workers.hook('finalizer/restcrowdown')

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{
        href: `${config.publicUrl}/api/v1/datasets/restcrowdown`,
        applicationKeyPermissions: { operations: ['createOwnLine', 'readOwnLines', 'readDescription'] }
      }]
    })
    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id
    const anonymousToken = (await global.ax.cdurning2.get('http://localhost:8080/api/auth/anonymous-action')).data
    await new Promise(resolve => setTimeout(resolve, 2000))
    const headers = { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken }

    await assert.rejects(
      global.ax.cdurning2.get('/api/v1/datasets/restcrowdown/lines', { headers }),
      err => err.status === 403)
    res = await global.ax.cdurning2.get('/api/v1/datasets/restcrowdown', { headers })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.userPermissions, ['createOwnLine', 'readOwnLines', 'readDescription'])

    res = await global.ax.cdurning2.post('/api/v1/datasets/restcrowdown/own/user:cdurning2/lines', {}, { headers })
    assert.equal(res.status, 201)
    await workers.hook('finalizer/restcrowdown')

    res = await global.ax.cdurning2.get('/api/v1/datasets/restcrowdown/own/user:cdurning2/lines', { headers })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
  })
})
