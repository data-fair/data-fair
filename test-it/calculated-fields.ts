import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('Calculated fields', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Should add special calculated fields', async function () {
    const ax = dmeadus

    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.ok(dataset.schema.find((f: any) => f.key === '_id' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find((f: any) => f.key === '_i' && f['x-calculated'] === true))
    assert.ok(dataset.schema.find((f: any) => f.key === '_rand' && f['x-calculated'] === true))

    const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: '_id,_i,_rand,id' } })
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results[0]._i, 1)
    assert.equal(res.data.results[1]._i, 2)
    assert.ok(res.data.results[0]._rand)
    assert.ok(res.data.results[0]._id)
  })

  it('Should split by separator if specified', async function () {
    const ax = dmeadus

    const dataset = await sendDataset('datasets/split.csv', ax)
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords.text:opendata' } })
    assert.equal(res.data.total, 1)

    const keywordsProp = dataset.schema.find((p: any) => p.key === 'keywords')
    keywordsProp.separator = ' ; '
    await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
    const workers = await import('../api/src/workers/index.ts')
    await workers.hook('finalize/' + dataset.id)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].keywords, 'informatique ; opendata ; sas')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata', arrays: true } })
    assert.equal(res.data.total, 1)
    assert.deepEqual(res.data.results[0].keywords, ['informatique', 'opendata', 'sas'])

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=keywords`)
    assert.equal(res.data.aggs.find((agg: any) => agg.value === 'opendata').total, 1)
  })
})
