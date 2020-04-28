const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')



it('Get lines in dataset', async () => {
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  const datasetData = fs.readFileSync('./test/resources/dataset1.csv')
  const form = new FormData()
  form.append('file', datasetData, 'dataset.csv')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  assert.equal(res.status, 201)

  res = await ax.get('/api/v1/stats')
  assert.equal(res.status, 200)
  assert.ok(res.data.user.storage > 0)
  assert.ok(res.data.organizations.KWqAGZ4mG.storage === 0)
  assert.ok(res.data.organizations['3sSi7xDIK'].storage === 0)
})
