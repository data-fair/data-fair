const testUtils = require('./resources/test-utils')
const assert = require('assert').strict
const workers = require('../server/workers')

describe('Elasticsearch disk watermarks', () => {
  afterEach(() => {
    process.env.READ_ONLY_ES_INDEX = 'false'
  })
  it('Manage read only index error', async () => {
    const ax = global.ax.dmeadus
    let dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    // upload a new file but the index won't be writable (simulates a lock from flood watermark errors)
    process.env.READ_ONLY_ES_INDEX = 'true'
    await global.ax.superadmin.post(`/api/v1/datasets/${dataset.id}/_reindex`)
    await assert.rejects(workers.hook(`finalizer/${dataset.id}`))

    // dataset is in error, but still queryable from previous index
    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
  })
})
