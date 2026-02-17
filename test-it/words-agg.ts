import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('words aggs', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get words buckets', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: [{ key: 'adr', type: 'string', 'x-capabilities': { textAgg: true } }] })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook(`finalize/${dataset.id}`)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/words_agg?field=adr`)
    assert.equal(res.data.total, 2)
    assert.ok(res.data.results.find((r: any) => r.word === 'adresse'))
  })
})
