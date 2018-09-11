const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const {test, axiosBuilder} = testUtils.prepare(__filename)
const workers = require('../server/workers')

test.serial('Process geojson with broken features', async t => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/geojson-broken.geojson')
  const form = new FormData()
  form.append('file', datasetFd, 'geojson-example.geojson')
  const ax = await axiosBuilder('dmeadus0@answers.com')
  let res = await ax.post('/api/v1/datasets', form, {headers: testUtils.formHeaders(form)})
  t.is(res.status, 201)

  // ES indexation and finalization
  let dataset = await workers.hook('finalizer')
  t.is(dataset.status, 'finalized')
})
