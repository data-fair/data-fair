import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset } from './utils/index.ts'
import config from 'config'
import * as workers from '../api/src/workers/index.ts'
import * as rateLimitingUtils from '../api/src/misc/utils/rate-limiting.ts'

const anonymous = getAxios()
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const bhazeldean7Org = await getAxiosAuth('bhazeldean7@cnbc.com', 'passwd', 'KWqAGZ4mG')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')

describe('Applications keys for unauthenticated readOnly access', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Empty array by default', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.get(`/api/v1/applications/${appId}/keys`)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 0)
  })

  it('Restricted to admins', async function () {
    const res = await dmeadusOrg.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    await assert.rejects(
      bhazeldean7Org.get(`/api/v1/applications/${appId}/keys`),
      { status: 403 }
    )
  })

  it('Automatically filled ids', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 1)
    assert.ok(!!res.data[0].id)
  })

  it('Use an application key to access application', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.get(`/app/${appId}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)

    await assert.rejects(
      anonymous.get(`/app/${appId}/`, { maxRedirects: 0 }),
      { status: 302 }
    )

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id

    res = await anonymous.get(`/app/${appId}/?key=${key}`, { maxRedirects: 0 })
    assert.equal(res.status, 200)

    res = await anonymous.get(`/app/${encodeURIComponent(key + ':' + appId)}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)
  })

  it('Use an application key to access datasets referenced in config', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await sendDataset('datasets/dataset1.csv', ax)

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [
        { href: `${config.publicUrl}/api/v1/datasets/${dataset.id}` },
        { href: `${config.publicUrl}/api/v1/datasets/${dataset2.id}` }
      ]
    })

    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 403 })
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset2.id}/lines`), { status: 403 })

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id

    // 1rst dataset has default permission of application key (classes=read)
    res = await anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    res = await anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    assert.ok(res.data.userPermissions.includes('readDescription'))
    assert.ok(res.data.userPermissions.includes('readLines'))
    assert.ok(res.data.userPermissions.includes('readDescription'))
    assert.ok(!res.data.userPermissions.includes('writeDescription'))
    res = await anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + appId)}/` } })
    assert.equal(res.status, 200)
    res = await anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + appId)}/` } })
    assert.equal(res.status, 200)

    // 2nd dataset has more specific permissions based on applicationKeyPermissions
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset2.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } }), { status: 403 })
    res = await anonymous.get(`/api/v1/datasets/${dataset2.id}/safe-schema`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
  })

  it('Use an application key to access child applications and previews (used for dashboards)', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const dataset2 = await sendDataset('datasets/dataset1.csv', ax)
    const otherOwnerDataset = await sendDataset('datasets/dataset1.csv', cdurning2)
    const app1 = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    await ax.put('/api/v1/applications/' + app1.id + '/config', {
      datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset.id}` }, { href: `${config.publicUrl}/api/v1/datasets/${otherOwnerDataset.id}` }]
    })
    const app2 = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    const app3 = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    const appOtherOwner = (await cdurning2.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    const appParent = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data
    await ax.put('/api/v1/applications/' + appParent.id + '/config', {
      applications: [{ id: app1.id }, { id: app2.id }, { id: appOtherOwner.id }],
      datasets: [{ href: `${config.publicUrl}/api/v1/datasets/${dataset2.id}` }, { href: `${config.publicUrl}/api/v1/datasets/${otherOwnerDataset.id}` }]
    })

    let res = await ax.get(`/app/${appParent.id}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)

    await assert.rejects(anonymous.get(`/app/${app1.id}/`, { maxRedirects: 0 }), { status: 302 })
    await assert.rejects(anonymous.get(`/app/${app2.id}/`, { maxRedirects: 0 }), { status: 302 })
    await assert.rejects(anonymous.get(`/app/${appParent.id}/`, { maxRedirects: 0 }), { status: 302 })

    res = await ax.post(`/api/v1/applications/${appParent.id}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id

    res = await anonymous.get(`/app/${encodeURIComponent(key + ':' + app1.id)}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)
    res = await anonymous.get(`/app/${encodeURIComponent(key + ':' + app2.id)}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)
    res = await anonymous.get(`/app/${encodeURIComponent(key + ':' + appParent.id)}/`, { maxRedirects: 0 })
    assert.equal(res.status, 200)

    await assert.rejects(anonymous.get(`/app/${encodeURIComponent(key + ':' + app3.id)}/`, { maxRedirects: 0 }), { status: 302 })
    await assert.rejects(anonymous.get(`/app/${encodeURIComponent(key + ':' + appOtherOwner.id)}/`, { maxRedirects: 0 }), { status: 302 })

    res = await anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app1.id)}/` } })
    assert.equal(res.status, 200)
    res = await anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app1.id)}/` } })
    assert.equal(res.status, 200)
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app2.id)}/` } }), { status: 403 })
    await assert.rejects(anonymous.get(`/api/v1/datasets/${otherOwnerDataset.id}`, { headers: { referrer: config.publicUrl + `/app/${encodeURIComponent(key + ':' + app1.id)}/` } }), { status: 403 })

    res = await anonymous.get(`/api/v1/datasets/${dataset2.id}`, { headers: { referrer: config.publicUrl + `/embed/dataset/${encodeURIComponent(key + ':' + dataset2.id)}/` } })
    assert.equal(res.status, 200)
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/embed/dataset/${encodeURIComponent(key + ':' + dataset2.id)}/` } }), { status: 403 })
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}`, { headers: { referrer: config.publicUrl + `/embed/dataset/${encodeURIComponent(key + ':' + dataset.id)}/` } }), { status: 403 })
    await assert.rejects(anonymous.get(`/api/v1/datasets/${otherOwnerDataset.id}`, { headers: { referrer: config.publicUrl + `/embed/dataset/${encodeURIComponent(key + ':' + otherOwnerDataset.id)}/` } }), { status: 403 })
  })

  it('Reject an application without the read permission', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    const dataset = await sendDataset('datasets/dataset1.csv', ax)

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{
        href: `${config.publicUrl}/api/v1/datasets/${dataset.id}`,
        applicationKeyPermissions: { operations: ['createLine'] }
      }]
    })

    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id
    await assert.rejects(
      anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } }),
      (err: any) => err.status === 403)
  })

  it('Use an application key to post lines into referenced datasets', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    await ax.put('/api/v1/datasets/restcrowd', {
      isRest: true,
      title: 'restcrowd',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{
        href: `${config.publicUrl}/api/v1/datasets/restcrowd`,
        applicationKeyPermissions: { operations: ['createLine', 'readSchema', 'readDescription'] }
      }]
    })
    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id
    assert.rejects(
      anonymous.get('/api/v1/datasets/restcrowd/lines', { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } }),
      (err: any) => err.status === 403)
    res = await anonymous.get('/api/v1/datasets/restcrowd', { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.userPermissions, ['createLine', 'readSchema', 'readDescription'])
    res = await anonymous.get('/api/v1/datasets/restcrowd/schema', { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}` } })
    assert.equal(res.status, 200)
    const anonymousToken = (await anonymous.get(config.directoryUrl + '/api/auth/anonymous-action')).data
    // rejected because token is too young
    await assert.rejects(
      anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } }),
      (err: any) => err.status === 429)
    rateLimitingUtils.clear()
    await new Promise(resolve => setTimeout(resolve, 2000))
    // accepted because token is the right age
    res = await anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } })
    assert.equal(res.status, 201)
    await workers.hook('finalize/restcrowd')

    // rejected because of simple rate limiting
    await assert.rejects(
      anonymous.post('/api/v1/datasets/restcrowd/lines', {}, { headers: { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken } }),
      (err: any) => err.status === 429)
  })

  it('Use an application key to manage own lines', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    await ax.put('/api/v1/datasets/restcrowdown', {
      isRest: true,
      rest: { lineOwnership: true },
      title: 'restcrowdown',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }]
    })

    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{
        href: `${config.publicUrl}/api/v1/datasets/restcrowdown`,
        applicationKeyPermissions: { operations: ['createOwnLine', 'readOwnLines', 'readDescription'] }
      }]
    })
    res = await ax.post(`/api/v1/applications/${appId}/keys`, [{ title: 'Access key' }])
    const key = res.data[0].id
    const anonymousToken = (await cdurning2.get(config.directoryUrl + '/api/auth/anonymous-action')).data
    await new Promise(resolve => setTimeout(resolve, 2000))
    const headers = { referrer: config.publicUrl + `/app/${appId}/?key=${key}`, 'x-anonymousToken': anonymousToken }

    await assert.rejects(
      cdurning2.get('/api/v1/datasets/restcrowdown/lines', { headers }),
      (err: any) => err.status === 403)
    res = await cdurning2.get('/api/v1/datasets/restcrowdown', { headers })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.userPermissions, ['createOwnLine', 'readOwnLines', 'readDescription'])

    res = await cdurning2.post('/api/v1/datasets/restcrowdown/own/user:cdurning2/lines', {}, { headers })
    assert.equal(res.status, 201)
    await workers.hook('finalize/restcrowdown')

    res = await cdurning2.get('/api/v1/datasets/restcrowdown/own/user:cdurning2/lines', { headers })
    assert.equal(res.status, 200)
    assert.equal(res.data.total, 1)
  })
})
