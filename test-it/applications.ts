import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, anonymous, sendDataset, alban, config } from './utils/index.ts'
import fs from 'node:fs'
import FormData from 'form-data'
import path from 'node:path'

const sendAttachment = async (ax: any, appId: string, attachmentName: string) => {
  const attachmentForm = new FormData()
  attachmentForm.append('attachment', fs.readFileSync(path.resolve(import.meta.dirname, '../test/resources/' + attachmentName)), attachmentName)
  await ax.post(`/api/v1/applications/${appId}/attachments`, attachmentForm, { headers: { 'Content-Length': attachmentForm.getLengthSync(), ...attachmentForm.getHeaders() } })
  await ax.patch('/api/v1/applications/' + appId, { attachments: [{ type: 'file', name: 'avatar.jpeg', title: 'Avatar' }] })
}

describe('Applications', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get applications when not authenticated', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Access an unknown applicationId on proxy endpoint', async function () {
    const ax = anonymous
    await assert.rejects(ax.get('/app/unknownId'), { status: 404 })
  })

  it('Post an application configuration, read it, update it and delete it', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    assert.equal(res.status, 201)

    const appId = res.data.id
    res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.ok(res.data.count >= 1)
    res = await ax.get('/api/v1/applications/' + appId)
    assert.equal(res.data.url, 'http://monapp1.com/')
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
    const app = res.data.results.find((a: any) => a.id === appId)
    assert.equal(app, undefined)
  })

  it('Manage the custom configuration part of the object', async function () {
    const ax = dmeadus

    let dataset = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit = (await ax.get('/api/v1/datasets', { params: { id: dataset.id, select: 'id' } })).data.results[0]
    const dataset2 = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit2 = (await ax.get('/api/v1/datasets', { params: { id: dataset2.id, select: 'id' } })).data.results[0]

    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
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

  it('Use an application through the application proxy', async function () {
    const ax = dmeadus

    const dataset = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit = (await ax.get('/api/v1/datasets', { params: { id: dataset.id, select: 'id' } })).data.results[0]
    const dataset2 = await sendDataset('datasets/split.csv', ax)
    const datasetRefInit2 = (await ax.get('/api/v1/datasets', { params: { id: dataset2.id, select: 'id' } })).data.results[0]

    let res = await ax.post('/api/v1/applications', {
      url: 'http://monapp1.com/',
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

    assert.ok(res.data.includes('window.APPLICATION={'))
    const match = />window\.APPLICATION=(.*);</.exec(res.data)
    const application = JSON.parse(match?.[1] || '{}')
    assert.ok(application.configuration)
    assert.ok(!!application.configuration.datasets?.length)
    assert.deepEqual(Object.keys(application.configuration.datasets[0]).sort(), ['finalizedAt', 'href', 'id', 'schema', 'slug', 'title', 'userPermissions'])
    assert.deepEqual(Object.keys(application.configuration.datasets[1]).sort(), ['applicationKeyPermissions', 'finalizedAt', 'href', 'id', 'schema', 'slug', 'title', 'userPermissions'])

    assert.ok(res.data.includes(`<link rel="manifest" crossorigin="use-credentials" href="/data-fair/app/${appId}/manifest.json">`))
    assert.ok(res.data.includes('/app-sw.js'))
    assert.ok(res.data.includes('<div>application embed</div>'))

    await alban.post('/api/v1/limits/user/dmeadus0', { hide_brand: { limit: 1 }, lastUpdate: new Date().toISOString() }, { params: { key: config.secretKeys.limits } })
    res = await ax.get('/app/' + appId)
    assert.equal(res.data.includes('<div>application embed</div>'), false)
  })

  it('Read base app info of an application', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    const appId = res.data.id
    res = await ax.put('/api/v1/applications/' + appId + '/config', {
      datasets: [{ href: config.publicUrl + '/api/v1/datasets/111' }]
    })
    assert.equal(res.status, 200)
    res = await ax.get('/api/v1/applications/' + appId + '/base-application')
    assert.equal(res.status, 200)
    assert.equal(res.data.applicationName, 'test')
    assert.equal(res.data.image, 'http://monapp1.com/thumbnail.png')
  })

  it('Sort applications by title', async function () {
    const ax = dmeadus

    await ax.post('/api/v1/applications', { title: 'aa', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: 'bb', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: 'àb', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: ' àb', url: 'http://monapp1.com/' })
    await ax.post('/api/v1/applications', { title: '1a', url: 'http://monapp1.com/' })

    let res = await ax.get('/api/v1/applications', { params: { select: 'title', raw: true, sort: 'title:1' } })
    assert.deepEqual(res.data.results.map((d: any) => d.title), ['1a', 'aa', 'àb', 'àb', 'bb'])
    res = await ax.get('/api/v1/applications', { params: { select: 'id,title', raw: true, sort: 'title:-1' } })
    assert.deepEqual(res.data.results.map((d: any) => d.title), ['bb', 'àb', 'àb', 'aa', '1a'])

    await ax.patch('/api/v1/applications/' + res.data.results[0].id, { slug: 'test-slug' })
    await assert.rejects(ax.patch('/api/v1/applications/' + res.data.results[1].id, { slug: 'test-slug' }), (error: any) => {
      assert.equal(error.status, 400)
      assert.ok(error.data.includes('Ce slug est déjà utilisé'))
      return true
    })
    res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/', title: 'test slug 2', slug: 'test-slug' })
    assert.equal(res.data.slug, 'test-slug-2')
  })

  it('Upload a simple attachment on an application', async function () {
    const ax = dmeadus
    const { data: app } = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })

    await sendAttachment(ax, app.id, 'avatar.jpeg')

    const downloadAttachmentRes = await ax.get(`/api/v1/applications/${app.id}/attachments/avatar.jpeg`)
    assert.equal(downloadAttachmentRes.headers['x-operation'], '{"class":"read","id":"downloadAttachment"}')
    assert.equal(downloadAttachmentRes.status, 200)
    assert.equal(downloadAttachmentRes.headers['content-type'], 'image/jpeg')
    assert.ok(downloadAttachmentRes.headers['last-modified'])
    await assert.rejects(ax.get(`/api/v1/applications/${app.id}/attachments/avatar.jpeg`, { headers: { 'If-Modified-Since': downloadAttachmentRes.headers['last-modified'] } }), { status: 304 })

    const updatedApp = (await ax.get(`/api/v1/applications/${app.id}`)).data
    assert.equal(updatedApp.storage.size, 9755)

    const limits = (await ax.get('/api/v1/limits/user/dmeadus0')).data
    assert.equal(limits.store_bytes.consumption, 9755)
  })
})
