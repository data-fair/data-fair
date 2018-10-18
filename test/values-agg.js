const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const { test, axiosBuilder } = testUtils.prepare(__filename)

const workers = require('../server/workers')

test('Get lines in dataset', async t => {
  const datasetData = fs.readFileSync('./test/resources/dataset2.csv')
  const form = new FormData()
  form.append('file', datasetData, 'dataset.csv')
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  await workers.hook('finalizer')

  // Simple value aggregation
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=id')
  t.is(res.data.total, 5) // Number of items
  t.is(res.data.total_values, 2) // Number of distinct values (cardinality)
  t.is(res.data.total_other, 0) // Number of items not covered by agg results
  t.is(res.data.aggs.length, 2)
  t.is(res.data.aggs[0].total, 3) // default sorting by count
  t.is(res.data.aggs[0].results.length, 0)

  // Value aggregation + metric
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=id&metric_field=employees&metric=sum')
  t.is(res.data.aggs[0].metric, 13) // default sorting by metric

  // Sorting
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=id&metric_field=employees&metric=sum&sort=-id')
  t.is(res.data.aggs[0].value, 'koumoul') // default sorting by metric

  // with inner hits as results array
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=id&size=10&sort=-count;employees')
  t.is(res.data.aggs[0].results.length, 3)
  t.is(res.data.aggs[0].results[0].employees, 0)
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=id&size=10&sort=-count;-employees')
  t.is(res.data.aggs[0].results.length, 3)
  t.is(res.data.aggs[0].results[0].employees, 3)

  // limit number of groups with agg_size
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=id&agg_size=1')
  t.is(res.data.aggs.length, 1)
  t.is(res.data.total_other, 2)

  // 2 level aggregation
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=id;adr&metric_field=employees&metric=sum&sort=-count;-count')
  t.is(res.data.aggs[0].total, 3)
  t.is(res.data.aggs[0].aggs.length, 2)
  t.is(res.data.aggs[0].aggs[0].value, 'bureau')
  t.is(res.data.aggs[0].aggs[0].total, 2)
  t.is(res.data.aggs[0].aggs[0].metric, 0)

  // data histogram aggregation
  res = await ax.get('/api/v1/datasets/dataset/values_agg?field=somedate&interval=month&metric_field=employees&metric=sum')
  t.is(res.data.aggs.length, 3)
  t.is(res.data.aggs[0].total, 2)
  t.is(res.data.aggs[1].total, 0)
  t.is(res.data.aggs[2].total, 3)

  t.is(res.data.aggs[0].value, '2017-10-01T00:00:00.000Z')
  t.is(res.data.aggs[0].metric, 13)
})
