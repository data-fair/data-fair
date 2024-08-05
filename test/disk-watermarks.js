const testUtils = require('./resources/test-utils')
const assert = require('assert').strict
const fs = require('fs-extra')
const FormData = require('form-data')
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
    const datasetFd2 = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form2 = new FormData()
    form2.append('file', datasetFd2, 'dataset2.csv')
    form2.append('description', 'draft description')
    await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2) })
    await assert.rejects(workers.hook(`finalizer/${dataset.id}`))

    // dataset is in error, but still queryable from previous index
    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.status, 'error')
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
  })
})
