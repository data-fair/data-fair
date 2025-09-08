import * as testUtils from './resources/test-utils.js'
import { strict as assert } from 'node:assert'
import * as workers from '../api/src/workers/index.ts'

describe('Elasticsearch disk watermarks', function () {
  afterEach(function () {
    process.env.READ_ONLY_ES_INDEX = 'false'
  })

  it('Manage read only index error', async function () {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    // upload a new file but the index won't be writable (simulates a lock from flood watermark errors)
    await workers.workers.batchProcessor.run({ key: 'READ_ONLY_ES_INDEX', value: 'true' }, { name: 'setEnv' })
    await global.ax.superadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    await assert.rejects(workers.hook(`finalize/${dataset.id}`))

    // 1 auto-retry
    await assert.rejects(workers.hook(`finalize/${dataset.id}`))

    // dataset is in error, but still queryable from previous index
    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)

    await workers.workers.batchProcessor.run({ key: 'READ_ONLY_ES_INDEX' }, { name: 'setEnv' })
  })
})
