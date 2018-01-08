const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

const workers = require('../server/workers')

test('Get lines in dataset', async t => {
  const datasetData = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('file', datasetData, 'dataset.csv')
  const ax = await testUtils.axios('dmeadus0@answers.com')

  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})

  t.is(res.status, 201)
  const dataset = await workers.hook('indexer')
  // Update schema to specify geo point
  const locProp = dataset.schema.find(p => p.key === 'loc')
  locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
  res = await ax.patch('/api/v1/datasets/' + dataset.id, {schema: dataset.schema})
  t.is(res.status, 200)
  await workers.hook('indexer')
  res = await ax.get('/api/v1/datasets/dataset/lines')
  t.is(res.data.total, 2)
  res = await ax.get('/api/v1/datasets/dataset/lines?q=koumoul')
  t.is(res.data.total, 1)
  res = await ax.get('/api/v1/datasets/dataset/lines?bbox=2.5,40,3,47')
  t.is(res.data.total, 1)
  res = await ax.get('/api/v1/datasets/dataset/geo_agg?bbox=-5.1406,41.33374,9.55932,51.089062')
  t.is(res.status, 200)
  t.is(res.data.aggs.length, 1)
  res = await ax.get('/api/v1/datasets/dataset/geo_agg?bbox=2.5,45,3,48')
  t.is(res.status, 200)
  t.is(res.data.aggs.length, 2)
})
