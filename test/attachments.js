const fs = require('fs')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const { test, axiosBuilder } = testUtils.prepare(__filename)

const workers = require('../server/workers')

test.serial('Process newly uploaded attachments alone', async t => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/files.zip')
  const form = new FormData()
  form.append('dataset', datasetFd, 'files.zip')
  const ax = await axiosBuilder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  let dataset = res.data
  t.is(res.status, 201)

  // dataset converted
  dataset = await workers.hook(`converter/${dataset.id}`)
  t.is(dataset.status, 'loaded')
  t.is(dataset.file.name, 'files.csv')

  // ES indexation and finalization
  dataset = await workers.hook(`finalizer/${dataset.id}`)
  t.is(dataset.status, 'finalized')

  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
    params: { select: 'file,_file.content', highlight: '_file.content', q: 'test' }
  })
  t.is(res.data.total, 2)
  const odtItem = res.data.results.find(item => item.file === 'test.odt')
  t.truthy(odtItem)
  t.is(odtItem['_file.content'], 'This is a test libreoffice file.')
})

test.serial('Process newly uploaded attachments along with data file', async t => {
  const ax = await axiosBuilder('cdurning2@desdev.cn:passwd')

  // Send dataset with a CSV and attachments in an archive
  const form = new FormData()
  form.append('dataset', fs.readFileSync('./test/resources/dataset-attachments.csv'), 'dataset-attachments.csv')
  form.append('attachments', fs.readFileSync('./test/resources/files.zip'), 'files.zip')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  let dataset = res.data
  t.is(res.status, 201)

  // ES indexation and finalization
  dataset = await workers.hook(`finalizer/${dataset.id}`)
  t.is(dataset.status, 'finalized')

  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  t.is(res.data.total, 3)

  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
    params: { select: 'attachment,_file.content', highlight: '_file.content', q: 'test' }
  })
  t.is(res.data.total, 2)
  const odtItem = res.data.results.find(item => item.attachment === 'test.odt')
  t.truthy(odtItem)
  t.is(odtItem['_file.content'], 'This is a test libreoffice file.')
})
