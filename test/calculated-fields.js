const testUtils = require('./resources/test-utils')

const { test, axiosBuilder } = testUtils.prepare(__filename)

const workers = require('../server/workers')

test.serial('Should add special calculated fields', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')

  // 1 dataset in user zone
  const dataset = await testUtils.sendDataset('dataset1.csv', ax)
  t.truthy(dataset.schema.find(f => f.key === '_id' && f['x-calculated'] === true))
  t.truthy(dataset.schema.find(f => f.key === '_i' && f['x-calculated'] === true))
  t.truthy(dataset.schema.find(f => f.key === '_rand' && f['x-calculated'] === true))

  const res = await ax.get('/api/v1/datasets/dataset1/lines', { params: { select: '_id,_i,_rand,id' } })
  t.is(res.data.total, 2)
  t.is(res.data.results[0]._i, 1)
  t.is(res.data.results[1]._i, 2)
  t.truthy(res.data.results[0]._rand)
  t.truthy(res.data.results[0]._id)
})

test.serial('Should split by separator if specified', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')

  // 1 dataset in user zone
  const dataset = await testUtils.sendDataset('dataset-split.csv', ax)
  // keywords columns is not splitted, so only searchable through full text subfield
  let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
  t.is(res.data.total, 0)
  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords.text:opendata' } })
  t.is(res.data.total, 1)

  // Update schema to specify separator for keywords col
  const keywordsProp = dataset.schema.find(p => p.key === 'keywords')
  keywordsProp.separator = ' ; '
  await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
  await workers.hook('finalizer')
  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'keywords', qs: 'keywords:opendata' } })
  t.is(res.data.total, 1)
  // result is rejoined
  t.is(res.data.results[0].keywords, 'informatique ; opendata ; sas')
  // agregations work with the splitted values
  res = await ax.get(`/api/v1/datasets/${dataset.id}/values_agg?field=keywords`)
  t.is(res.data.aggs.find(agg => agg.value === 'opendata').total, 1)
})
