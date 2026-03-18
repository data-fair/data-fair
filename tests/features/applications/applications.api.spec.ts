import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import FormData from 'form-data'
import { axios, axiosAuth, clean, checkPendingTasks, config, mockAppUrl, mockAppId } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const anonymous = axios()
const testUser1 = await axiosAuth('test_user1@test.com')
const alban = await axiosAuth('alban.mouton@koumoul.com', undefined, true)
const testSuperadmin = await axiosAuth('test_superadmin@test.com', undefined, true)

const captureUrl = `http://localhost:${process.env.NGINX_PORT1}/capture`

const sendAttachment = async (ax: any, appId: string, attachmentName: string) => {
  const attachmentForm = new FormData()
  attachmentForm.append('attachment', fs.readFileSync('./tests/resources/' + attachmentName), attachmentName)
  await ax.post(`/api/v1/applications/${appId}/attachments`, attachmentForm, { headers: { 'Content-Length': attachmentForm.getLengthSync(), ...attachmentForm.getHeaders() } })
  await ax.patch('/api/v1/applications/' + appId, { attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })
}

test.describe('Applications', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Get public base applications', async () => {
    const ax = anonymous
    const res = await ax.get('/api/v1/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  test('Get privately readable base app', async () => {
    // Only public at first
    const ax = testUser1
    let res = await ax.get('/api/v1/base-applications?privateAccess=user:test_user1')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
    const baseApp1 = res.data.results[0]
    assert.ok(baseApp1)
    assert.equal(baseApp1.public, true)
    assert.equal(baseApp1.datasetsFilters.length, 2)
    assert.deepEqual(baseApp1.datasetsFilters[0]['field-type'], ['integer', 'number'])
    assert.deepEqual(baseApp1.datasetsFilters[0].select, ['id', 'title', 'schema', 'userPermissions'])
    const baseApp3 = res.data.results[1]
    assert.ok(baseApp3)
    assert.equal(baseApp3.public, true)
    assert.equal(baseApp3.datasetsFilters.length, 1)
    assert.deepEqual(baseApp3.datasetsFilters[0].select, ['id', 'title', 'schema'])

    // super admin patchs the private one
    const adminAx = testSuperadmin
    res = await adminAx.get('/api/v1/admin/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    await adminAx.patch(`/api/v1/base-applications/${mockAppId('monapp2')}`, {
      privateAccess: [{ type: 'user', id: 'test_user1' }, { type: 'user', id: 'another' }]
    })
    assert.equal(res.status, 200)

    // User sees the public and private base app
    res = await ax.get('/api/v1/base-applications?privateAccess=user:test_user1')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    const baseApp = res.data.results.find((a: any) => a.url === mockAppUrl('monapp2'))
    assert.equal(baseApp.privateAccess.length, 1)
  })

  test('Get base apps completed with contextual dataset', async () => {
    const ax = testUser1
    const adminAx = testSuperadmin
    await adminAx.patch(`/api/v1/base-applications/${mockAppId('monapp2')}`, { privateAccess: [{ type: 'user', id: 'test_user1' }] })
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get('/api/v1/base-applications?privateAccess=user:test_user1&dataset=' + dataset.id)
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    const app = res.data.results.find((a: any) => a.url === mockAppUrl('monapp2'))
    assert.equal(app.category, 'autre')
    assert.equal(app.disabled.length, 1)
    assert.equal(app.disabled[0], 'n\'utilise pas de jeu de données comme source.')
  })

  test('Get applications when not authenticated', async () => {
    const ax = anonymous
    const res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  test('Access an unknown applicationId on proxy endpoint', async () => {
    const ax = anonymous
    await assert.rejects(
      ax.get('/app/unknownId'),
      { status: 404 }
    )
  })

  test('Post an application configuration, read it, update it and delete it', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    assert.equal(res.status, 201)

    const appId = res.data.id
    res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.ok(res.data.count >= 1)
    res = await ax.get('/api/v1/applications/' + appId)
    assert.equal(res.data.url, mockAppUrl('monapp1'))
    res = await ax.get('/api/v1/applications/' + appId + '/api-docs.json')
    assert.ok(res.data.openapi)
    res = await ax.get('/api/v1/applications/' + appId + '/config')
    assert.equal(res.status, 200)
    res = await ax.patch('/api/v1/applications/' + appId, { title: 'Test application config' })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'Test application config')
    res = await ax.delete('/api/v1/applications/' + appId)
    assert.equal(res.status, 204)
    res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  test('Manage the custom configuration part of the object', async () => {
    const ax = testUser1

    let dataset = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit = (await ax.get('/api/v1/datasets', { params: { id: dataset.id, select: 'id' } })).data.results[0]
    const dataset2 = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit2 = (await ax.get('/api/v1/datasets', { params: { id: dataset2.id, select: 'id' } })).data.results[0]

    let res = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const appId = res.data.id
    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{ id: dataset.id, href: datasetRefInit.href }, { id: dataset2.id, href: datasetRefInit2.href }]
    })
    assert.equal(res.status, 200)
    res = await ax.get('/api/v1/applications/' + appId + '/config')
    assert.equal(res.status, 200)
    assert.equal(res.data.datasets.length, 2)
    assert.equal(res.data.datasets[0].title, 'split')
    assert.deepEqual(res.data.datasets[1].applicationKeyPermissions, { operations: ['readSafeSchema', 'createLine'] })
    res = await ax.get('/api/v1/applications', { params: { dataset: 'nope' } })
    assert.equal(res.data.count, 0)
    res = await ax.get('/api/v1/applications', { params: { dataset: dataset.id } })
    assert.equal(res.data.count, 1)

    await ax.patch('/api/v1/datasets/' + dataset.id, { title: 'changed title' })
    res = await ax.get('/api/v1/applications/' + appId + '/configuration-draft')
    assert.equal(res.status, 200)
    assert.equal(res.data.datasets.length, 2)
    assert.equal(res.data.datasets[0].title, 'changed title')

    dataset = (await ax.get('/api/v1/datasets/' + dataset.id)).data
    assert.equal(dataset.extras.applications.length, 1)
  })

  test('Use an application through the application proxy', async () => {
    const ax = testUser1
    const adminAx = alban

    const dataset = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit = (await ax.get('/api/v1/datasets', { params: { id: dataset.id, select: 'id' } })).data.results[0]
    const dataset2 = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit2 = (await ax.get('/api/v1/datasets', { params: { id: dataset2.id, select: 'id' } })).data.results[0]

    let res = await ax.post('/api/v1/applications', {
      url: mockAppUrl('monapp1'),
      configuration: {
        datasets: [
          { id: dataset.id, href: datasetRefInit.href },
          { id: dataset2.id, href: datasetRefInit2.href }
        ]
      }
    })
    const appId = res.data.id

    res = await ax.get(`/app/${appId}/dir1/info.txt`)
    assert.equal(res.status, 200)
    assert.equal(res.data, 'into txt dir1')
    // The same content is returned with or without a trailing slash
    res = await ax.get(`/app/${appId}/`)
    assert.equal(res.status, 200)
    assert.ok(res.headers['content-type'].startsWith('text/html'))
    assert.ok(res.data.includes('My app body'))
    res = await ax.get('/app/' + appId)
    assert.equal(res.status, 200)
    assert.ok(res.data.includes('My app body'))
    res = await ax.get(`/app/${appId}/index.html`)
    assert.equal(res.status, 200)
    assert.ok(res.data.includes('My app body'))

    // The configuration is injected
    assert.ok(res.data.includes('window.APPLICATION={'))
    const application = JSON.parse(/>window\.APPLICATION=(.*);</.exec(res.data)![1])
    assert.ok(application.configuration)
    assert.ok(application.configuration.datasets?.length, 1)
    assert.deepEqual(Object.keys(application.configuration.datasets[0]).sort(), ['finalizedAt', 'href', 'id', 'schema', 'slug', 'title', 'userPermissions'])
    assert.deepEqual(Object.keys(application.configuration.datasets[1]).sort(), ['applicationKeyPermissions', 'finalizedAt', 'href', 'id', 'schema', 'slug', 'title', 'userPermissions'])

    // A link to the manifest is injected
    assert.ok(res.data.includes(`<link rel="manifest" crossorigin="use-credentials" href="/data-fair/app/${appId}/manifest.json">`))
    // The app reference a service worker
    assert.ok(res.data.includes('/app-sw.js'))
    // the app contains the brand embed (cf config.brand.embed)
    assert.ok(res.data.includes('<div>application embed</div>'))

    // no brand embed if the specific limit is defined
    await adminAx.post('/api/v1/limits/user/test_user1', { hide_brand: { limit: 1 }, lastUpdate: new Date().toISOString() }, { params: { key: config.secretKeys.limits } })
    res = await ax.get('/app/' + appId)
    assert.equal(res.data.includes('<div>application embed</div>'), false)
  })

  test('Read base app info of an application', async () => {
    const ax = testUser1
    let res = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const appId = res.data.id
    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{ href: config.publicUrl + '/api/v1/datasets/111' }]
    })
    assert.equal(res.status, 200)
    res = await ax.get('/api/v1/applications/' + appId + '/base-application')
    assert.equal(res.status, 200)
    assert.equal(res.data.applicationName, 'test')
    assert.equal(res.data.image, mockAppUrl('monapp1') + 'thumbnail.png')
  })

  test('Read capture of application', async () => {
    const ax = testUser1
    try {
      await ax.get(captureUrl + '/api/v1/api-docs.json')
    } catch (err: any) {
      console.warn('capture is not available in this test environment')
      assert.equal(err.status, 502)
      return
    }

    const { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })
    const { data: dataset } = await ax.post('/api/v1/datasets', { isRest: true, title: 'a rest dataset' })
    await ax.put('/api/v1/applications/' + app.id + '/config', { datasets: [{ href: dataset.href, id: dataset.id }] })
    const updatedAt = (await ax.get('/api/v1/applications/' + app.id)).data.updatedAt
    assert.ok(updatedAt)

    // 1rst call, the capture file is created
    let res = await ax.get('/api/v1/applications/' + app.id + '/capture')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'MISS')
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')

    // 2nd call, the capture file is served directly
    res = await ax.get('/api/v1/applications/' + app.id + '/capture?updatedAt=' + updatedAt)
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'HIT')
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=604800')

    // after a config change file should be recreated
    await new Promise(resolve => setTimeout(resolve, 1000))
    await ax.put('/api/v1/applications/' + app.id + '/config', { datasets: [{ href: dataset.href, id: dataset.id }], test: 'ok' })
    res = await ax.get('/api/v1/applications/' + app.id + '/capture')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'EXPIRED')

    // with some extra param no file cache is used
    res = await ax.get('/api/v1/applications/' + app.id + '/capture?app_test=ok')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-capture-cache-status'], 'BYPASS')

    // when an error is thrown it is forwarded
    await assert.rejects(ax.get('/api/v1/applications/' + app.id + '/capture?app_test=1&app_capture-test-error=true'), (err: any) => {
      assert.equal(err.headers['cache-control'], 'no-cache')
      assert.equal(err.status, 500)
      return true
    })
    // when an error in cached default thumbnail mode a no-preview image is returned
    await ax.put('/api/v1/applications/' + app.id + '/config', { datasets: [{ href: dataset.href, id: dataset.id }], test: 'ok2' })
    await assert.rejects(ax.get('/api/v1/applications/' + app.id + '/capture?app_capture-test-error=true', { maxRedirects: 0 }), (err: any) => {
      assert.equal(err.status, 302)
      assert.ok(err.headers.location.endsWith('/no-preview.png'))
      return true
    })

    // use /print to get a PDF print instead of image capture
    res = await ax.get('/api/v1/applications/' + app.id + '/print?app_test=ok')
    assert.equal(res.status, 200)
    assert.equal(res.headers['content-type'], 'application/pdf')
  })

  test('Sort applications by title', async () => {
    const ax = testUser1

    await ax.post('/api/v1/applications', { title: 'aa', url: mockAppUrl('monapp1') })
    await ax.post('/api/v1/applications', { title: 'bb', url: mockAppUrl('monapp1') })
    await ax.post('/api/v1/applications', { title: 'àb', url: mockAppUrl('monapp1') })
    await ax.post('/api/v1/applications', { title: ' àb', url: mockAppUrl('monapp1') })
    await ax.post('/api/v1/applications', { title: '1a', url: mockAppUrl('monapp1') })

    let res = await ax.get('/api/v1/applications', { params: { select: 'title', raw: true, sort: 'title:1' } })
    assert.deepEqual(res.data.results.map((d: any) => d.title), ['1a', 'aa', 'àb', 'àb', 'bb'])
    res = await ax.get('/api/v1/applications', { params: { select: 'id,title', raw: true, sort: 'title:-1' } })
    assert.deepEqual(res.data.results.map((d: any) => d.title), ['bb', 'àb', 'àb', 'aa', '1a'])

    // manage slug unicity
    await ax.patch('/api/v1/applications/' + res.data.results[0].id, { slug: 'test-slug' })
    await assert.rejects(ax.patch('/api/v1/applications/' + res.data.results[1].id, { slug: 'test-slug' }), (error: any) => {
      assert.equal(error.status, 400)
      assert.ok(error.data.includes('Ce slug est déjà utilisé'))
      return true
    })
    res = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1'), title: 'test slug 2', slug: 'test-slug' })
    assert.equal(res.data.slug, 'test-slug-2')
  })

  test('Upload a simple attachment on an application', async () => {
    const ax = testUser1
    let { data: app } = await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })

    await sendAttachment(ax, app.id, 'avatar.jpeg')

    const downloadAttachmentRes = await ax.get(`/api/v1/applications/${app.id}/attachments/avatar.jpeg`)
    assert.equal(downloadAttachmentRes.headers['x-operation'], '{"class":"read","id":"downloadAttachment"}')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/jpeg')
    assert.ok(downloadAttachmentRes.headers['last-modified'])
    await assert.rejects(ax.get(`/api/v1/applications/${app.id}/attachments/avatar.jpeg`, { headers: { 'If-Modified-Since': downloadAttachmentRes.headers['last-modified'] } }), { status: 304 })

    app = (await ax.get(`/api/v1/applications/${app.id}`)).data
    assert.equal(app.storage.size, 9755)

    const { data: limits } = await ax.get('/api/v1/limits/user/test_user1')
    assert.equal(limits.store_bytes.consumption, 9755)
  })
})
