import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, waitForDatasetError } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')

test.describe('Attachments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Process newly uploaded attachments alone', async () => {
    const datasetFd = fs.readFileSync('./tests/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = res.data
    assert.equal(res.status, 201)
    assert.equal(dataset.status, 'created')
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { highlight: '_file.content', q: 'test' } })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find((item: any) => item.file === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
    res = await ax.get(res.data.results[0]._attachment_url)
    assert.equal(res.status, 200)
  })

  test('Process newly uploaded attachments along with data file', async () => {
    const ax = testUser3
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = res.data
    assert.equal(res.status, 201)
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.status, 'finalized')
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 3)
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { select: 'attachment,_file.content', highlight: '_file.content', q: 'test' } })
    assert.equal(res.data.total, 2)
    const odtItem = res.data.results.find((item: any) => item.attachment === 'test.odt')
    assert.ok(odtItem)
    assert.equal(odtItem['_file.content'], 'This is a test libreoffice file.')
  })

  test('Keep attachments when updating data', async () => {
    const ax = testUser3
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    const attachmentsSize = dataset.storage.attachments.size
    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.storage.attachments.size, attachmentsSize)
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is a test libreoffice file.')
  })

  test('Update attachments with data', async () => {
    const ax = testUser3
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    const attachmentsSize = dataset.storage.attachments.size
    const form2 = new FormData()
    form2.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments2.csv'), 'attachments2.csv')
    form2.append('attachments', fs.readFileSync('./tests/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(dataset.storage.attachments.size < attachmentsSize, 'storage size should be reduced')
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  test('Update attachments only then data only', async () => {
    const ax = testUser3
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let dataset = (await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })).data
    dataset = await waitForFinalize(ax, dataset.id)
    const attachmentsSize = dataset.storage.attachments.size
    const form2 = new FormData()
    form2.append('attachments', fs.readFileSync('./tests/resources/datasets/files2.zip'), 'files2.zip')
    await ax.put(`/api/v1/datasets/${dataset.id}`, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    await assert.rejects(
      waitForFinalize(ax, dataset.id),
      (err: any) => {
        assert.ok(err.message.includes('Valeurs invalides : dir1/test.pdf'))
        return true
      }
    )
    const form3 = new FormData()
    form3.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments2.csv'), 'attachments2.csv')
    await ax.put('/api/v1/datasets/' + dataset.id, form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() } })
    dataset = await waitForFinalize(ax, dataset.id)
    assert.ok(dataset.storage.attachments.size < attachmentsSize)
    const lines = (await ax.get(`/api/v1/datasets/${dataset.id}/lines`)).data
    assert.equal(lines.total, 2)
    assert.equal(lines.results[0]['_file.content'], 'This is another test libreoffice file.')
  })

  test('Detect wrong attachment path', async () => {
    const ax = testUser3
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments-wrong-paths.csv'), 'attachments-wrong-paths.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = res.data
    assert.equal(res.status, 201)
    const errorDataset = await waitForDatasetError(ax, dataset.id)
    assert.equal(errorDataset.status, 'error')
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent.data.includes('une colonne semble contenir des chemins'))
    assert.ok(errorEvent.data.includes('Valeurs invalides : BADFILE.txt'))
  })

  test('Detect missing attachment paths', async () => {
    const ax = testUser3
    const form = new FormData()
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments-no-paths.csv'), 'attachments-no-paths.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = res.data
    assert.equal(res.status, 201)
    const errorDataset = await waitForDatasetError(ax, dataset.id)
    assert.equal(errorDataset.status, 'error')
    const journal = (await ax.get(`/api/v1/datasets/${dataset.id}/journal`)).data
    const errorEvent = journal.find((e: any) => e.type === 'error')
    assert.ok(errorEvent.data.includes('aucune colonne ne contient les chemins'))
    assert.ok(errorEvent.data.includes('Valeurs attendues :'))
    assert.ok(errorEvent.data.includes('test.odt'))
    assert.ok(errorEvent.data.includes('dir1/test.pdf'))
  })

  // sendMetadataAttachment helper
  const sendMetadataAttachment = async (ax: any, datasetId: string, attachmentName: string) => {
    const attachmentForm = new FormData()
    attachmentForm.append('attachment', fs.readFileSync('./tests/resources/' + attachmentName), attachmentName)
    await ax.post(`/api/v1/datasets/${datasetId}/metadata-attachments`, attachmentForm, { headers: { 'Content-Length': attachmentForm.getLengthSync(), ...attachmentForm.getHeaders() } })
    await ax.patch('/api/v1/datasets/' + datasetId, { attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })
  }

  test('Upload a simple metadata attachment', async () => {
    const ax = testUser1
    await ax.put('/api/v1/datasets/attachments1', { isRest: true, title: 'attachments1' })
    await sendMetadataAttachment(ax, 'attachments1', 'avatar.jpeg')
    const downloadAttachmentRes = await ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg')
    assert.equal(downloadAttachmentRes.headers['x-operation'], '{"class":"read","id":"downloadMetadataAttachment","track":"readDataFiles"}')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/jpeg')
    assert.ok(downloadAttachmentRes.headers['last-modified'])
    await assert.rejects(ax.get('/api/v1/datasets/attachments1/metadata-attachments/avatar.jpeg', { headers: { 'If-Modified-Since': downloadAttachmentRes.headers['last-modified'] } }), { status: 304 })
  })

  test('Create a metadata attachment with a private target URL', async () => {
    const ax = testUser1
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

  test('Metadata attachment supports Range query (used for PMTILES support)', async () => {
    const ax = testUser1
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
