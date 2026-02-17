import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, alban, sendDataset, config } from './utils/index.ts'

const baseLimit = {
  indexed_bytes: { limit: 300000, consumption: 0 },
  store_bytes: { limit: 300000, consumption: 0 },
  nb_datasets: { limit: 10, consumption: 0 },
  lastUpdate: new Date().toISOString()
}

describe('limits', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Manage a user storage limit', async function () {
    const ax = dmeadus

    await sendDataset('datasets/dataset1.csv', ax)

    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })

    const res2 = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res2.status, 200)
    assert.equal(res2.data.store_bytes.limit, 300000)
  })

  it('A user cannot change limits', async function () {
    const ax = dmeadus
    await assert.rejects(ax.post('/api/v1/limits/user/dmeadus0', baseLimit), { status: 403 })
  })

  it('A user can read his limits', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
  })

  it('A user cannot read the list of limits', async function () {
    const ax = dmeadus
    await assert.rejects(ax.get('/api/v1/limits'), { status: 403 })
  })

  it('A super admin can read the list of limits', async function () {
    const ax = alban
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].id, 'dmeadus0')
    assert.equal(res.data.results[0].type, 'user')
  })
})
