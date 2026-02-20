import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, sendDataset, getAxios, getAxiosAuth } from './utils/index.ts'
import { strict as assert } from 'node:assert'
import dayjs from 'dayjs'
import * as workers from '../api/src/workers/index.ts'
import * as rateLimitingUtils from '../api/src/misc/utils/rate-limiting.ts'
import config from 'config'

const anonymous = getAxios()
const bhazeldean7Org = await getAxiosAuth('bhazeldean7@cnbc.com', 'passwd', 'KWqAGZ4mG')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const hlalonde3 = await getAxiosAuth('hlalonde3@desdev.cn', 'passwd')
const hlalonde3Org = await getAxiosAuth('hlalonde3@desdev.cn', 'passwd', 'KWqAGZ4mG')
const superadmin = await getAxiosAuth('superadmin@test.com', 'superpasswd', undefined, true)

describe('API keys', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Reject wrong api key', async function () {
    const ax = await getAxios({ headers: { 'x-apiKey': 'wrong' } })
    await assert.rejects(ax.get('/api/v1/stats'), { status: 401 })
  })

  it('Manage some invald input', async function () {
    // too far in the future
    await assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'], expireAt: dayjs().add(4, 'year').format('YYYY-MM-DD') }
      ]
    }), { status: 400 })

    // id is readonly
    await assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'], id: 'test' }
      ]
    }), { status: 400 })

    // api keys are immutable
    const res = await dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'] }
      ]
    })
    assert.equal(res.data.apiKeys.length, 1)
    assert.ok(res.data.apiKeys[0].clearKey)
    assert.ok(res.data.apiKeys[0].id)
    assert.ok(!res.data.apiKeys[0].key)
    await dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: res.data.apiKeys
    })
    await assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { ...res.data.apiKeys[0], title: 'renamed api key' }
      ]
    }), { status: 400 })

    // adminMode can only created by a superadmin
    await assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'admin key', scopes: ['datasets'], adminMode: true, asAccount: true }
      ]
    }), { status: 403 })
  })

  it('Create and use a User level api key', async function () {
    const yesterday = dayjs().add(-1, 'day').format('YYYY-MM-DD')
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
    const res = await dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key1', scopes: ['stats'], expireAt: tomorrow },
        { title: 'key2', scopes: ['datasets'] },
        { title: 'key3', scopes: ['stats'], expireAt: yesterday },
        { title: 'key4', scopes: [] },
        { title: 'key5', scopes: ['datasets-read'] },
      ]
    })
    assert.equal(res.data.name, 'Danna Meadus')
    const key1 = res.data.apiKeys[0]
    assert.ok(key1.clearKey)
    assert.equal(key1.email, 'dmeadus0@answers.com')
    assert.equal(res.data.email, 'dmeadus0@answers.com')
    const key2 = res.data.apiKeys[1]
    const key3 = res.data.apiKeys[2]
    const key4 = res.data.apiKeys[3]
    assert.ok(key4.email.endsWith('@api-key.localhost:' + process.env.NGINX_PORT1))
    const key5 = res.data.apiKeys[4]

    // Right scope
    const axKey1 = await getAxios({ headers: { 'x-apiKey': key1.clearKey } })
    await axKey1.get('/api/v1/stats')

    // Wrong scope
    const axKey2 = await getAxios({ headers: { 'x-apiKey': key2.clearKey } })
    await assert.rejects(axKey2.get('/api/v1/stats'), (err: any) => {
      assert.equal(err.status, 403)
      assert.ok(err.data.includes('Cette clé d\'API n\'a pas la portée nécessaire'))
      return true
    })
    const axKey5 = await getAxios({ headers: { 'x-apiKey': key5.clearKey } })
    await assert.rejects(sendDataset('datasets/dataset1.csv', axKey5), { status: 403 })

    // expired key
    const axKey3 = await getAxios({ headers: { 'x-apiKey': key3.clearKey } })
    await assert.rejects(axKey3.get('/api/v1/stats'), (err: any) => {
      assert.equal(err.status, 403)
      assert.ok(err.data.includes('Cette clé d\'API est expirée.'))
      return true
    })

    // Set the correct owner
    const dataset = await sendDataset('datasets/dataset1.csv', axKey2)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'user')
    assert.equal(dataset.owner.id, 'dmeadus0')
    await axKey2.get('/api/v1/datasets/' + dataset.id + '/lines')
    await axKey5.get('/api/v1/datasets/' + dataset.id + '/lines')

    // API key should react to permission granted through user email
    const orgDataset = await sendDataset('datasets/dataset1.csv', hlalonde3Org)
    await assert.rejects(axKey2.get('/api/v1/datasets/' + orgDataset.id + '/lines'), { status: 403 })
    await hlalonde3Org.put('/api/v1/datasets/' + orgDataset.id + '/permissions', [
      { type: 'user', email: 'dmeadus0@answers.com', classes: ['read'] }
    ])
    await axKey2.get('/api/v1/datasets/' + orgDataset.id + '/lines')

    // API key without scope should only react to permission granted through specific email
    const axKey4 = await getAxios({ headers: { 'x-apiKey': key4.clearKey } })
    await assert.rejects(axKey4.get('/api/v1/datasets/' + dataset.id + '/lines'), { status: 403 })
    await assert.rejects(axKey4.get('/api/v1/datasets/' + orgDataset.id + '/lines'), { status: 403 })
    await hlalonde3Org.put('/api/v1/datasets/' + orgDataset.id + '/permissions', [
      { type: 'user', email: key4.email, classes: ['read'] }
    ])
    await axKey4.get('/api/v1/datasets/' + orgDataset.id + '/lines')
  })

  it('Create and use an organization level api key', async function () {
    const res = await dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG', {
      apiKeys: [
        { title: 'Key 1', scopes: ['datasets'] },
        { title: 'Key 2', scopes: [] }
      ]
    })
    assert.equal(res.data.name, 'Fivechat')
    const key1 = res.data.apiKeys[0]
    assert.ok(key1.clearKey)
    assert.ok(key1.email)
    assert.ok(key1.email.startsWith('key-1-'))
    assert.ok(key1.id)
    assert.ok(!key1.key)
    const key2 = res.data.apiKeys[1]

    // Set the correct owner
    const axKey1 = await getAxios({ headers: { 'x-apiKey': key1.clearKey } })
    const dataset = await sendDataset('datasets/dataset1.csv', axKey1)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')

    // API key should react to permission granted through its pseudo email
    const otherDataset = await sendDataset('datasets/dataset1.csv', hlalonde3)
    await assert.rejects(axKey1.get('/api/v1/datasets/' + otherDataset.id + '/lines'), { status: 403 })
    await hlalonde3.put('/api/v1/datasets/' + otherDataset.id + '/permissions', [
      { type: 'user', email: key1.email, classes: ['read'] }
    ])
    await axKey1.get('/api/v1/datasets/' + otherDataset.id + '/lines')

    // API key without a scope only gets explicit permissions
    const axKey2 = await getAxios({ headers: { 'x-apiKey': key2.clearKey } })
    await assert.rejects(axKey2.get('/api/v1/datasets/' + dataset.id + '/lines'), { status: 403 })
    await assert.rejects(axKey2.get('/api/v1/datasets/' + otherDataset.id + '/lines'), { status: 403 })
    await hlalonde3.put('/api/v1/datasets/' + otherDataset.id + '/permissions', [
      { type: 'user', email: key2.email, classes: ['read'] }
    ])
    await axKey2.get('/api/v1/datasets/' + otherDataset.id + '/lines')
  })

  it('Create and use a department level api key', async function () {
    const res = await hlalonde3Org.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', {
      apiKeys: [
        { title: 'key1', scopes: ['datasets'] }
      ]
    })
    assert.equal(res.data.name, 'Fivechat - dep1')
    const key1 = res.data.apiKeys[0].clearKey
    assert.ok(key1)

    // Set the correct owner
    const axKey1 = await getAxios({ headers: { 'x-apiKey': key1 } })
    const dataset = await sendDataset('datasets/dataset1.csv', axKey1)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')
    assert.equal(dataset.owner.department, 'dep1')
  })

  it('Create and use a adminMode/asAccount api key', async function () {
    const res = await superadmin.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'admin key', scopes: ['datasets'], adminMode: true, asAccount: true }
      ]
    })
    const key = res.data.apiKeys[0].clearKey
    assert.ok(key)
    const axKey = await getAxios({
      headers: { 'x-apiKey': key, 'x-account': JSON.stringify({ type: 'organization', id: 'KWqAGZ4mG', name: encodeURIComponent('Fivechat testé') }) }
    })

    const dataset = await sendDataset('datasets/dataset1.csv', axKey)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')
    assert.equal(dataset.owner.name, 'Fivechat testé')

    // user cannot delete the key
    assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { ...res.data.apiKeys[0], scopes: ['stats'] }
      ]
    }), { status: 403 })
    // user cannot mutate the key
    assert.rejects(dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: []
    }), { status: 403 })
    // the admin key is still working
    await axKey.get('/api/v1/datasets/' + dataset.id)
    // superadmin can delete the key
    await superadmin.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: []
    })
    // the admin key is no longer working
    await assert.rejects(axKey.get('/api/v1/datasets/' + dataset.id), { status: 401 })
  })

  it('application keys empty array by default', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    res = await ax.get(`/api/v1/applications/${appId}/keys`)
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 0)
  })

  it('application keys restricted to admins', async function () {
    const res = await dmeadusOrg.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id

    await assert.rejects(
      bhazeldean7Org.get(`/api/v1/applications/${appId}/keys`),
      { status: 403 }
    )
  })

  it('application keys automatically filled ids', async function () {
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
