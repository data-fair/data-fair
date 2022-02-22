const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('stats', () => {
  it('Get lines in dataset', async () => {
    const ax = global.ax.dmeadus
    await testUtils.sendDataset('datasets/dataset1.csv', ax)

    const res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    assert.ok(res.data.dynamicStorage > 0)
    assert.ok(res.data.staticStorage > 0)
  })
})
