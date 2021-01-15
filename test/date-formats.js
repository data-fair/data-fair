const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('Date formats', () => {
  it('Detect and parse usual french date formats', async function() {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/date-formats.csv', ax)
    assert.equal(dataset.schema.filter(f => !f['x-calculated']).length, 4)
    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    assert.equal(res.data.total, 3)
    assert.equal(res.data.results[0].date, '2021-01-13')
    assert.equal(res.data.results[0].datefr, '2021-01-13')
    assert.equal(res.data.results[0].datetime, '2021-01-13T19:42:02.790Z')
    assert.equal(res.data.results[0].datetimefr, '2021-01-13T18:42:00.000Z')

    assert.equal(res.data.results[2].date, '2021-01-15')
    assert.equal(res.data.results[2].datefr, '2021-01-15')
    assert.equal(res.data.results[2].datetime, '2021-01-15T19:42:02.790Z')
    assert.equal(res.data.results[2].datetimefr, '2021-01-15T18:42:00.000Z')
  })
})
