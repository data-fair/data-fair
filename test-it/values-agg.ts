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

  it('Get values buckets based on number values', async function () {
    const ax = dmeadus
    const workers = await import('../api/src/workers/index.ts')
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest values aggs',
      schema: [{ key: 'year', type: 'number' }, { key: 'nb', type: 'number' }]
    })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
      { year: 2020, nb: 2 },
      { year: 2020, nb: 4 },
      { year: 2021, nb: 2 },
      { nb: 2 },
      { nb: 3 }
    ])
    await workers.hook(`finalize/${dataset.id}`)

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=year&metric_field=nb&metric=sum`)
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].value, 2020)
    assert.equal(res.data.aggs[0].metric, 6)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=year&metric_field=nb&metric=sum&missing=-1`)
    assert.equal(res.data.aggs.length, 3)
    assert.equal(res.data.aggs[0].value, 2020)
    assert.equal(res.data.aggs[0].metric, 6)
    assert.equal(res.data.aggs[1].value, -1)
    assert.equal(res.data.aggs[1].metric, 5)

    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=year&metric_field=nb&metric=sum&missing=none`), { status: 400 })
  })

  it('Get values buckets based on boolean values', async function () {
    const ax = dmeadus
    const workers = await import('../api/src/workers/index.ts')
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest values aggs',
      schema: [{ key: 'active', type: 'boolean' }, { key: 'nb', type: 'number' }]
    })).data
    await ax.post(`/api/v1/datasets/${dataset.id}/_bulk_lines`, [
      { active: true, nb: 2 },
      { active: true, nb: 4 },
      { active: false, nb: 2 },
      { nb: 2 },
      { nb: 3 }
    ])
    await workers.hook(`finalize/${dataset.id}`)

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=active&metric_field=nb&metric=sum`)
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].value, 'true')
    assert.equal(res.data.aggs[0].metric, 6)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=active&metric_field=nb&metric=sum&missing=false`)
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].value, 'false')
    assert.equal(res.data.aggs[0].metric, 7)
    assert.equal(res.data.aggs[1].value, 'true')
    assert.equal(res.data.aggs[1].metric, 6)

    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=active&metric_field=nb&metric=sum&missing=none`), { status: 400 })
  })
})
