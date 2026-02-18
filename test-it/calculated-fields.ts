import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

import * as workers from '../api/src/workers/index.ts'

describe('Calculated fields', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Should add special calculated fields', async function () {
    const ax = dmeadus

    // 1 dataset in user zone
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.ok(dataset.schema.find(f => f.key === '_id' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find(f => f.key === '_i' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find(f => f.key === '_rand' && f['x-calculated'] === true))

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: '_id,_i,_rand,id' } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0]._i, 1)
    assert.equal(res.data.results[1]._i, 2)
    assert.ok(res.data.results[0]._rand)
    assert.ok(res.data.results[0]._id)
  })

  it('Should split by separator if specified', async function () {
    const ax = dmeadus

    // 1 dataset in user zone
    const dataset = await sendDataset('datasets/split.csv', ax)
    // keywords columns is not splitted, so only searchable through full text subfield
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords.text:opendata' } })
    assert.equal(res.data.total, 1)

    // Update schema to specify separator for keywords col
    const keywordsProp = dataset.schema.find(p => p.key === 'keywords')
    keywordsProp.separator = ' ; '
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    await workers.hook('finalize/' + dataset.id)
    // result is rejoined by default
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].keywords, 'informatique ; opendata ; sas')
    // arrays is preserved if using ?arrays=true
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata', arrays: true } })
    assert.equal(res.data.total, 1)
    assert.deepEqual(res.data.results[0].keywords, ['informatique', 'opendata', 'sas'])

    // agregations work with the splitted values
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=keywords`)
    assert.equal(res.data.aggs.find(agg => agg.value === 'opendata').total, 1)
  })
})
