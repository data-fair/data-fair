import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('values aggs', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get values buckets', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset2.csv', ax)
    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id`)
    assert.equal(res.data.total, 6)
    assert.equal(res.data.total_values, 2)
    assert.equal(res.data.total_other, 0)
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].total, 3)
    assert.equal(res.data.aggs[0].results.length, 0)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&missing=none`)
    assert.equal(res.data.aggs.length, 3)
    assert.equal(res.data.aggs[2].total, 1)
    assert.equal(res.data.aggs[2].value, 'none')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&metric_field=employees&metric=sum`)
    assert.equal(res.data.aggs[0].metric, 13)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&extra_metrics=employees:sum,employees:avg`)
    assert.equal(res.data.aggs[0].value, 'koumoul')
    assert.equal(res.data.aggs[0].total, 3)
    assert.equal(res.data.aggs[0].employees_sum, 3)
    assert.equal(res.data.aggs[0].employees_avg, 1)
    assert.equal(res.data.aggs[1].total, 2)
    assert.equal(res.data.aggs[1].employees_sum, 13)
    assert.equal(res.data.aggs[1].employees_avg, 6.5)
  })
})
