const assert = require('assert').strict
const fs = require('fs')
const FormData = require('form-data')
const eventToPromise = require('event-to-promise')
const WebSocket = require('ws')
const config = require('config')
const testUtils = require('./resources/test-utils')

const workers = require('../server/workers')

let notifier
describe('datasets', () => {
  before('prepare notifier', async () => {
    notifier = require('./resources/app-notifier.js')
    await eventToPromise(notifier, 'listening')
  })

  it('Get datasets when not authenticated', async () => {
    const ax = await global.ax.builder()
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Get datasets when authenticated', async () => {
    const ax = await global.ax.builder('alone@no.org')
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Get datasets with special param as super admin', async () => {
    const ax = await global.ax.builder('alone@no.org')
    try {
      await ax.get('/api/v1/datasets', { params: { showAll: true } })
    } catch (err) {
      assert.equal(err.status, 400)
    }
    const axAdmin = await global.ax.builder('alban.mouton@koumoul.com:passwd:adminMode')
    const res = await axAdmin.get('/api/v1/datasets', { params: { showAll: true } })
    assert.equal(res.status, 200)
    assert.ok(res.data.count > 0)
  })

  it('Search and apply facets', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')

    // 1 dataset in user zone
    await testUtils.sendDataset('dataset1.csv', ax)
    // 2 datasets in organization zone
    await testUtils.sendDataset('dataset1.csv', ax, 'KWqAGZ4mG')
    await testUtils.sendDataset('dataset1.csv', ax, 'KWqAGZ4mG')

    let res = await ax.get('/api/v1/datasets', { params: { facets: 'owner,field-type' } })
    assert.equal(res.data.count, 3)
    assert.equal(res.data.facets.owner.length, 2)
    assert.equal(res.data.facets.owner[0].count, 2)
    assert.equal(res.data.facets.owner[0].value.id, 'KWqAGZ4mG')
    assert.equal(res.data.facets.owner[1].count, 1)
    assert.equal(res.data.facets['field-type'].length, 2)
    assert.equal(res.data.facets['field-type'][0].count, 3)

    res = await ax.get('/api/v1/datasets', {
      params: {
        owner: 'organization:KWqAGZ4mG',
        facets: 'owner,field-type'
      }
    })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.owner.length, 2)
    // owner facet is not affected by the owner filter
    assert.equal(res.data.facets.owner[0].count, 2)
    assert.equal(res.data.facets.owner[0].value.id, 'KWqAGZ4mG')
    assert.equal(res.data.facets.owner[1].count, 1)
    // field-type facet is affected by the owner filter
    assert.equal(res.data.facets['field-type'].length, 2)
    assert.equal(res.data.facets['field-type'][0].count, 2)
  })

  const datasetFd = fs.readFileSync('./test/resources/dataset1.csv')

  it('Failure to upload dataset exceeding limit', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    const form = new FormData()
    form.append('file', Buffer.alloc(16000), 'largedataset.csv')
    try {
      await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 413)
    }
  })

  it('Failure to upload multiple datasets exceeding limit', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    let form = new FormData()
    form.append('file', Buffer.alloc(11000), 'largedataset1.csv')
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })

    form = new FormData()
    form.append('file', Buffer.alloc(11000), 'largedataset2.csv')
    try {
      await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 429)
    }
  })

  it('Upload new dataset in user zone', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'user')
    assert.equal(res.data.owner.id, 'dmeadus0')
    assert.equal(res.data.file.encoding, 'UTF-8')
  })

  it('Upload new dataset in user zone with title', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    form.append('title', 'My title')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'my-title')
    assert.equal(res.data.title, 'My title')
  })

  it('Upload new dataset in organization zone', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
  })

  it('Uploading same file twice should increment id', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    for (const i of [1, 2, 3]) {
      const form = new FormData()
      form.append('file', datasetFd, 'my-dataset.csv')
      const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
      assert.equal(res.status, 201)
      assert.equal(res.data.id, 'my-dataset' + (i === 1 ? '' : i))
    }
  })

  it('Upload new dataset with pre-filled attributes', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    const form = new FormData()
    form.append('title', 'A dataset with pre-filled title')
    form.append('publications', '[{"catalog": "test", "status": "waiting"}]')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
    assert.equal(res.data.title, 'A dataset with pre-filled title')
  })

  it('Upload new dataset with defined id', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    let form = new FormData()
    form.append('title', 'my title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    let res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.title, 'my title')
    assert.equal(res.data.id, 'my-dataset-id')
    await workers.hook('finalizer/my-dataset-id')
    form = new FormData()
    form.append('title', 'my other title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 200)
  })

  it('Reject some other pre-filled attributes', async () => {
    const ax = await global.ax.builder('dmeadus0@answers.com:passwd')
    const form = new FormData()
    form.append('id', 'pre-filling ig is not possible')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    try {
      await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form, 'KWqAGZ4mG') })
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('Fail to upload new dataset when not authenticated', async () => {
    const ax = await global.ax.builder()
    const form = new FormData()
    try {
      await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 401)
    }
  })

  it('Upload dataset - full test with webhooks', async () => {
    const wsCli = new WebSocket(config.publicUrl)
    const ax = await global.ax.builder('cdurning2@desdev.cn:passwd')
    await ax.put('/api/v1/settings/user/cdurning2', { webhooks: [{ title: 'test', events: ['dataset-finalize-end'], target: { type: 'http', params: { url: 'http://localhost:5900' } } }] })
    let form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    const webhook = await eventToPromise(notifier, 'webhook')
    res = await ax.get(webhook.href + '/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.0.0')
    const datasetId = webhook.href.split('/').pop()
    // testing journal, updating data and then journal length again
    wsCli.send(JSON.stringify({ type: 'subscribe', channel: 'datasets/' + datasetId + '/journal' }))
    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')

    // Send again the data to the same dataset
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 9)
    form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    res = await ax.post(webhook.href, form, { headers: testUtils.formHeaders(form) })

    assert.equal(res.status, 200)
    const wsRes = await eventToPromise(wsCli, 'message')

    assert.equal(JSON.parse(wsRes.data).channel, 'datasets/' + datasetId + '/journal')
    await eventToPromise(notifier, 'webhook')
    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')

    assert.equal(res.data.length, 18)
    // testing permissions
    const ax1 = await global.ax.builder('dmeadus0@answers.com:passwd')
    try {
      await ax1.get(webhook.href)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    const ax2 = await global.ax.builder()
    try {
      await ax2.get(webhook.href)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    // Updating schema
    res = await ax.get(webhook.href)
    const schema = res.data.schema
    schema.find(field => field.key === 'lat')['x-refersTo'] = 'http://schema.org/latitude'
    schema.find(field => field.key === 'lon')['x-refersTo'] = 'http://schema.org/longitude'
    await ax.patch(webhook.href, { schema: schema })
    await eventToPromise(notifier, 'webhook')

    // Delete the dataset
    res = await ax.delete('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 204)
    try {
      await ax.get('/api/v1/datasets/' + datasetId)
    } catch (err) {
      assert.equal(err.status, 404)
    }
  })
})
