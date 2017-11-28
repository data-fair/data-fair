const fs = require('fs')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')
const [test] = testUtils.prepare('workers', 5608)

const analyzer = require('../server/workers/analyzer')
const schematizer = require('../server/workers/schematizer')
const indexer = require('../server/workers/indexer')

const dataset1 = fs.readFileSync('./test/resources/dataset1.csv')
const form1 = new FormData()
form1.append('owner[type]', 'user')
form1.append('owner[id]', 'dmeadus0')
form1.append('file', dataset1, 'dataset1.csv')

test('Process newly uploaded dataset', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const res = await ax.post('/api/v1/datasets', form1, {headers: form1.getHeaders()})
  t.is(res.status, 201)
  let dataset = await analyzer.hook()
  t.is(dataset.status, 'analyzed')
  dataset = await schematizer.hook()
  t.is(dataset.status, 'schematized')
  t.is(dataset.schema.id.type, 'string')
  dataset = await indexer.hook()
  t.is(dataset.status, 'indexed')
  t.is(dataset.count, 2)
})
