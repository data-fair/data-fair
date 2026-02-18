import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset, formHeaders, timeout } from './utils/index.ts'
import fs from 'fs-extra'
import FormData from 'form-data'
import eventPromise from '@data-fair/lib-utils/event-promise.js'
import WebSocket from 'ws'
import config from 'config'
import * as workers from '../api/src/workers/index.ts'
import { validate } from 'tableschema'
import filesStorage from '@data-fair/data-fair-api/src/files-storage/index.ts'
import { dataDir } from '@data-fair/data-fair-api/src/datasets/utils/files.ts'

const anonymous = getAxios()
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')
const alone = await getAxiosAuth('alone@no.org', 'passwd')

const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')

let notifier

describe('datasets', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  before(async function () {
    notifier = (await import('./resources/app-notifier.js')).default
    await eventPromise(notifier, 'listening')
  })

  it('Get datasets when not authenticated', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Get datasets when authenticated', async function () {
    const ax = await alone
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Search and apply some params (facets, raw, count, select, etc)', async function () {
    const ax = dmeadus
    const axOrg = dmeadusOrg

    let res = await ax.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count' } })
    assert.equal(res.data.count, 0)
    assert.equal(res.data.sums.count, 0)
    assert.equal(res.data.facets.owner.length, 0)
    assert.equal(res.data.facets['field-type'].length, 0)

    // 1 dataset in user zone
    await sendDataset('datasets/dataset1.csv', ax)
    // 2 datasets in organization zone
    await sendDataset('datasets/dataset1.csv', axOrg)
    await sendDataset('datasets/dataset1.csv', axOrg)

    res = await ax.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count' } })
    assert.equal(res.data.count, 1)
    assert.equal(res.data.facets.owner.length, 1)
    assert.equal(res.data.facets.owner[0].count, 1)
    assert.equal(res.data.facets.owner[0].value.id, 'dmeadus0')
    assert.equal(res.data.facets.owner[0].value.type, 'user')
    assert.equal(res.data.facets['field-type'].length, 4)
    assert.equal(res.data.facets['field-type'][0].count, 1)
    assert.equal(res.data.sums.count, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count' } })
    assert.equal(res.data.count, 3)
    assert.equal(res.data.facets.owner.length, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.owner.length, 2)
    // owner facet is not affected by the owner filter
    assert.equal(res.data.facets.owner[0].count, 2)
    assert.equal(res.data.facets.owner[0].value.id, 'KWqAGZ4mG')
    assert.equal(res.data.facets.owner[0].value.type, 'organization')
    // field-type facet is affected by the owner filter
    assert.equal(res.data.facets['field-type'].length, 4)
    assert.equal(res.data.facets['field-type'][0].count, 2)
    assert.equal(res.data.sums.count, 4)

    res = await axOrg.get('/api/v1/datasets', { params: { count: false } })
    assert.equal(res.data.count, undefined)

    res = await axOrg.get('/api/v1/datasets', { params: { raw: true, select: 'count', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.equal(res.data.results[0].owner, undefined)
    assert.equal(res.data.results[0].count, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { select: '-userPermissions', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.deepEqual(res.data.results[0].owner, { id: 'KWqAGZ4mG', name: 'Fivechat', type: 'organization' })
    res = await axOrg.get('/api/v1/datasets', { params: { select: '-userPermissions,-owner', owner: 'organization:KWqAGZ4mG' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.deepEqual(res.data.results[0].owner, undefined)
  })

  it('Failure to upload dataset exceeding limit', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', Buffer.alloc(160000), 'largedataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 413)
  })

  it('Failure to upload multiple datasets exceeding limit', async function () {
    const ax = dmeadus
    let form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    await assert.rejects(workers.hook('finalize/' + res.data.id))

    form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset2.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 429)
  })

  it('Upload new dataset in user zone', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'user')
    assert.equal(res.data.owner.id, 'dmeadus0')
    assert.equal(res.data.previews.length, 1)
    assert.equal(res.data.previews[0].id, 'table')
    assert.equal(res.data.previews[0].title, 'Tableau')
    assert.ok(res.data.previews[0].href.endsWith(`/embed/dataset/${res.data.id}/table`))
    assert.equal(res.data.updatedAt, res.data.createdAt)
    assert.equal(res.data.updatedAt, res.data.dataUpdatedAt)
    const dataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(dataset.file.encoding, 'UTF-8')
    assert.equal(dataset.count, 2)
  })

  it('Upload new dataset in user zone with title', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    form.append('title', 'My title\'')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'my-title')
    assert.equal(res.data.title, 'My title\'')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset with utf8 filename', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, '1-Réponse N° 1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, '1-reponse-n-1')
    assert.equal(res.data.title, '1 Réponse N° 1')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset in organization zone', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset in organization zone with explicit department', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    form.append('body', JSON.stringify({ owner: { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat', department: 'dep1' } }))
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
    assert.equal(res.data.owner.department, 'dep1')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Uploading same file twice should increment slug', async function () {
    const ax = dmeadusOrg
    for (const i of [1, 2, 3]) {
      const form = new FormData()
      form.append('file', datasetFd, 'my-dataset.csv')
      const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
      assert.equal(res.status, 201)
      assert.equal(res.data.slug, 'my-dataset' + (i === 1 ? '' : '-' + i))
      await workers.hook('finalize/' + res.data.id)
    }
  })

  it('Upload new dataset with pre-filled attributes', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('title', 'A dataset with pre-filled title')
    form.append('publications', '[{"catalog": "test", "status": "waiting"}]')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.data.title, 'A dataset with pre-filled title')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset with JSON body', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('body', JSON.stringify({ title: 'A dataset with both file and JSON body' }))
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.data.title, 'A dataset with both file and JSON body')
    await workers.hook('finalize/' + res.data.id)
  })

  it('Upload new dataset with defined id', async function () {
    const ax = dmeadus
    let form = new FormData()
    form.append('title', 'my title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    let res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    assert.equal(res.data.title, 'my title')
    assert.equal(res.data.id, 'my-dataset-id')
    await workers.hook('finalize/my-dataset-id')
    form = new FormData()
    form.append('title', 'my other title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: formHeaders(form) })
    assert.equal(res.status, 200)
    await workers.hook('finalize/my-dataset-id')
  })

  it('Reject some not URL friendly id', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('title', 'my title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/my dataset id', form, { headers: formHeaders(form) }), (err: any) => err.status === 400)
  })

  it('Reject some other pre-filled attributes', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('id', 'pre-filling id is not possible')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 400)
  })

  it('Fail to upload new dataset when not authenticated', async function () {
    const ax = anonymous
    const form = new FormData()
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 401)
  })

  it('Upload dataset - full test with webhooks', async function () {
    const wsCli = new WebSocket(config.publicUrl)
    const ax = cdurning2
    await ax.put('/api/v1/settings/user/cdurning2', { webhooks: [{ title: 'test', events: ['dataset-finalize-end'], target: { type: 'http', params: { url: 'http://localhost:5900' } } }] })
    let form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)

    const webhook = await timeout(eventPromise(notifier, 'webhook'), 5000, 'webhook not received')
    res = await ax.get(webhook.href + '/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
    res = await ax.post('/api/v1/_check-api', res.data)
    const datasetId = webhook.href.split('/').pop()

    // testing journal, updating data and then journal length again
    wsCli.send(JSON.stringify({ type: 'subscribe', channel: 'datasets/' + datasetId + '/journal' }))
    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 2)

    // Send again the data to the same dataset
    form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    res = await ax.post(webhook.href, form, { headers: formHeaders(form) })

    assert.equal(res.status, 200)
    const wsRes = await timeout(eventPromise(wsCli, 'message'), 1000, 'ws message not received')

    assert.equal(JSON.parse(wsRes).channel, 'datasets/' + datasetId + '/journal')
    await timeout(eventPromise(notifier, 'webhook'), 2000, 'second webhook not received')
    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')

    assert.equal(res.data.length, 5)
    // testing permissions
    await assert.rejects(dmeadus.get(webhook.href), (err: any) => err.status === 403)
    await assert.rejects(anonymous.get(webhook.href), (err: any) => err.status === 403)

    // Updating schema
    res = await ax.get(webhook.href)

    const schema = res.data.schema
    schema.find(field => field.key === 'lat')['x-refersTo'] = 'http://schema.org/latitude'
    schema.find(field => field.key === 'lon')['x-refersTo'] = 'http://schema.org/longitude'
    res = await ax.patch(webhook.href, { schema })

    assert.ok(res.data.dataUpdatedAt > res.data.createdAt)
    assert.ok(res.data.updatedAt > res.data.dataUpdatedAt)

    await timeout(eventPromise(notifier, 'webhook'), 4000, 'third webhook not received')

    res = await ax.get('/api/v1/datasets/' + datasetId + '/schema?mimeType=application/tableschema%2Bjson')
    const { valid } = await validate(res.data)
    assert.equal(valid, true)
    // Delete the dataset
    res = await ax.delete('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 204)
    await assert.rejects(ax.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 404)
  })

  it('Upload dataset and update with different file name', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets/dataset-name', form, { headers: formHeaders(form) })
    await workers.hook('finalize/dataset-name')
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.ok(res.data.store_bytes.consumption > 150)
    assert.ok(res.data.store_bytes.consumption < 300)
    let dataFiles = await filesStorage.lsr(dataDir + '/user/dmeadus0/datasets/dataset-name/data-files/')
    assert.deepEqual(dataFiles, ['dataset-name.csv'])

    const form2 = new FormData()
    form2.append('file', datasetFd, 'dataset-name2.csv')
    res = await ax.put('/api/v1/datasets/dataset-name', form2, { headers: formHeaders(form2) })
    const dataset = await workers.hook('finalize/dataset-name')
    assert.equal(dataset.originalFile.name, 'dataset-name2.csv')
    assert.equal(dataset.file.name, 'dataset-name2.csv')
    assert.equal(dataset.updatedAt, dataset.dataUpdatedAt)
    assert.notEqual(dataset.updatedAt, dataset.createdAt)
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.ok(res.data.store_bytes.consumption > 150)
    assert.ok(res.data.store_bytes.consumption < 300)
    dataFiles = await filesStorage.lsr(dataDir + '/user/dmeadus0/datasets/dataset-name/data-files/')
    assert.deepEqual(dataFiles, ['dataset-name2.csv'])
  })

  it('Upload new dataset and detect types', async function () {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset-types.csv', ax)
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

  it('Upload dataset and update it\'s data and schema', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets/dataset-name', form, { headers: formHeaders(form) })
    await workers.hook('finalize/dataset-name')
    res = await ax.get('/api/v1/datasets/dataset-name')
    const schema = res.data.schema.filter(f => !f['x-calculated'])
    schema.forEach(f => {
      delete f.enum
      delete f['x-cardinality']
      f['x-transform'] = { type: 'string' }
      f.type = 'string'
      delete f.format
    })
    const form2 = new FormData()
    form2.append('file', datasetFd, 'dataset-name.csv')
    form2.append('schema', JSON.stringify(schema))
    res = await ax.post('/api/v1/datasets/dataset-name', form2, { headers: formHeaders(form2) })
    await workers.hook('finalize/dataset-name')
    res = await ax.get('/api/v1/datasets/dataset-name')
    assert.equal(res.data.schema.filter(f => f['x-transform']).length, 6)
  })

  it('Sort datasets by title', async function () {
    const ax = dmeadus

    for (const title of ['aa', 'bb', 'àb', ' àb', '1a']) {
      await ax.post('/api/v1/datasets', { isRest: true, title })
    }

    let res = await ax.get('/api/v1/datasets', { params: { select: 'title', raw: true, sort: 'title:1' } })
    assert.deepEqual(res.data.results.map(d => d.title), ['1a', 'aa', 'àb', 'àb', 'bb'])
    res = await ax.get('/api/v1/datasets', { params: { select: 'id,title', raw: true, sort: 'title:-1' } })
    assert.deepEqual(res.data.results.map(d => d.title), ['bb', 'àb', 'àb', 'aa', '1a'])

    // manage slug unicity
    await ax.patch('/api/v1/datasets/' + res.data.results[0].id, { slug: 'test-slug' })
    await assert.rejects(ax.patch('/api/v1/datasets/' + res.data.results[1].id, { slug: 'test-slug' }), (error: any) => {
      assert.equal(error.status, 400)
      assert.ok(error.data.includes('Ce slug est déjà utilisé'))
      return true
    })
    res = await ax.post('/api/v1/datasets', { isRest: true, title: 'test slug 2', slug: 'test-slug' })
    assert.equal(res.data.slug, 'test-slug-2')
  })

  it('Upload new dataset and specify encoding', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    form.append('file_encoding', 'ISO-8859-1')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    let dataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(dataset.file.explicitEncoding, 'ISO-8859-1')
    assert.equal(dataset.file.encoding, 'ISO-8859-1')

    const form2 = new FormData()
    form2.append('file', datasetFd, 'dataset1.csv')
    form2.append('file_encoding', 'ISO-8859-2')
    await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: formHeaders(form2) })
    dataset = await workers.hook('finalize/' + dataset.id)
    assert.equal(dataset.file.explicitEncoding, 'ISO-8859-2')
    assert.equal(dataset.file.encoding, 'ISO-8859-2')
  })
})
