import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'

describe.only('compatibility layer for ods api', function () {
  it('simple use of records api', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get(`/api/v1/compat-ods/v2.1/catalog/datasets/${dataset.id}/records`)
    assert.equal(res.status, 200)
    assert.equal(res.data.results.length, 2)
    assert.equal(res.data.total_count, 2)
  })
})
