// Some edge cases with CSV files
const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

it('Process newly uploaded CSV dataset', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('2018-08-30_Type_qualificatif.csv', ax)
  assert.equal(dataset.status, 'finalized')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  assert.equal(res.data.total, 3)
})

it('A CSV with weird keys', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('weird-keys.csv', ax)
  assert.equal(dataset.status, 'finalized')
  assert.equal(dataset.schema[0].key, 'This_key_has_escaped_quotes_in_it')
  assert.equal(dataset.schema[0]['x-originalName'], 'This key has "escaped quotes" in it')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  assert.equal(res.data.total, 1)
})

it('A CSV with splitting errors', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  const dataset = await testUtils.sendDataset('dataset-split-fail.csv', ax)
  assert.equal(dataset.status, 'finalized')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  assert.equal(res.data.total, 20)
})
