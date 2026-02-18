import { strict as assert } from 'node:assert'

import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, formHeaders } from './utils/index.ts'
import fs from 'node:fs'
import * as workers from '../api/src/workers/index.ts'
import FormData from 'form-data'

const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')

describe('Attachments', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Process newly uploaded attachments alone', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)
    assert.equal(dataset.status, 'created')

    // dataset converted
    dataset = await workers.hook(`normalizeFile/${dataset.id}`)
    assert.equal(dataset.status, 'normalized')
    assert.equal(dataset.file.name, 'files.csv')

    // ES indexation and finalization
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.status, 'finalized')

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, {
      params: { highlight: '_file.content', q: 'test' }
    })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find(item => item.file === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
    res = await ax.get(res.data.results[0]._attachment_url)
    assert.equal(res.status, 200)
  })

  it('Process newly uploaded attachments along with data file', async function () {
    const ax = cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = res.data
    assert.equal(res.status, 201)

    // ES indexation and finalization
    dataset = await workers.hook(`finalize/${dataset.id}`)
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

  it('Keep attachments when updating data', async function () {
    const ax = cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.equal(dataset.storage.attachments.size, attachmentsSize)

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')
  })

  it('Update attachments with data', async function () {
    const ax = cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments2.csv'), 'attachments2.csv')
    form2.append('attachments', fs.readFileSync('./test-it/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.storage.attachments.size < attachmentsSize, 'storage size should be reduced, we replace attachments with a smaller archive')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Update attachments only then data only', async function () {
    const ax = cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })).data
    dataset = await workers.hook(`finalize/${dataset.id}`)
    const attachmentsSize = dataset.storage.attachments.size

    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync('./test-it/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: formHeaders(form2) })
    await assert.rejects(
      workers.hook(`finalize/${dataset.id}`),
      (err: any) => {
        assert.ok(err.message.includes('Valeurs invalides : dir1/test.pdf'))
        return true
      }
    )

    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form3, { headers: formHeaders(form3) })
    dataset = await workers.hook(`finalize/${dataset.id}`)
    assert.ok(dataset.storage.attachments.size < attachmentsSize, 'storage size should be reduced, we replace attachments with a smaller archive')

    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  it('Detect wrong attachment path', async function () {
    const ax = cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments-wrong-paths.csv'), 'attachments-wrong-paths.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    await assert.rejects(workers.hook(`finalize/${dataset.id}`), (err: any) => {
      assert.ok(err.message.includes('une colonne semble contenir des chemins'))
      assert.ok(err.message.includes('Valeurs invalides : BADFILE.txt'))
      return true
    })
  })

  it('Detect missing attachment paths', async function () {
    const ax = cdurning2

    // Send dataset with a CSV and attachments in an archive
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments-no-paths.csv'), 'attachments-no-paths.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = res.data
    assert.equal(res.status, 201)

    await assert.rejects(
      workers.hook(`finalize/${dataset.id}`),
      (err: any) => {
        assert.ok(err.message.includes('aucune colonne ne contient les chemins'))
        assert.ok(err.message.includes('Valeurs attendues :'))
        assert.ok(err.message.includes('test.odt'))
        assert.ok(err.message.includes('dir1/test.pdf'))
        return true
      }
    )
  })

  const sendMetadataAttachment = async (ax, datasetId, attachmentName) => {
    const attachmentForm = new FormData()
    attachmentForm.append('attachment', fs.readFileSync('./test-it/resources/' + attachmentName), attachmentName)
    await ax.post(`/api/v1/datasets/${datasetId}/metadata-attachments`, attachmentForm, { headers: formHeaders(attachmentForm) })
    await ax.patch('/api/v1/datasets/' + datasetId, { attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })
  }

  it('Upload a simple metadata attachment', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/attachments1', { isRest: true, title: 'attachments1' })

    await sendMetadataAttachment(ax, 'attachments1', 'avatar.jpeg')

    const downloadAttachmentRes = await ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg')
    assert.equal(downloadAttachmentRes.headers['x-operation'], '{"class":"read","id":"downloadMetadataAttachment","track":"readDataFiles"}')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/jpeg')
    assert.ok(downloadAttachmentRes.headers['last-modified'])
    await assert.rejects(ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg', { headers: { 'If-Modified-Since': downloadAttachmentRes.headers['last-modified'] } }), { status: 304 })
  })

  it('Create a metadata attachment with a private target URL', async function () {
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

  it('Metadata attachment supports Range query (used for PMTILES support)', async function () {
    const ax = dmeadus
    await ax.put('/api/v1/datasets/attachments1', { isMetaOnly: true, title: 'attachments1' })

    await sendMetadataAttachment(ax, 'attachments1', 'avatar.jpeg')

    const res = await ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg')
    assert.equal(res.headers['content-length'], '9755')
    assert.equal(res.headers['content-type'], 'image/jpeg')

    const resRange = await ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg', {
      headers: { range: 'bytes=100-200', 'x-test': 'HELLO' }
    })
    assert.equal(resRange.status, 206)
    assert.equal(resRange.headers['content-range'], 'bytes 100-200/9755')
    assert.equal(resRange.headers['content-type'], 'application/octet-stream')
    assert.equal(resRange.headers['content-length'], '101')
    assert.equal(resRange.data.length, 101)
  })
})
