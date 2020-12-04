const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('values aggs', () => {
  it('Get words buckets', async () => {
    const ax = global.ax.dmeadus
    await testUtils.sendDataset('datasets/dataset1.csv', ax)

    const res = await ax.get('/api/v1/datasets/dataset1/words_agg?field=adr')
    assert.equal(res.data.total, 2) // Number of items
    assert.ok(res.data.results.find(r => r.word === 'adresse'))
  })
})
