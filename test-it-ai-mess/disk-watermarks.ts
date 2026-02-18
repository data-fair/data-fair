import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, superadmin, sendDataset } from './utils/index.ts'

describe('Elasticsearch disk watermarks', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  afterEach(function () {
    process.env.READ_ONLY_ES_INDEX = 'false'
  })

  it('Manage read only index error', async function () {
    const ax = dmeadus
    let dataset = await sendDataset('datasets/dataset1.csv', ax)

    const workers = await import('../api/src/workers/index.ts')
    await workers.workers.batchProcessor.run({ key: 'READ_ONLY_ES_INDEX', value: 'true' }, { name: 'setEnv' })
    await superadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    await assert.rejects(workers.hook(`finalize/${dataset.id}`))

    await assert.rejects(workers.hook(`finalize/${dataset.id}`))

    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)

    await workers.workers.batchProcessor.run({ key: 'READ_ONLY_ES_INDEX' }, { name: 'setEnv' })
  })
})
