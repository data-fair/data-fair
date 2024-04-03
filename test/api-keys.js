const testUtils = require('./resources/test-utils')
const assert = require('assert').strict

describe('API keys', () => {
  it('Reject wrong api key', async () => {
    const ax = await global.ax.builder(null, null, { headers: { 'x-apiKey': 'wrong' } })
    await assert.rejects(ax.get('/api/v1/stats'), { status: 401 })
  })

  it('Create and use a User level api key', async () => {
    const res = await global.ax.dmeadus.put('/api/v1/settings/user/dmeadus0', {
      apiKeys: [
        { title: 'key1', scopes: ['stats'] },
        { title: 'key2', scopes: ['datasets'] }
      ]
    })
    assert.equal(res.data.name, 'Danna Meadus')
    const key1 = res.data.apiKeys[0].clearKey
    assert.ok(key1)
    const key2 = res.data.apiKeys[1].clearKey
    assert.ok(key2)

    // Right scope
    const axKey1 = await global.ax.builder(null, null, { headers: { 'x-apiKey': key1 } })
    await axKey1.get('/api/v1/stats')

    // Wrong scope
    const axKey2 = await global.ax.builder(null, null, { headers: { 'x-apiKey': key2 } })
    await assert.rejects(axKey2.get('/api/v1/stats'), { status: 403 })

    // Set the correct owner
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey2)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'user')
    assert.equal(dataset.owner.id, 'dmeadus0')
  })

  it('Create and use an organization level api key', async () => {
    const res = await global.ax.dmeadusOrg.put('/api/v1/settings/organization/KWqAGZ4mG', {
      apiKeys: [
        { title: 'key1', scopes: ['datasets'] }
      ]
    })
    assert.equal(res.data.name, 'Fivechat')
    const key1 = res.data.apiKeys[0].clearKey
    assert.ok(key1)

    // Set the correct owner
    const axKey1 = await global.ax.builder(null, null, { headers: { 'x-apiKey': key1 } })
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey1)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')
  })

  it('Create and use a department level api key', async () => {
    const res = await global.ax.hlalonde3Org.put('/api/v1/settings/organization/KWqAGZ4mG:dep1', {
      apiKeys: [
        { title: 'key1', scopes: ['datasets'] }
      ]
    })
    assert.equal(res.data.name, 'Fivechat - dep1')
    const key1 = res.data.apiKeys[0].clearKey
    assert.ok(key1)

    // Set the correct owner
    const axKey1 = await global.ax.builder(null, null, { headers: { 'x-apiKey': key1 } })
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', axKey1)
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'organization')
    assert.equal(dataset.owner.id, 'KWqAGZ4mG')
    assert.equal(dataset.owner.department, 'dep1')
  })
})
