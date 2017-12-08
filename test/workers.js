const fs = require('fs')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')
const [test] = testUtils.prepare('workers', 5608)

const analyzer = require('../server/workers/analyzer')
const schematizer = require('../server/workers/schematizer')
const indexer = require('../server/workers/indexer')
const esUtils = require('../server/utils/es')

test('Process newly uploaded dataset', async t => {
  const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('owner[type]', 'user')
  form.append('owner[id]', 'dmeadus0')
  form.append('file', datasetFd, 'dataset.csv')

  const ax = await testUtils.axios('dmeadus0@answers.com')
  const res = await ax.post('/api/v1/datasets', form, {headers: form.getHeaders()})
  t.is(res.status, 201)
  let dataset = await analyzer.hook()
  t.is(dataset.status, 'analyzed')

  dataset = await schematizer.hook()
  t.is(dataset.status, 'schematized')
  const idField = dataset.schema.find(f => f.key === 'id')
  const dateField = dataset.schema.find(f => f.key === 'some_date')
  t.is(idField.type, 'string')
  t.is(idField.format, 'uri-reference')
  t.is(dateField.type, 'string')
  t.is(dateField.format, 'date')

  dataset = await indexer.hook()
  t.is(dataset.status, 'indexed')
  t.is(dataset.count, 2)
  const esIndices = await esUtils.client.indices.get({index: esUtils.indexName(dataset)})
  const esIndex = Object.values(esIndices)[0]
  const mapping = esIndex.mappings.line
  t.is(mapping.properties.id.type, 'keyword')
  t.is(mapping.properties.adr.type, 'text')
  t.is(mapping.properties.some_date.type, 'date')
})
