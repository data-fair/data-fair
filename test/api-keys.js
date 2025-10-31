import * as testUtils from './resources/test-utils.js'
import { strict as assert } from 'node:assert'
import dayjs from 'dayjs'

describe('API keys', function () {
  it('Reject wrong api key', async function () {
    const ax = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': 'wrong' } })
    await assert.rejects(ax.get('/api/v1/stats'), { status: 401 })
  })

  it('Manage some invald input', async function () {
    // too far in the future
    await assert.rejects(global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'], expireAt: dayjs().add(2, 'year').format('YYYY-MM-DD') }
      ]
    }), { status: 400 })

    // id is readonly
    await assert.rejects(global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'], id: 'test' }
      ]
    }), { status: 400 })

    // api keys are immutable
    const res = await global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key', scopes: ['stats'] }
      ]
    })
    assert.equal(res.data.apiKeys.length, 1)
    assert.ok(res.data.apiKeys[0].clearKey)
    assert.ok(res.data.apiKeys[0].id)
    assert.ok(!res.data.apiKeys[0].key)
    await global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: res.data.apiKeys
    })
    await assert.rejects(global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { ...res.data.apiKeys[0], title: 'renamed api key' }
      ]
    }), { status: 400 })

    // adminMode can only created by a superadmin
    await assert.rejects(global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'admin key', scopes: ['datasets'], adminMode: true, asAccount: true }
      ]
    }), { status: 403 })
  })

  it('Create and use a User level api key', async function () {
    const yesterday = dayjs().add(-1, 'day').format('YYYY-MM-DD')
    const tomorrow = dayjs().add(1, 'day').format('YYYY-MM-DD')
    const res = await global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key1', scopes: ['stats'], expireAt: tomorrow },
        { title: 'key2', scopes: ['datasets'] },
        { title: 'key3', scopes: ['stats'], expireAt: yesterday },
        { title: 'key4', scopes: [] }
      ]
    })
    assert.equal(res.data.name, 'Danna Meadus')
    const key1 = res.data.apiKeys[0]
    assert.ok(key1.clearKey)
    assert.equal(key1.email, 'dmeadus0@answers.com')
    assert.equal(res.data.email, 'dmeadus0@answers.com')
    const key2 = res.data.apiKeys[1]
    assert.ok(key2.clearKey)
    const key3 = res.data.apiKeys[2]
    assert.ok(key3.clearKey)
    const key4 = res.data.apiKeys[3]
    assert.ok(key4.clearKey)
    assert.ok(key4.email.endsWith('@api-key.localhost:5600'))

    // Right scope
    const axKey1 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key1.clearKey } })
    await axKey1.get('/api/v1/stats')

    // Wrong scope
    const axKey2 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key2.clearKey } })
    await assert.rejects(axKey2.get('/api/v1/stats'), (err) => {
      assert.equal(err.status, 403)
      assert.ok(err.response.data.includes('Cette clé d\'API n\'a pas la portée nécessaire.'))
      return true
    })

    // expired key
    const axKey3 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key3.clearKey } })
    await assert.rejects(axKey3.get('/api/v1/stats'), (err) => {
      assert.equal(err.status, 403)
      assert.ok(err.response.data.includes('Cette clé d\'API est expirée.'))
      return true
    })

    // Set the correct owner
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey2)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'user')
    assert.equal(dataset.owner.id, 'dmeadus0')

    // API key should react to permission granted through user email
    const orgDataset = await testUtils.sendDataset('datasets/dataset1.csv', global.ax.hlalonde3Org)
    await assert.rejects(axKey2.get('/api/v1/datasets/' + orgDataset.id + '/lines'), { status: 403 })
    await global.ax.hlalonde3Org.put('/api/v1/datasets/' + orgDataset.id + '/permissions', [
      { type: 'user', email: 'dmeadus0@answers.com', classes: ['read'] }
    ])
    await axKey2.get('/api/v1/datasets/' + orgDataset.id + '/lines')

    // API key without scope should only react to permission granted through specific email
    const axKey4 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key4.clearKey } })
    await assert.rejects(axKey4.get('/api/v1/datasets/' + dataset.id + '/lines'), { status: 403 })
    await assert.rejects(axKey4.get('/api/v1/datasets/' + orgDataset.id + '/lines'), { status: 403 })
    await global.ax.hlalonde3Org.put('/api/v1/datasets/' + orgDataset.id + '/permissions', [
      { type: 'user', email: key4.email, classes: ['read'] }
    ])
    await axKey4.get('/api/v1/datasets/' + orgDataset.id + '/lines')
  })

  it('Create and use an organization level api key', async function () {
    const res = await global.ax.dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG', {
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
    const axKey1 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key1.clearKey } })
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey1)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')

    // API key should react to permission granted through its pseudo email
    const otherDataset = await testUtils.sendDataset('datasets/dataset1.csv', global.ax.hlalonde3)
    await assert.rejects(axKey1.get('/api/v1/datasets/' + otherDataset.id + '/lines'), { status: 403 })
    await global.ax.hlalonde3.put('/api/v1/datasets/' + otherDataset.id + '/permissions', [
      { type: 'user', email: key1.email, classes: ['read'] }
    ])
    await axKey1.get('/api/v1/datasets/' + otherDataset.id + '/lines')

    // API key without a scope only gets explicit permissions
    const axKey2 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key2.clearKey } })
    await assert.rejects(axKey2.get('/api/v1/datasets/' + dataset.id + '/lines'), { status: 403 })
    await assert.rejects(axKey2.get('/api/v1/datasets/' + otherDataset.id + '/lines'), { status: 403 })
    await global.ax.hlalonde3.put('/api/v1/datasets/' + otherDataset.id + '/permissions', [
      { type: 'user', email: key2.email, classes: ['read'] }
    ])
    await axKey2.get('/api/v1/datasets/' + otherDataset.id + '/lines')
  })

  it('Create and use a department level api key', async function () {
    const res = await global.ax.hlalonde3Org.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', {
      apiKeys: [
        { title: 'key1', scopes: ['datasets'] }
      ]
    })
    assert.equal(res.data.name, 'Fivechat - dep1')
    const key1 = res.data.apiKeys[0].clearKey
    assert.ok(key1)

    // Set the correct owner
    const axKey1 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key1 } })
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey1)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')
    assert.equal(dataset.owner.department, 'dep1')
  })

  it('Create and use a adminMode/asAccount api key', async function () {
    const res = await global.ax.superadmin.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'admin key', scopes: ['datasets'], adminMode: true, asAccount: true }
      ]
    })
    const key = res.data.apiKeys[0].clearKey
    assert.ok(key)
    const axKey = await global.ax.builder(undefined, undefined, undefined, undefined, {
      headers: { 'x-apiKey': key, 'x-account': JSON.stringify({ type: 'organization', id: 'KWqAGZ4mG', name: encodeURIComponent('Fivechat testé') }) }
    })

    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')
    assert.equal(dataset.owner.name, 'Fivechat testé')

    // user cannot delete the key
    assert.rejects(global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { ...res.data.apiKeys[0], scopes: ['stats'] }
      ]
    }), { status: 403 })
    // user cannot mutate the key
    assert.rejects(global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: []
    }), { status: 403 })
    // user can add another key
    global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        res.data.apiKeys[0],
        { title: 'uset key', scopes: ['datasets'] }
      ]
    })
    // the admin key is still working
    await axKey.get('/api/v1/datasets/' + dataset.id)
    // superadmin can delete the key
    await global.ax.superadmin.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: []
    })
    // the admin key is no longer working
    await assert.rejects(axKey.get('/api/v1/datasets/' + dataset.id), { status: 401 })
  })
})
