const fs = require('fs')
const nock = require('nock')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const { test, axiosBuilder } = testUtils.prepare(__filename)

const workers = require('../server/workers')
const esUtils = require('../server/utils/es')

// Prepare mock for outgoing HTTP requests
nock('http://test-catalog.com').persist()
  .post('/api/1/datasets/').reply(201, { slug: 'my-dataset', page: 'http://test-catalog.com/datasets/my-dataset' })

test.serial('Process newly uploaded CSV dataset', async t => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset.csv')
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)

  // Dataset received and parsed
  let dataset = await workers.hook('csvAnalyzer')
  t.is(dataset.status, 'analyzed')

  // Auto schema proposal
  dataset = await workers.hook('csvSchematizer')
  t.is(dataset.status, 'schematized')
  const idField = dataset.schema.find(f => f.key === 'id')
  const dateField = dataset.schema.find(f => f.key === 'some_date')
  t.is(idField.type, 'string')
  t.is(idField.format, 'uri-reference')
  t.is(dateField.type, 'string')
  t.is(dateField.format, 'date')

  // ES indexation and finalization
  dataset = await workers.hook('finalizer')
  t.is(dataset.status, 'finalized')
  t.is(dataset.count, 2)
  const idProp = dataset.schema.find(p => p.key === 'id')
  t.is(idProp['x-cardinality'], 2)
  t.not(idProp.enum.indexOf('koumoul'), -1)
  const esIndices = await test.app.get('es').indices.get({ index: esUtils.indexName(dataset) })
  const esIndex = Object.values(esIndices)[0]
  const mapping = esIndex.mappings.line
  t.is(mapping.properties.id.type, 'keyword')
  t.is(mapping.properties.adr.type, 'keyword')
  t.is(mapping.properties.adr.fields.text.type, 'text')
  t.is(mapping.properties.some_date.type, 'date')

  // Update schema to specify geo point
  const locProp = dataset.schema.find(p => p.key === 'loc')
  locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
  res = await ax.patch('/api/v1/datasets/' + dataset.id, { schema: dataset.schema })
  t.is(res.status, 200)

  // Second ES indexation
  dataset = await workers.hook('finalizer')
  t.is(dataset.status, 'finalized')
  t.is(dataset.count, 2)
  const esIndices2 = await test.app.get('es').indices.get({ index: esUtils.indexName(dataset) })
  const esIndex2 = Object.values(esIndices2)[0]
  const mapping2 = esIndex2.mappings.line
  t.is(mapping2.properties.id.type, 'keyword')
  t.is(mapping2.properties.adr.type, 'keyword')
  t.is(mapping2.properties.some_date.type, 'date')
  t.is(mapping2.properties.loc.type, 'keyword')
  t.is(mapping2.properties._geopoint.type, 'geo_point')

  // Reupload data with bad localization
  const datasetFd2 = fs.readFileSync('./test/resources/dataset-bad-format.csv')
  const form2 = new FormData()
  form2.append('file', datasetFd2, 'dataset.csv')
  res = await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: testUtils.formHeaders(form2) })
  try {
    await workers.hook('finalizer')
    t.fail()
  } catch (err) {
    t.is(err.resource.status, 'error')
    t.true(err.message.indexOf('illegal latitude value') !== -1)
  }
})

test.serial('Publish a dataset after finalization', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')

  // Prepare a catalog
  const catalog = (await ax.post('/api/v1/catalogs', { url: 'http://test-catalog.com', title: 'Test catalog', apiKey: 'apiKey', type: 'udata' })).data

  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)
  let dataset = await workers.hook('finalizer')
  t.is(dataset.status, 'finalized')

  // Update dataset to ask for a publication
  res = await ax.patch('/api/v1/datasets/' + dataset.id, { publications: [{ catalog: catalog.id, status: 'waiting' }] })
  t.is(res.status, 200)

  // Go through the publisher worker
  dataset = await workers.hook('datasetPublisher')
  t.is(dataset.status, 'finalized')
  t.is(dataset.publications[0].status, 'published')
  t.is(dataset.publications[0].targetUrl, 'http://test-catalog.com/datasets/my-dataset')
})

test.serial('Process newly uploaded geojson dataset', async t => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/geojson-example.geojson')
  const form = new FormData()
  form.append('file', datasetFd, 'geojson-example.geojson')
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)

  // Dataset received and parsed
  let dataset = await workers.hook('geojsonAnalyzer')
  t.is(dataset.status, 'schematized')
  t.is(dataset.schema.length, 5)
  const idField = dataset.schema.find(field => field.key === 'id')
  t.is(idField.type, 'string')
  t.is(idField.format, 'uri-reference')
  const descField = dataset.schema.find(field => field.key === 'desc')
  t.is(descField.type, 'string')
  t.falsy(descField.format)
  const boolField = dataset.schema.find(field => field.key === 'bool')
  t.is(boolField.type, 'boolean')

  // ES indexation and finalization
  dataset = await workers.hook('finalizer')
  t.is(dataset.status, 'finalized')
})

test.only('Log error for geojson with broken feature', async t => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/geojson-broken.geojson')
  const form = new FormData()
  form.append('file', datasetFd, 'geojson-example.geojson')
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  t.is(res.status, 201)

  // ES indexation and finalization
  let dataset = await workers.hook('finalizer')
  t.is(dataset.status, 'finalized')

  // Check that there is an error message in the journal
  res = await ax.get('/api/v1/datasets/' + dataset.id + '/journal')
  t.is(res.status, 200)
  t.is(res.data.length, 8)
  t.is(res.data[1].type, 'error')
  t.is(res.data[1].data.slice(0, 36), 'Élément 1 du jeu de données - failed')
})
