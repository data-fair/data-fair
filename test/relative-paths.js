const assert = require('assert').strict
const fs = require('fs-extra')
const FormData = require('form-data')
const workers = require('../server/workers')
const testUtils = require('./resources/test-utils')

describe('safe relative paths management', () => {
  it('relative path in dataset file name', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1.csv'), '../dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook('datasetStateManager/' + res.data.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
  })

  it('relative path in dataset id', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('id', '../dataset1')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) }), err => err.status === 400)

    const form2 = new FormData()
    form2.append('file', fs.readFileSync('./test/resources/datasets/dataset1.csv'), 'dataset1.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + encodeURIComponent('../dataset1'), form2, { headers: testUtils.formHeaders(form2) }), err => err.status === 404)
  })

  it('relative path in attachment name', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    const dataset = await workers.hook('datasetStateManager/' + res.data.id)
    const attachmentRes = await ax.get(`/api/v1/datasets/${dataset.id}/attachments/test.odt`)
    assert.equal(attachmentRes.status, 200)
    const attachmentHackRes1 = await ax.get(`/api/v1/datasets/${dataset.id}/attachments//test.odt`)
    assert.equal(attachmentHackRes1.headers['content-length'], attachmentRes.headers['content-length'])
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/~/test.odt`), err => err.status === 404)
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/${encodeURIComponent('../files.zip')}`), err => err.status === 404)
  })

  // TODO: in attachment name read and write
  // TODO: same for metadata attachments
})
