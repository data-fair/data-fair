// Some edge cases with CSV files
const fs = require('fs')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')
const { test, axiosBuilder } = testUtils.prepare(__filename)
const workers = require('../server/workers')

async function sendDataset(fileName, ax) {
  const datasetFd = fs.readFileSync('./test/resources/' + fileName)
  const form = new FormData()
  form.append('file', datasetFd, fileName)
  await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  return workers.hook('finalizer')
}

test.serial('Process newly uploaded CSV dataset', async t => {
  const ax = await axiosBuilder('dmeadus0@answers.com')
  const dataset = await sendDataset('2018-08-30_Type_qualificatif.csv', ax)
  t.is(dataset.status, 'finalized')
  const res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  t.is(res.data.total, 3)
})
