const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare('search', 5609)

const indexer = require('../server/workers/indexer')

test('Get lines in dataset', async t => {
  const dataset = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('owner[type]', 'user')
  form.append('owner[id]', 'dmeadus0')
  form.append('file', dataset, 'dataset.csv')

  const ax = await testUtils.axios('dmeadus0@answers.com')

  let res = await ax.post('/api/v1/datasets', form, {headers: form.getHeaders()})
  t.is(res.status, 201)
  await indexer.hook()
  res = await ax.get('/api/v1/datasets/dataset/lines')
  t.is(res.data.total, 2)
  res = await ax.get('/api/v1/datasets/dataset/lines?q=koumoul')
  t.is(res.data.total, 1)
})
