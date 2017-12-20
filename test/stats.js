const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const [test] = testUtils.prepare(__filename)

test('Get lines in dataset', async t => {
  const ax = await testUtils.axios('dmeadus0@answers.com')
  const datasetData = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('owner[type]', 'user')
  form.append('owner[id]', 'dmeadus0')
  form.append('file', datasetData, 'dataset.csv')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 201)

  res = await ax.get('/api/v1/stats')
  t.is(res.status, 200)
  t.true(res.data.storage.dmeadus0 > 0)
  t.true(res.data.storage.KWqAGZ4mG === 0)
  t.true(res.data.storage['3sSi7xDIK'] === 0)
})
