import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset, formHeaders } from './utils/index.ts'
import fs from 'fs-extra'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'

describe('safe relative paths management', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('relative path in dataset file name', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), '../dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
  })

  it('relative path in dataset id', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('id', '../dataset1')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 400)

    const form2 = new FormData()
    form2.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), 'dataset1.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + encodeURIComponent('../dataset1'), form2, { headers: formHeaders(form2) }), (err: any) => err.status === 404)
  })

  it('relative path in attachment name', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = await workers.hook('finalize/' + res.data.id)
    const attachmentRes = await ax.get(`/api/v1/datasets/${dataset.id}/attachments/test.odt`)
    assert.equal(attachmentRes.status, 200)
    const attachmentHackRes1 = await ax.get(`/api/v1/datasets/${dataset.id}/attachments//test.odt`)
    assert.equal(attachmentHackRes1.headers['content-length'], attachmentRes.headers['content-length'])
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/~/test.odt`), (err: any) => err.status === 404)
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/${encodeURIComponent('../files.zip')}`), (err: any) => err.status === 404)
  })

  // TODO: in attachment name read and write
  // TODO: same for metadata attachments
})
