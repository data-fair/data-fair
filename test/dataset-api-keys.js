const assert = require('node:assert').strict
const testUtils = require('./resources/test-utils')

describe('Dataset API keys', () => {
  it('Use an api key defined on the dataset', async () => {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const apiKeys = (await ax.put(`/api/v1/datasets/${dataset.id}/api-keys`, [{ title: 'key1', permissions: { classes: ['read'] } }])).data
    assert.equal(apiKeys.length, 1)
    assert.ok(apiKeys[0].clearKey)
    assert.ok(!apiKeys[0].key)
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 403 })
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': 'wrong' } }), { status: 401 })
    await assert.rejects(global.ax.anonymous.patch(`/api/v1/datasets/${dataset.id}`, { title: 'Title' }), { status: 403 })
    const res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': apiKeys[0].clearKey } })
    assert.ok(res.status === 200)

    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.ok(!dataset.apiKeys)
    const readApiKeys = (await ax.get(`/api/v1/datasets/${dataset.id}/api-keys`)).data
    assert.equal(apiKeys.length, 1)
    assert.ok(!readApiKeys[0].clearKey)
    assert.ok(!readApiKeys[0].key)
  })

  it('Use a clear text api key defined on the dataset', async () => {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    await ax.put(`/api/v1/datasets/${dataset.id}/api-keys`, [{ title: 'key1', permissions: { classes: ['read'] }, storeClearKey: true }])
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.ok(!dataset.apiKeys)
    const apiKeys = (await ax.get(`/api/v1/datasets/${dataset.id}/api-keys`)).data
    assert.equal(apiKeys.length, 1)
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 403 })
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': 'wrong' } }), { status: 401 })
    await assert.rejects(global.ax.anonymous.patch(`/api/v1/datasets/${dataset.id}`, { title: 'Title' }), { status: 403 })
    const res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': apiKeys[0].clearKey } })
    assert.ok(res.status === 200)
  })
})
