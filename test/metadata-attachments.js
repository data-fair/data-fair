const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')
const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

const sendAttachment = async (ax, datasetId, attachmentName) => {
  const attachmentForm = new FormData()
  attachmentForm.append('attachment', fs.readFileSync('./test/resources/' + attachmentName), attachmentName)
  await ax.post(`/api/v1/datasets/${datasetId}/metadata-attachments`, attachmentForm, { headers: testUtils.formHeaders(attachmentForm) })
  await ax.patch('/api/v1/datasets/' + datasetId, { attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })
}

describe('Datasets with metadata attachments', () => {
  it('Upload a simple attachment', async () => {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/attachments1', { isRest: true, title: 'attachments1' })
    await workers.hook('finalizer/attachments1')

    await sendAttachment(ax, 'attachments1', 'avatar.jpeg')

    const downloadAttachmentRes = await ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/jpeg')
    assert.ok(downloadAttachmentRes.headers['last-modified'])
    await assert.rejects(ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg', { headers: { 'If-Modified-Since': downloadAttachmentRes.headers['last-modified'] } }), { status: 304 })
  })

  it('Create an attachment with a private target URL', async () => {
    const ax = global.ax.dmeadus
    await ax.put('/api/v1/datasets/attachments2', { isRest: true, title: 'attachments2' })
    await workers.hook('finalizer/attachments2')

    const patchRes = await ax.patch('/api/v1/datasets/attachments2', { attachments: [{ type: 'remoteFile', name: 'logo-square.png', title: 'Avatar', targetUrl: 'https://koumoul.com/static/logo-square.png' }] })
    assert.equal(patchRes.data.attachments[0].mimetype, 'image/png')
    assert.ok(!patchRes.data.attachments[0].targetUrl)

    const downloadAttachmentRes = await ax.get('/api/v1/datasets/attachments2/metadata-attachments/logo-square.png')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/png')
    assert.ok(downloadAttachmentRes.headers['content-length'] > 1000)
    assert.equal(downloadAttachmentRes.headers['x-remote-status'], 'DOWNLOAD')

    const downloadAttachmentRes2 = await ax.get('/api/v1/datasets/attachments2/metadata-attachments/logo-square.png')
    assert.equal(downloadAttachmentRes2.status, 200)
    assert.equal(downloadAttachmentRes2.headers['content-type'], 'image/png')
    assert.ok(downloadAttachmentRes2.headers['content-length'] > 1000)
    assert.equal(downloadAttachmentRes2.headers['x-remote-status'], 'CACHE')

    await new Promise(resolve => setTimeout(resolve, 1100))
    const downloadAttachmentRes3 = await ax.get('/api/v1/datasets/attachments2/metadata-attachments/logo-square.png')
    assert.equal(downloadAttachmentRes3.status, 200)
    assert.equal(downloadAttachmentRes3.headers['content-type'], 'image/png')
    assert.ok(downloadAttachmentRes3.headers['content-length'] > 1000)
    assert.equal(downloadAttachmentRes3.headers['x-remote-status'], 'NOTMODIFIED')

    await ax.patch('/api/v1/datasets/attachments2', { attachments: [{ type: 'remoteFile', name: 'logo-square.png', title: 'Avatar', targetUrl: 'https://koumoul.com/static/logo-square.png?t=1' }] })
    const downloadAttachmentRes4 = await ax.get('/api/v1/datasets/attachments2/metadata-attachments/logo-square.png')
    assert.equal(downloadAttachmentRes4.status, 200)
    assert.equal(downloadAttachmentRes4.headers['content-type'], 'image/png')
    assert.ok(downloadAttachmentRes4.headers['content-length'] > 1000)
    assert.equal(downloadAttachmentRes4.headers['x-remote-status'], 'DOWNLOAD')
  })
})