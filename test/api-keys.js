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
        { title: 'key3', scopes: ['stats'], expireAt: yesterday }
      ]
    })
    assert.equal(res.data.name, 'Danna Meadus')
    const key1 = res.data.apiKeys[0].clearKey
    assert.ok(key1)
    const key2 = res.data.apiKeys[1].clearKey
    assert.ok(key2)
    const key3 = res.data.apiKeys[2].clearKey
    assert.ok(key3)
    assert.equal(res.data.email, 'dmeadus0@answers.com')

    // Right scope
    const axKey1 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key1 } })
    await axKey1.get('/api/v1/stats')

    // Wrong scope
    const axKey2 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key2 } })
    await assert.rejects(axKey2.get('/api/v1/stats'), (err) => {
      assert.equal(err.status, 403)
      assert.ok(err.response.data.includes('Cette clé d\'API n\'a pas la portée nécessaire.'))
      return true
    })

    // expired key
    const axKey3 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key3 } })
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
  })

  it('Create and use an organization level api key', async function () {
    const res = await global.ax.dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG', {
      apiKeys: [
        { title: 'key1', scopes: ['datasets'] }
      ]
    })
    assert.equal(res.data.name, 'Fivechat')
    const key1 = res.data.apiKeys[0].clearKey
    assert.ok(key1)

    // Set the correct owner
    const axKey1 = await global.ax.builder(undefined, undefined, undefined, undefined, { headers: { 'x-apiKey': key1 } })
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey1)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')
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
