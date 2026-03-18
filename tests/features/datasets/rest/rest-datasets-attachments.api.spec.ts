import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'fs-extra'
import FormData from 'form-data'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize, lsAttachments } from '../../../support/workers.ts'

const dmeadus = await axiosAuth('dmeadus0@answers.com')
const ngernier4 = await axiosAuth('ngernier4@usa.gov')

test.describe('REST datasets - Attachments', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Send attachment with multipart request', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest5', {
      isRest: true,
      title: 'rest5',
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./test-it/resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('attr1', 10)
    res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const line = res.data
    assert.ok(line._id)
    assert.ok(line.attachmentPath.startsWith(res.data._id + '/'))
    assert.ok(line.attachmentPath.endsWith('/test.pdf'))
    await waitForFinalize(ax, 'rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]['_file.content'], 'This is a test pdf file.')
    assert.equal(res.data.results[0].attr1, 10)
    let attachments = await lsAttachments('rest5')
    assert.equal(attachments.length, 1)
    assert.equal(attachments[0], res.data.results[0].attachmentPath)

    await ax.delete('/api/v1/datasets/rest5/lines/' + line._id)
    await waitForFinalize(ax, 'rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 0)
    attachments = await lsAttachments('rest5')
    assert.equal(attachments.length, 0)
  })

  test('Send attachment with multipart and special _body key', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/rest5', {
      isRest: true,
      title: 'rest5',
      schema: [
        { key: 'attr1', type: 'integer' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./test-it/resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'dir1/test.pdf')
    form.append('_body', '{"attr1":10}')
    res = await ax.post('/api/v1/datasets/rest5/lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    await waitForFinalize(ax, 'rest5')

    res = await ax.get('/api/v1/datasets/rest5/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].attr1, 10)
  })

  test('Send attachments with bulk request', async () => {
    const ax = ngernier4
    let res = await ax.post('/api/v1/datasets/rest6', {
      isRest: true,
      title: 'rest6',
      schema: [
        { key: 'attr1', type: 'string' },
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })

    const form = new FormData()
    const attachmentsContent = fs.readFileSync('./test-it/resources/datasets/files.zip')
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line1', attr1: 'test1', attachmentPath: 'test.odt' },
      { _id: 'line2', attr1: 'test1', attachmentPath: 'dir1/test.pdf' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 2)
    await waitForFinalize(ax, 'rest6')
    const ls = await lsAttachments('rest6')
    assert.equal(ls.length, 2)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.find((l: any) => l._id === 'line1')['_file.content'], 'This is a test libreoffice file.')

    // overwrite 1 line
    const form1 = new FormData()
    const attachmentsContent1 = fs.readFileSync('./test-it/resources/datasets/files2.zip')
    form1.append('attachments', attachmentsContent1, 'files2.zip')
    form1.append('actions', Buffer.from(JSON.stringify([]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form1, { headers: { 'Content-Length': form1.getLengthSync(), ...form1.getHeaders() } })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, 'rest6')
    const ls1 = await lsAttachments('rest6')
    assert.equal(ls1.length, 2)
    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 2)
    assert.equal(res.data.results.find((l: any) => l._id === 'line1')['_file.content'], 'This is another test libreoffice file.')

    // add 1 more line
    const form2 = new FormData()
    const attachmentsContent2 = fs.readFileSync('./test-it/resources/datasets/files3.zip')
    form2.append('attachments', attachmentsContent2, 'files3.zip')
    form2.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line3', attr1: 'test2', attachmentPath: 'files3/test2.odt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 1)
    await waitForFinalize(ax, 'rest6')
    const ls2 = await lsAttachments('rest6')
    assert.equal(ls2.length, 3)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 3)
    assert.equal(res.data.results.find((l: any) => l._id === 'line3')['_file.content'], 'This is another test libreoffice file.')

    // 1 more time but in "drop" mode
    const form3 = new FormData()
    const attachmentsContent3 = fs.readFileSync('./test-it/resources/datasets/files2.zip')
    form3.append('attachments', attachmentsContent3, 'files2.zip')
    form3.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line4', attr1: 'test3', attachmentPath: 'test.odt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form3, { headers: { 'Content-Length': form3.getLengthSync(), ...form3.getHeaders() }, params: { drop: true } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 1)
    await waitForFinalize(ax, 'rest6')
    const ls3 = await lsAttachments('rest6')
    assert.equal(ls3.length, 1)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results.find((l: any) => l._id === 'line4')['_file.content'], 'This is another test libreoffice file.')

    // with an accented filename and a missing file
    const form4 = new FormData()
    const attachmentsContent4 = fs.readFileSync('./test-it/resources/datasets/files4.zip')
    form4.append('attachments', attachmentsContent4, 'files4.zip')
    form4.append('actions', Buffer.from(JSON.stringify([
      { _id: 'line5', attr1: 'test5', attachmentPath: 'testé.txt' },
      { _id: 'line6', attr1: 'test6', attachmentPath: 'test-missing.txt' }
    ]), 'utf8'), 'actions.json')
    res = await ax.post('/api/v1/datasets/rest6/_bulk_lines', form4, { headers: { 'Content-Length': form4.getLengthSync(), ...form4.getHeaders() } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbOk, 2)
    await waitForFinalize(ax, 'rest6')
    const ls4 = await lsAttachments('rest6')
    assert.equal(ls4.length, 2)

    res = await ax.get('/api/v1/datasets/rest6/lines')
    assert.equal(res.data.total, 3)
    const line5 = res.data.results.find((l: any) => l._id === 'line5')
    const line6 = res.data.results.find((l: any) => l._id === 'line6')
    assert.equal(line5['_file.content'], 'This a txt file with accented filename.')
    assert.ok(line5['_attachment_url'].endsWith('/testé.txt'))
    res = await ax.get(line5._attachment_url)
    assert.equal(res.data, 'This a txt file with accented filename.')
    assert.equal(res.headers['content-disposition'], 'inline; filename="teste.txt"; filename*=UTF-8\'\'test%C3%A9.txt')

    assert.ok(!line6['_file.content'])
    await assert.rejects(ax.get(line6._attachment_url), { status: 404 })
  })

  test('Synchronize all lines with the content of the attachments directory', async () => {
    const ax = ngernier4
    let res = await ax.post('/api/v1/datasets/restsync', {
      isRest: true,
      title: 'restsync',
      schema: [
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ],
      primaryKey: ['attachmentPath']
    })
    // Create a line with an attached file
    const form = new FormData()
    const attachmentsContent = fs.readFileSync('./test-it/resources/datasets/files.zip')
    form.append('attachments', attachmentsContent, 'files.zip')
    form.append('actions', Buffer.from(JSON.stringify([]), 'utf8'), 'actions.json')

    res = await ax.post('/api/v1/datasets/restsync/_bulk_lines', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
      params: { lock: 'true' }
    })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, 'restsync')

    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 0)

    // should create 2 lines for the 2 uploaded attachments
    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })
    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 2)
    await waitForFinalize(ax, 'restsync')
    res = await ax.get('/api/v1/datasets/restsync/lines')
    assert.equal(res.data.total, 2)

    // second sync should do nothing
    res = await ax.post('/api/v1/datasets/restsync/_sync_attachments_lines', null, { params: { lock: 'true' } })

    assert.equal(res.status, 200)
    assert.equal(res.data.nbCreated, 0)
    assert.equal(res.data.nbNotModified, 2)
    await waitForFinalize(ax, 'restsync')
  })

  test('Send attachment with special chars', async () => {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'rest attachment ko',
      schema: [
        { key: 'attachmentPath', type: 'string', 'x-refersTo': 'http://schema.org/DigitalDocument' }
      ]
    })
    const dataset = res.data

    // Create a line with an attached file
    const form = new FormData()
    const attachmentContent = fs.readFileSync('./test-it/resources/datasets/files/dir1/test.pdf')
    form.append('attachment', attachmentContent, 'Capture d\u2019\u00e9cran du 2024-11-19 10-20-57.png')
    res = await ax.post(`/api/v1/datasets/${dataset.id}/lines`, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const line = res.data
    assert.ok(line._id)
    assert.ok(line.attachmentPath.startsWith(res.data._id + '/'))
    assert.ok(line.attachmentPath.endsWith('/Capture d\u2019\u00e9cran du 2024-11-19 10-20-57.png'))
    await waitForFinalize(ax, dataset.id)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`)
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0]['_file.content'], 'This is a test pdf file.')
    res = await ax.get(res.data.results[0]._attachment_url)
    assert.equal(res.headers['content-disposition'], "inline; filename=\"Capture d?\u00fdcran du 2024-11-19 10-20-57.png\"; filename*=UTF-8''Capture%20d%E2%80%99%C3%A9cran%20du%202024-11-19%2010-20-57.png")
  })
})
