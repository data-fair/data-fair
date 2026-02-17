import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('stats', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get simple stats', async function () {
    const ax = dmeadus
    await sendDataset('datasets/dataset1.csv', ax)

    const res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    assert.ok(res.data.limits.store_bytes.limit > 0)
  })
})
