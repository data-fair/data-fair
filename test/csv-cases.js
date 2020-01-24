// Some edge cases with CSV files
const testUtils = require('./resources/test-utils')
const { test, axiosBuilder } = testUtils.prepare(__filename)

test.serial('Process newly uploaded CSV dataset', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('2018-08-30_Type_qualificatif.csv', ax)
  t.is(dataset.status, 'finalized')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  t.is(res.data.total, 3)
})

test.serial('A CSV with weird keys', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('weird-keys.csv', ax)
  t.is(dataset.status, 'finalized')
  t.is(dataset.schema[0].key, 'This_key_has_escaped_quotes_in_it')
  t.is(dataset.schema[0]['x-originalName'], 'This key has "escaped quotes" in it')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  t.is(res.data.total, 1)
})

test.serial('A CSV with splitting errors', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('dataset-split-fail.csv', ax)
  t.is(dataset.status, 'finalized')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  t.is(res.data.total, 20)
})
