import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'
import * as workers from '../api/src/workers/index.js'

describe('words aggs', function () {
  it('Get words buckets', async function () {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    await ax.patch(`/api/v1/datasets/${dataset.id}`, { schema: [{ key: 'adr', type: 'string', 'x-capabilities': { textAgg: true } }] })
    await workers.hook(`finalizer/${dataset.id}`)

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/words_agg?field=adr`)
    assert.equal(res.data.total, 2) // Number of items
    assert.ok(res.data.results.find(r => r.word === 'adresse'))
  })
})
