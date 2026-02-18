import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'

const sendAttachment = async (ax: any, datasetId: string, attachmentName: string) => {
  const attachmentForm = new FormData()
  attachmentForm.append('attachment', fs.readFileSync('./test-it/resources/' + attachmentName), attachmentName)
  await ax.post(`/api/v1/datasets/${datasetId}/metadata-attachments`, attachmentForm, { headers: formHeaders(attachmentForm) })
  await ax.patch('/api/v1/datasets/' + datasetId, { attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })
}

describe('Datasets with metadata attachments', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Upload a simple attachment', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/attachments1', { isRest: true, title: 'attachments1' })

    await sendAttachment(ax, 'attachments1', 'avatar.jpeg')

    const downloadAttachmentRes = await ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg')
    assert.equal(downloadAttachmentRes.headers['x-operation'], '{"class":"read","id":"downloadMetadataAttachment","track":"readDataFiles"}')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/jpeg')
    assert.ok(downloadAttachmentRes.headers['last-modified'])
    await assert.rejects(ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg', { headers: { 'If-Modified-Since': downloadAttachmentRes.headers['last-modified'] } }), { status: 304 })
  })

  it('Create an attachment with a private target URL', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/attachments2', { isRest: true, title: 'attachments2' })

    const patchRes = await ax.patch('/api/v1/datasets/attachments2', { attachments: [{ type: 'remoteFile', name: 'logo-square.png', title: 'Avatar', targetUrl: 'https://koumoul.com/static/logo-square.png' }] })
    assert.equal(patchRes.data.attachments[0].mimetype, 'image/png')
    assert.ok(!patchRes.data.attachments[0].targetUrl)

    const downloadAttachmentRes = await ax.get('/api/v1/datasets/attachments2/metadata-attachments/logo-square.png')
    assert.equal(downloadAttachmentRes.headers['x-operation'], '{"class":"read","id":"downloadMetadataAttachment","track":"readDataAPI"}')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/png')
    assert.ok(downloadAttachmentRes.headers['content-length'] > 1000)
  })
})
