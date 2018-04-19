const fs = require('fs')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

const workers = require('../server/workers')
const esUtils = require('../server/utils/es')

test.serial('Process newly uploaded CSV dataset', async t => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('file', datasetFd, 'dataset.csv')
  const ax = await testUtils.axios('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
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
  const esIndices = await test.app.get('es').indices.get({index: esUtils.indexName(dataset)})
  const esIndex = Object.values(esIndices)[0]
  const mapping = esIndex.mappings.line
  t.is(mapping.properties.id.type, 'keyword')
  t.is(mapping.properties.adr.type, 'text')
  t.is(mapping.properties.some_date.type, 'date')

  // Update schema to specify geo point
  const locProp = dataset.schema.find(p => p.key === 'loc')
  locProp['x-refersTo'] = 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long'
  res = await ax.patch('/api/v1/datasets/' + dataset.id, {schema: dataset.schema})
  t.is(res.status, 200)

  // Second ES indexation
  dataset = await workers.hook('finalizer')
  t.is(dataset.status, 'finalized')
  t.is(dataset.count, 2)
  const esIndices2 = await test.app.get('es').indices.get({index: esUtils.indexName(dataset)})
  const esIndex2 = Object.values(esIndices2)[0]
  const mapping2 = esIndex2.mappings.line
  t.is(mapping2.properties.id.type, 'keyword')
  t.is(mapping2.properties.adr.type, 'text')
  t.is(mapping2.properties.some_date.type, 'date')
  t.is(mapping2.properties.loc.type, 'keyword')
  t.is(mapping2.properties._geopoint.type, 'geo_point')

  // Reupload data with bad localization
  const datasetFd2 = fs.readFileSync('./test/resources/dataset-bad-format.csv')
  const form2 = new FormData()
  form2.append('file', datasetFd2, 'dataset.csv')
  res = await ax.post('/api/v1/datasets/' + dataset.id, form2, {headers: testUtils.formHeaders(form2)})
  try {
    await workers.hook('finalizer')
    t.fail()
  } catch (err) {
    t.is(err.dataset.status, 'error')
    t.true(err.message.indexOf('illegal latitude value') !== -1)
  }
})

test.serial('Process newly uploaded geojson dataset', async t => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/geojson-example.geojson')
  const form = new FormData()
  form.append('file', datasetFd, 'geojson-example.geojson')
  const ax = await testUtils.axios('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
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
