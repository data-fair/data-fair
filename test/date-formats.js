const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('Date formats', () => {
  it('Detect and parse usual french date formats', async function() {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.schema.filter(f => !f['x-calculated']).length, 4)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 2)
    console.log(res.data.results)
  })
})
