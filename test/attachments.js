const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')

const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

it('Process newly uploaded attachments alone', async () => {
  // Send dataset
  const datasetFd = fs.readFileSync('./test/resources/files.zip')
  const form = new FormData()
  form.append('dataset', datasetFd, 'files.zip')
  const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  let dataset = res.data
  assert.equal(res.status, 201)

  // dataset converted
  dataset = await workers.hook(`converter/${dataset.id}`)
  assert.equal(dataset.status, 'loaded')
  assert.equal(dataset.file.name, 'files.csv')

  // ES indexation and finalization
  dataset = await workers.hook(`finalizer/${dataset.id}`)
  assert.equal(dataset.status, 'finalized')

  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
    params: { select: 'file,_file.content', highlight: '_file.content', q: 'test' }
  })
  assert.equal(res.data.total, 2)
  const odtItem = res.data.results.find(item => item.file === 'test.odt')
  assert.ok(odtItem)
  assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
})

it('Process newly uploaded attachments along with data file', async () => {
  const ax = await global.ax.builder('cdurning2@desdev.cn:passwd')

  // Send dataset with a CSV and attachments in an archive
  const form = new FormData()
  form.append('dataset', fs.readFileSync('./test/resources/dataset-attachments.csv'), 'dataset-attachments.csv')
  form.append('attachments', fs.readFileSync('./test/resources/files.zip'), 'files.zip')
  let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
  let dataset = res.data
  assert.equal(res.status, 201)

  // ES indexation and finalization
  dataset = await workers.hook(`finalizer/${dataset.id}`)
  assert.equal(dataset.status, 'finalized')

  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
  assert.equal(res.data.total, 3)

  res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
    params: { select: 'attachment,_file.content', highlight: '_file.content', q: 'test' }
  })
  assert.equal(res.data.total, 2)
  const odtItem = res.data.results.find(item => item.attachment === 'test.odt')
  assert.ok(odtItem)
  assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
})
