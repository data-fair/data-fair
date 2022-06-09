const assert = require('assert').strict
const fs = require('fs-extra')
const FormData = require('form-data')
const eventToPromise = require('event-to-promise')
const WebSocket = require('ws')
const config = require('config')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

const { validate } = require('tableschema')

let notifier
describe('datasets', () => {
  before('prepare notifier', async () => {
    notifier = require('./resources/app-notifier.js')
    await eventToPromise(notifier, 'listening')
  })

  it('Get datasets when not authenticated', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Get datasets when authenticated', async () => {
    const ax = await global.ax.alone
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Get datasets with special param as super admin', async () => {
    const ax = await global.ax.alone
    try {
      await ax.get('/api/v1/datasets', { params: { showAll: true } })
    } catch (err) {
      assert.equal(err.status, 400)
    }
    const axAdmin = global.ax.alban
    const res = await axAdmin.get('/api/v1/datasets', { params: { showAll: true } })
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Search and apply facets', async () => {
    const ax = global.ax.dmeadus
    const axOrg = global.ax.dmeadusOrg

    // 1 dataset in user zone
    await testUtils.sendDataset('datasets/dataset1.csv', ax)
    // 2 datasets in organization zone
    await testUtils.sendDataset('datasets/dataset1.csv', axOrg)
    await testUtils.sendDataset('datasets/dataset1.csv', axOrg)

    let res = await ax.get('/api/v1/datasets', { params: { facets: 'owner,field-type' } })
    assert.equal(res.data.count, 1)
    assert.equal(res.data.facets.owner.length, 1)
    assert.equal(res.data.facets.owner[0].count, 1)
    assert.equal(res.data.facets.owner[0].value.id, 'dmeadus0')
    assert.equal(res.data.facets.owner[0].value.type, 'user')
    assert.equal(res.data.facets['field-type'].length, 2)
    assert.equal(res.data.facets['field-type'][0].count, 1)

    res = await axOrg.get('/api/v1/datasets', { params: { facets: 'owner,field-type' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.owner.length, 1)
    // owner facet is not affected by the owner filter
    assert.equal(res.data.facets.owner[0].count, 2)
    assert.equal(res.data.facets.owner[0].value.id, 'KWqAGZ4mG')
    assert.equal(res.data.facets.owner[0].value.type, 'organization')
    // field-type facet is affected by the owner filter
    assert.equal(res.data.facets['field-type'].length, 2)
    assert.equal(res.data.facets['field-type'][0].count, 2)
  })

  const datasetFd = fs.readFileSync('./test/resources/datasets/dataset1.csv')

  it('Failure to upload dataset exceeding limit', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', Buffer.alloc(160000), 'largedataset.csv')
    try {
      await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 413)
    }
  })

  it('Failure to upload multiple datasets exceeding limit', async () => {
    const ax = global.ax.dmeadus
    let form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset1.csv')
    await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })

    form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset2.csv')
    try {
      await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 429)
    }
  })

  it('Upload new dataset in user zone', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'user')
    assert.equal(res.data.owner.id, 'dmeadus0')
    assert.equal(res.data.file.encoding, 'UTF-8')
    assert.equal(res.data.previews.length, 1)
    assert.equal(res.data.previews[0].id, 'table')
    assert.equal(res.data.previews[0].title, 'Tableau')
    assert.ok(res.data.previews[0].href.endsWith('/embed/dataset/dataset1/table'))
    assert.equal(res.data.updatedAt, res.data.createdAt)
    assert.equal(res.data.updatedAt, res.data.dataUpdatedAt)
    await workers.hook('finalizer/' + res.data.id)
  })

  it('Upload new dataset in user zone with title', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    form.append('title', 'My title\'')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.id, 'my-title')
    assert.equal(res.data.title, 'My title\'')
    await workers.hook('finalizer/' + res.data.id)
  })

  it('Upload new dataset in organization zone', async () => {
    const ax = global.ax.dmeadusOrg
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
    await workers.hook('finalizer/' + res.data.id)
  })

  it('Uploading same file twice should increment id', async () => {
    const ax = global.ax.dmeadusOrg
    for (const i of [1, 2, 3]) {
      const form = new FormData()
      form.append('file', datasetFd, 'my-dataset.csv')
      const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.equal(res.status, 201)
      assert.equal(res.data.id, 'my-dataset' + (i === 1 ? '' : i))
      await workers.hook('finalizer/' + res.data.id)
    }
  })

  it('Upload new dataset with pre-filled attributes', async () => {
    const ax = global.ax.dmeadusOrg
    const form = new FormData()
    form.append('title', 'A dataset with pre-filled title')
    form.append('publications', '[{"catalog": "test", "status": "waiting"}]')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.data.title, 'A dataset with pre-filled title')
    await workers.hook('finalizer/' + res.data.id)
  })

  it('Upload new dataset with JSON body', async () => {
    const ax = global.ax.dmeadusOrg
    const form = new FormData()
    form.append('body', JSON.stringify({ title: 'A dataset with both file and JSON body', publications: [{ catalog: 'test', status: 'waiting' }] }))
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.data.title, 'A dataset with both file and JSON body')
    await workers.hook('finalizer/' + res.data.id)
  })

  it('Upload new dataset with defined id', async () => {
    const ax = global.ax.dmeadus
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
    await workers.hook('finalizer/my-dataset-id')
  })

  it('Reject some not URL friendly id', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('title', 'my title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/my dataset id', form, { headers: testUtils.formHeaders(form) }), err => err.status === 400)
  })

  it('Reject some other pre-filled attributes', async () => {
    const ax = global.ax.dmeadusOrg
    const form = new FormData()
    form.append('id', 'pre-filling id is not possible')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    try {
      await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('Fail to upload new dataset when not authenticated', async () => {
    const ax = global.ax.anonymous
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
    const ax = global.ax.cdurning2
    await ax.put('/api/v1/settings/user/cdurning2', { webhooks: [{ title: 'test', events: ['dataset-finalize-end'], target: { type: 'http', params: { url: 'http://localhost:5900' } } }] })
    let form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    const webhook = await testUtils.timeout(eventToPromise(notifier, 'webhook'), 1000, 'webhook not received')
    res = await ax.get(webhook.href + '/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.0.0')
    res = await ax.post('/api/v1/_check-api', res.data)
    const datasetId = webhook.href.split('/').pop()

    // testing journal, updating data and then journal length again
    wsCli.send(JSON.stringify({ type: 'subscribe', channel: 'datasets/' + datasetId + '/journal' }))
    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 7)

    // Send again the data to the same dataset
    form = new FormData()
    form.append('file', fs.readFileSync('./test/resources/datasets/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    res = await ax.post(webhook.href, form, { headers: testUtils.formHeaders(form) })

    assert.equal(res.status, 200)
    const wsRes = await testUtils.timeout(eventToPromise(wsCli, 'message'), 1000, 'ws message not received')

    assert.equal(JSON.parse(wsRes.data).channel, 'datasets/' + datasetId + '/journal')
    await testUtils.timeout(eventToPromise(notifier, 'webhook'), 1000, 'second webhook not received')
    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')

    assert.equal(res.data.length, 14)
    // testing permissions
    const ax1 = global.ax.dmeadus
    try {
      await ax1.get(webhook.href)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    const ax2 = global.ax.anonymous
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
    res = await ax.patch(webhook.href, { schema: schema })
    assert.ok(res.data.dataUpdatedAt > res.data.createdAt)
    assert.ok(res.data.updatedAt > res.data.dataUpdatedAt)

    await testUtils.timeout(eventToPromise(notifier, 'webhook'), 4000, 'third webhook not received')

    res = await ax.get('/api/v1/datasets/' + datasetId + '/schema?mimeType=application/tableschema%2Bjson')
    const { valid } = await validate(res.data)
    assert.equal(valid, true)
    // Delete the dataset
    res = await ax.delete('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 204)
    try {
      await ax.get('/api/v1/datasets/' + datasetId)
    } catch (err) {
      assert.equal(err.status, 404)
    }
  })

  it('Upload dataset and update with different file name', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    await workers.hook('finalizer/dataset-name')
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.data.store_bytes.consumption, 151)
    assert.deepEqual(await fs.readdir('data/test/user/dmeadus0/datasets/dataset-name/'), ['dataset-name.csv'])

    const form2 = new FormData()
    form2.append('file', datasetFd, 'dataset-name2.csv')
    res = await ax.put('/api/v1/datasets/dataset-name', form2, { headers: testUtils.formHeaders(form2) })
    assert.equal(res.data.originalFile.name, 'dataset-name2.csv')
    assert.equal(res.data.file.name, 'dataset-name2.csv')
    const dataset = await workers.hook('finalizer/dataset-name')
    assert.equal(dataset.updatedAt, dataset.dataUpdatedAt)
    assert.notEqual(dataset.updatedAt, dataset.createdAt)
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.data.store_bytes.consumption, 151)
    assert.deepEqual(await fs.readdir('data/test/user/dmeadus0/datasets/dataset-name/'), ['dataset-name2.csv'])
  })

  it('Upload new dataset in user zone then change ownership to organization', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)

    try {
      await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
        type: 'organization',
        id: 'anotherorg',
        name: 'Test'
      })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    try {
      await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
        type: 'user',
        id: 'anotheruser',
        name: 'Test'
      })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }

    await ax.put(`/api/v1/datasets/${dataset.id}/owner`, {
      type: 'organization',
      id: 'KWqAGZ4mG',
      name: 'Fivechat'
    })

    try {
      await ax.get(`/api/v1/datasets/${dataset.id}`)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 403)
    }
    await global.ax.dmeadusOrg.get(`/api/v1/datasets/${dataset.id}`)
  })

  it('Upload new dataset and detect types', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset-types.csv', ax)
    assert.equal(dataset.schema[0].key, 'string1')
    assert.equal(dataset.schema[0].type, 'string')

    assert.equal(dataset.schema[1].key, 'bool1')
    assert.equal(dataset.schema[1].type, 'boolean')

    assert.equal(dataset.schema[2].key, 'bool2')
    assert.equal(dataset.schema[2].type, 'boolean')

    assert.equal(dataset.schema[3].key, 'bool3')
    assert.equal(dataset.schema[3].type, 'boolean')

    assert.equal(dataset.schema[4].key, 'string2')
    assert.equal(dataset.schema[4].type, 'string')

    assert.equal(dataset.schema[5].key, 'number1')
    assert.equal(dataset.schema[5].type, 'integer')

    assert.equal(dataset.schema[6].key, 'number2')
    assert.equal(dataset.schema[6].type, 'integer')

    assert.equal(dataset.schema[7].key, 'number3')
    assert.equal(dataset.schema[7].type, 'number')
  })

  it('Upload dataset and update it\'s data and schema', async () => {
    const ax = global.ax.dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    await workers.hook('finalizer/dataset-name')
    res = await ax.get('/api/v1/datasets/dataset-name')
    const schema = res.data.schema.filter(f => !f['x-calculated'])
    schema.forEach(f => {
      delete f.enum
      delete f['x-cardinality']
      f.ignoreDetection = true
      f.type = 'string'
      delete f.format
    })
    const form2 = new FormData()
    form2.append('file', datasetFd, 'dataset-name.csv')
    form2.append('schema', JSON.stringify(schema))
    res = await ax.post('/api/v1/datasets/dataset-name', form2, { headers: testUtils.formHeaders(form2) })
    await workers.hook('finalizer/dataset-name')
    res = await ax.get('/api/v1/datasets/dataset-name')
    assert.equal(res.data.schema.filter(f => f.ignoreDetection).length, 4)
  })
})
