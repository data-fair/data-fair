const testUtils = require('./resources/test-utils')

const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Search and apply facets', async t => {
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
