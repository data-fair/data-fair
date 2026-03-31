import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, config, mockUrl } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, setupMockRoute, clearMockRoutes, getRawDataset } from '../../../support/workers.ts'
import { TestEventClient } from '../../../support/events.ts'
import fs from 'fs-extra'
import FormData from 'form-data'

const anonymous = axios()
const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser5Org = await axiosAuth('test_user5@test.com', 'test_org1')

test.describe('datasets - features', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('should create thumbnails for datasets with illustrations', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/datasets/thumbnails1', {
      isRest: true,
      title: 'thumbnails1',
      attachmentsAsImage: true,
      schema: [{ key: 'desc', type: 'string' }, { key: 'imageUrl', type: 'string', 'x-refersTo': 'http://schema.org/image' }]
    })
    res = await ax.post('/api/v1/datasets/thumbnails1/_bulk_lines', [
      { imageUrl: `${mockUrl}/image.png`, desc: '1 image' },
      { imageUrl: `${mockUrl}/avatar.jpg`, desc: '2 avatar' },
      { imageUrl: `${mockUrl}/wikipedia.gif`, desc: '3 wikipedia animated' }
    ])
    await waitForFinalize(ax, 'thumbnails1')

    // Setup mock routes for thumbnail images
    await setupMockRoute({ path: '/image.png', status: 200, body: '', contentType: 'image/png' })
    await setupMockRoute({ path: '/avatar.jpg', status: 200, bodyBase64: fs.readFileSync('./tests/resources/avatar.jpeg').toString('base64'), contentType: 'image/jpeg' })
    await setupMockRoute({ path: '/wikipedia.gif', status: 200, bodyBase64: fs.readFileSync('./tests/resources/wikipedia.gif').toString('base64'), contentType: 'image/gif' })

    res = await ax.get('/api/v1/datasets/thumbnails1/lines', { params: { thumbnail: true, select: 'desc', sort: 'desc' } })
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0].desc, '1 image')
    assert.equal(res.data.results[1].desc, '2 avatar')
    assert.equal(res.data.results[2].desc, '3 wikipedia animated')
    assert.ok(res.data.results[0]._thumbnail.endsWith('width=300&height=200'))

    // Empty image should redirect
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err: any) => err.status === 302)
    // Valid image should return a thumbnail
    const thumbres = await ax.get(res.data.results[1]._thumbnail)
    assert.equal(thumbres.headers['content-type'], 'image/png')
    assert.equal(thumbres.headers['x-thumbnails-cache-status'], 'MISS')
    assert.equal(thumbres.headers['cache-control'], 'must-revalidate, private, max-age=0')

    const thumbresGif = await ax.get(res.data.results[2]._thumbnail)
    assert.equal(thumbresGif.headers['content-type'], 'image/webp')
    assert.equal(thumbresGif.headers['x-thumbnails-cache-status'], 'MISS')
    assert.equal(thumbresGif.headers['cache-control'], 'must-revalidate, private, max-age=0')

    await clearMockRoutes()
  })

  test('should create thumbnail for the image metadata of a dataset', async () => {
    const ax = testUser1
    await setupMockRoute({ path: '/dataset-image.jpg', status: 200, bodyBase64: fs.readFileSync('./tests/resources/avatar.jpeg').toString('base64'), contentType: 'image/jpeg' })

    await ax.post('/api/v1/datasets/thumbnail', {
      isRest: true,
      title: 'thumbnail',
      image: `${mockUrl}/dataset-image.jpg`
    })
    await ax.put('/api/v1/datasets/thumbnail/permissions', [{ classes: ['read'] }])
    let res = await ax.get('/api/v1/datasets/thumbnail')
    assert.ok(res.data.thumbnail)
    res = await ax.get(res.data.thumbnail)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-thumbnails-cache-status'], 'MISS')

    await clearMockRoutes()
  })

  // keep this test skipped most of the time as it depends on an outside service
  test.skip('should provide a redirect for an unsupported image format', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/thumbnail', {
      isRest: true,
      title: 'thumbnail',
      image: 'https://geocatalogue.lannion-tregor.com/geonetwork/srv/api/records/c4576973-28cd-47d5-a082-7871f96d8f14/attachments/reseau_transport_scolaire.JPG'
    })
    await ax.put('/api/v1/datasets/thumbnail/permissions', [{ classes: ['read'] }])
    let res = await ax.get('/api/v1/datasets/thumbnail')
    assert.ok(res.data.thumbnail)
    res = await ax.get(res.data.thumbnail)
    assert.equal(res.headers['content-type'], 'image/jpg')
  })

  test('should create thumbnails from attachments', async () => {
    const ax = testUser1Org
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./tests/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./tests/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    await waitForFinalize(ax, res.data.id)
    let dataset = await getRawDataset(res.data.id)
    assert.ok(dataset.draft.schema.some((field: any) => field.key === '_attachment_url' && field['x-refersTo'] === 'http://schema.org/image'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true } })
    const thumbnail1 = res.data.results[0]._thumbnail
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err: any) => err.status === 302)
    await assert.rejects(anonymous.get(res.data.results[0]._thumbnail), (err: any) => err.status === 403)
    assert.ok(thumbnail1.startsWith(`${config.publicUrl}/api/v1/datasets/${dataset.id}/thumbnail/`))

    const portal = { type: 'data-fair-portals', id: 'portal1', url: `http://${process.env.DEV_HOST}:${process.env.NGINX_PORT2}` }
    await ax.post('/api/v1/settings/organization/test_org1/publication-sites', portal)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true }, headers: { host: `${process.env.DEV_HOST}:${process.env.NGINX_PORT2}` } })
    assert.equal(thumbnail1.replace(process.env.DEV_HOST + ':' + process.env.NGINX_PORT1, `${process.env.DEV_HOST}:${process.env.NGINX_PORT2}`), res.data.results[0]._thumbnail)

    // remove attachmentsAsImage
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { attachmentsAsImage: null }, { params: { draft: true } })).data
    assert.ok(dataset.schema.some((field: any) => field.key === '_attachment_url' && field['x-refersTo'] === undefined))
  })

  test('Use an api key defined on the dataset', async () => {
    const ax = testUser1
    let dataset = await sendDataset('datasets/dataset1.csv', ax)
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { readApiKey: { active: true, interval: 'P1W' } })).data
    assert.ok(dataset.readApiKey?.active)
    assert.ok(dataset.readApiKey.expiresAt)
    assert.ok(dataset.readApiKey.renewAt)
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}/read-api-key`), { status: 403 })
    const apiKey = (await ax.get(`/api/v1/datasets/${dataset.id}/read-api-key`)).data

    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}/lines`), { status: 403 })
    await assert.rejects(anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': 'wrong' } }), { status: 401 })
    const res = await anonymous.get(`/api/v1/datasets/${dataset.id}/lines`, { headers: { 'x-apiKey': apiKey.current } })
    assert.ok(res.status === 200)
    await assert.rejects(anonymous.patch(`/api/v1/datasets/${dataset.id}`, { title: 'Title' }, { headers: { 'x-apiKey': apiKey.current } }), { status: 403 })
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    assert.ok(!dataset._readApiKey)
  })

  // this test is skipped because it relies on a shared volume that cannot be mounted during docker build
  test('anitivirus reject upload of infected file in dataset', async () => {
    const ax = testUser1
    await assert.rejects(sendDataset('antivirus/eicar.com.csv', ax), (err: any) => {
      assert.ok(err.data.includes('malicious file detected'))
      assert.equal(err.status, 400)
      return true
    })

    await assert.rejects(sendDataset('antivirus/eicar.com.zip', ax), (err: any) => {
      assert.ok(err.data.includes('malicious file detected'))
      assert.equal(err.status, 400)
      return true
    })
  })

  test('Calculate enum of values in data', async () => {
    const ax = testUser1
    await ax.put('/api/v1/datasets/rest2', {
      isRest: true,
      title: 'rest2',
      schema: [{ key: 'attr1', type: 'string' }, { key: 'attr2', type: 'string' }, { key: 'attr3', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest2/_bulk_lines', [
      { attr1: 'test1', attr2: 'test1', attr3: 'test1' },
      { attr1: 'test1', attr2: 'test2', attr3: 'test1' },
      { attr1: 'test1', attr2: 'test3' },
      { attr1: 'test1', attr2: 'test4' },
      { attr1: 'test2', attr2: 'test5' },
      { attr1: 'test2', attr2: 'test6' },
      { attr1: 'test2', attr2: 'test7' },
      { attr1: 'test2', attr2: 'test8' },
      { attr1: 'test2', attr2: 'test9' },
      { attr1: 'test2', attr2: 'test9' },
      { attr1: '', attr2: 'test10' }
    ])
    const dataset = await waitForFinalize(ax, 'rest2')
    const attr1 = dataset.schema.find((p: any) => p.key === 'attr1')
    assert.deepEqual(attr1.enum, ['test2', 'test1'])

    // cardinality too close to line count
    const attr2 = dataset.schema.find((p: any) => p.key === 'attr2')
    assert.equal(attr2.enum, undefined)
    // too sparse
    const attr3 = dataset.schema.find((p: any) => p.key === 'attr3')
    assert.equal(attr3.enum, undefined)
  })

  test('Create simple meta only datasets', async () => {
    const ax = testUser1

    const res = await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'a meta only dataset' })
    assert.equal(res.status, 201)
    const dataset = res.data
    assert.equal(dataset.slug, 'a-meta-only-dataset')

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { title: 'a meta only dataset 2' })
  })

  test('relative path in dataset file name', async () => {
    const ax = testUser1
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), '../dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
  })

  test('relative path in dataset id', async () => {
    const ax = testUser1
    const form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('id', '../dataset1')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 400)

    const form2 = new FormData()
    form2.append('file', fs.readFileSync('./tests/resources/datasets/dataset1.csv'), 'dataset1.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + encodeURIComponent('../dataset1'), form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } }), (err: any) => err.status === 404)
  })

  test('relative path in attachment name', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./tests/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = testUser1
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    const dataset = await waitForFinalize(ax, res.data.id)
    const attachmentRes = await ax.get(`/api/v1/datasets/${dataset.id}/attachments/test.odt`)
    assert.equal(attachmentRes.status, 200)
    const attachmentHackRes1 = await ax.get(`/api/v1/datasets/${dataset.id}/attachments//test.odt`)
    assert.equal(attachmentHackRes1.headers['content-length'], attachmentRes.headers['content-length'])
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/~/test.odt`), (err: any) => err.status === 404)
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/${encodeURIComponent('../files.zip')}`), (err: any) => err.status === 404)
  })

  test('send user notification', async () => {
    const ax = testUser1Org
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'user notif 1',
      schema: [{ key: 'str', type: 'string' }]
    })).data

    const events = new TestEventClient()
    await events.ready
    try {
      const notifications: any[] = []
      events.on('notification', (n: any) => notifications.push(n))

      await assert.rejects(ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { title: 'Title' }), (err: any) => err.status === 400)

      await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [])

      await ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
      await new Promise(resolve => setTimeout(resolve, 200))
      assert.equal(notifications.length, 1)
      assert.equal(notifications[0].title, 'Title')
      assert.ok(notifications[0].topic.key.endsWith(':topic1'))
      assert.equal(notifications[0].visibility, 'private')

      await assert.rejects(testUser5Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' }), (err: any) => err.status === 403)
      await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
        { type: 'user', id: 'test_user5', operations: ['sendUserNotification'] }
      ])
      await testUser5Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
      await assert.rejects(testUser5Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' }), (err: any) => err.status === 403)

      await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
        { type: 'user', id: 'test_user5', operations: ['sendUserNotification', 'sendUserNotificationPublic'] }
      ])
      await testUser5Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
      await testUser5Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' })
    } finally {
      events.close()
    }
  })
})
