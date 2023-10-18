const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

describe('values aggs', () => {
  it('Get values buckets', async () => {
    const datasetData = fs.readFileSync('./test/resources/datasets/dataset2.csv')
    const form = new FormData()
    form.append('file', datasetData, 'dataset.csv')
    const ax = global.ax.dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = res.data
    await workers.hook('finalizer/' + dataset.id)

    // Simple value aggregation
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id`)
    assert.equal(res.data.total, 5) // Number of items
    assert.equal(res.data.total_values, 2) // Number of distinct values (cardinality)
    assert.equal(res.data.total_other, 0) // Number of items not covered by agg results
    assert.equal(res.data.aggs.length, 2)
    assert.equal(res.data.aggs[0].total, 3) // default sorting by count
    assert.equal(res.data.aggs[0].results.length, 0)

    // Value aggregation + metric
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&metric_field=employees&metric=sum`)
    assert.equal(res.data.aggs[0].metric, 13) // default sorting by metric

    // Sorting
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&metric_field=employees&metric=sum&sort=-id`)
    assert.equal(res.data.aggs[0].value, 'koumoul') // default sorting by metric

    // with inner hits as results array
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&size=10&sort=-count;employees`)
    assert.equal(res.data.aggs[0].results.length, 3)
    assert.equal(res.data.aggs[0].results[0].employees, 0)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&size=10&sort=-count;-employees`)
    assert.equal(res.data.aggs[0].results.length, 3)
    assert.equal(res.data.aggs[0].results[0].employees, 3)

    // limit number of groups with agg_size
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id&agg_size=1`)
    assert.equal(res.data.aggs.length, 1)
    assert.equal(res.data.total_other, 2)

    // 2 level aggregation
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id;adr&metric_field=employees&metric=sum&sort=-count;-count`)
    assert.equal(res.data.aggs[0].total, 3)
    assert.equal(res.data.aggs[0].aggs.length, 2)
    assert.equal(res.data.aggs[0].aggs[0].value, 'bureau')
    assert.equal(res.data.aggs[0].aggs[0].total, 2)
    assert.equal(res.data.aggs[0].aggs[0].metric, 0)

    // 2 level aggregation with inner results
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=id;adr&metric_field=employees&metric=sum&sort=-count;-count&size=10`)
    assert.equal(res.data.aggs[0].total, 3)
    assert.equal(res.data.aggs[0].aggs.length, 2)
    assert.equal(res.data.aggs[0].aggs[0].value, 'bureau')
    assert.equal(res.data.aggs[0].aggs[0].total, 2)
    assert.equal(res.data.aggs[0].aggs[0].metric, 0)
    assert.equal(res.data.aggs[0].aggs[0].results.length, 2)

    // data histogram aggregation
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=somedate&interval=month&metric_field=employees&metric=sum`)
    assert.equal(res.data.aggs.length, 3)
    assert.equal(res.data.aggs[0].total, 2)
    assert.equal(res.data.aggs[1].total, 0)
    assert.equal(res.data.aggs[2].total, 3)

    assert.equal(res.data.aggs[0].value, '2017-10-01T00:00:00.000Z')
    assert.equal(res.data.aggs[0].metric, 13)

    // Other values route for simpler list of values
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/id`)
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0], 'bidule')
    assert.equal(res.data[1], 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/id?q=kou*`)
    assert.equal(res.data.length, 1)
    assert.equal(res.data[0], 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/id?q=kou&q_mode=complete`)
    assert.equal(res.data.length, 1)
    assert.equal(res.data[0], 'koumoul')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/somedate`)
    assert.equal(res.data.length, 2)
    assert.equal(res.data[0], '2017-10-10T00:00:00.000Z')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/values/somedate?q=2017-10&q_mode=complete`)
    assert.equal(res.data[0], '2017-10-10T00:00:00.000Z')
  })
})
