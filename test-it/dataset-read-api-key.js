import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, anonymous } from './utils/index.ts'
import { strict as assert } from 'node:assert'

describe('Dataset API keys', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Use an api key defined on the dataset', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { readApiKey: { active: true, interval: 'P1W' } })).data
    assert.ok(dataset.readApiKey?.active)
    assert.ok(dataset.readApiKey.expiresAt)
    assert.ok(dataset.readApiKey.renewAt)
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}/read-api-key`), { status: 403 })
    const apiKey = (await ax.get(`/api/v1/datasets/${dataset.id}/read-api-key`)).data

    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 403 })
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': 'wrong' } }), { status: 401 })
    const res = await anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': apiKey.current } })
    assert.ok(res.status === 200)
    await assert.rejects(anonymous.patch(`/api/v1/datasets/${dataset.id}`, { title: 'Title' }, { headers: { 'x-apiKey': apiKey.current } }), { status: 403 })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.ok(!dataset._readApiKey)
  })
})
