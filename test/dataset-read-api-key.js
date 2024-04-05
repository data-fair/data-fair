const assert = require('node:assert').strict
const testUtils = require('./resources/test-utils')

describe('Dataset API keys', () => {
  it('Use an api key defined on the dataset', async () => {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { readApiKey: { active: true, interval: 'P1W' } })).data
    assert.ok(dataset.readApiKey?.active)
    assert.ok(dataset.readApiKey.expiresAt)
    assert.ok(dataset.readApiKey.renewAt)
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/read-api-key`), { status: 403 })
    const apiKey = (await ax.get(`/api/v1/datasets/${dataset.id}/read-api-key`)).data
    console.log(apiKey)

    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 403 })
    await assert.rejects(global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': 'wrong' } }), { status: 401 })
    const res = await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': apiKey.current } })
    assert.ok(res.status === 200)
    await assert.rejects(global.ax.anonymous.patch(`/api/v1/datasets/${dataset.id}`, { title: 'Title' }, { headers: { 'x-apiKey': apiKey.current } }), { status: 403 })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.ok(!dataset._readApiKey)
  })
})
