const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')



const workers = require('../server/workers')

it('Get lines in dataset', async () => {
  const datasetData = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('file', datasetData, 'dataset.csv')
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')

  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })

  assert.equal(res.status, 201)
  const dataset = await workers.hook('finalizer')
  // Update schema to specify geo point
  const locProp = dataset.schema.find(p => p.key === 'loc')
  locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
  res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
  assert.equal(res.status, 200)
  await workers.hook('finalizer')
  res = await ax.get('/api/v1/datasets/dataset/lines')
  assert.equal(res.data.total, 2)
  // Filter on keyword field
  res = await ax.get('/api/v1/datasets/dataset/lines?q=koumoul')
  assert.equal(res.data.total, 1)
  // Filter on keyword field and child text field
  res = await ax.get('/api/v1/datasets/dataset/lines?q=Koumoul')
  assert.equal(res.data.total, 1)
  // Filter on text field
  res = await ax.get('/api/v1/datasets/dataset/lines?q=lactée')
  // Filter on text field with default french stemming
  res = await ax.get('/api/v1/datasets/dataset/lines?q=lacté')
  assert.equal(res.data.total, 1)
  // filter on exact values with query params suffixed with _in
  res = await ax.get('/api/v1/datasets/dataset/lines?id_in=koumoul')
  assert.equal(res.status, 200)
  assert.equal(res.data.total, 1)
  try {
    res = await ax.get('/api/v1/datasets/dataset/lines?BADFIELD_in=koumoul')
  } catch (err) {
    assert.equal(err.status, 400)
  }
  res = await ax.get('/api/v1/datasets/dataset/lines?bbox=-2.5,40,3,47')
  assert.equal(res.data.total, 1)
  res = await ax.get('/api/v1/datasets/dataset/geo_agg?bbox=-3,47,-2,48')
  assert.equal(res.status, 200)
  assert.equal(res.data.aggs.length, 1)
  res = await ax.get('/api/v1/datasets/dataset/geo_agg?bbox=-3,45,3,48')
  assert.equal(res.status, 200)
  assert.equal(res.data.aggs.length, 2)
  res = await ax.get('/api/v1/datasets/dataset/lines?xyz=63,44,7')
  assert.equal(res.data.total, 1)
  res = await ax.get('/api/v1/datasets/dataset/lines?xyz=63,44,7&format=geojson')
  assert.equal(res.data.total, 1)
  assert.equal(res.data.features.length, 1)
  assert.ok(res.data.features[0].geometry)
  res = await ax.get('/api/v1/datasets/dataset/lines?xyz=63,44,7&format=pbf')
  assert.equal(res.status, 200)
  assert.equal(res.headers['content-type'], 'application/x-protobuf')
  res = await ax.get('/api/v1/datasets/dataset/lines?xyz=3,4,7&format=pbf')
  assert.equal(res.status, 204)
})
