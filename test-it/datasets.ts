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
import nock from 'nock'
import testEvents from '@data-fair/data-fair-api/src/misc/utils/test-events.ts'

const anonymous = getAxios()
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const dmeadusOrg = await getAxiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')
const alone = await getAxiosAuth('alone@no.org', 'passwd')
const ngernier4Org = await getAxiosAuth('ngernier4@usa.gov', 'passwd', 'KWqAGZ4mG')

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
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
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

    // get simple stats
    res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    assert.ok(res.data.limits.store_bytes.limit > 0)
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

  it('should create thumbnails for datasets with illustrations', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/datasets/thumbnails1', {
      isRest: true,
      title: 'thumbnails1',
      attachmentsAsImage: true,
      schema: [{ key: 'desc', type: 'string' }, { key: 'imageUrl', type: 'string', 'x-refersTo': 'http://schema.org/image' }]
    })
    res = await ax.post('/api/v1/datasets/thumbnails1/_bulk_lines', [
      { imageUrl: 'http://test-thumbnail.com/image.png', desc: '1 image' },
      { imageUrl: 'http://test-thumbnail.com/avatar.jpg', desc: '2 avatar' },
      { imageUrl: 'http://test-thumbnail.com/wikipedia.gif', desc: '3 wikipedia animated' }
    ])
    await workers.hook('finalize/thumbnails1')
    res = await ax.get('/api/v1/datasets/thumbnails1/lines', { params: { thumbnail: true, select: 'desc', sort: 'desc' } })
    assert.equal(res.data.results.length, 3)
    assert.equal(res.data.results[0].desc, '1 image')
    assert.equal(res.data.results[1].desc, '2 avatar')
    assert.equal(res.data.results[2].desc, '3 wikipedia animated')
    assert.ok(res.data.results[0]._thumbnail.endsWith('width=300&height=200'))
    const nockScope = nock('http://test-thumbnail.com')
      .get('/image.png').reply(200, () => '')
      .get('/avatar.jpg').reply(200, () => fs.readFileSync('./test-it/resources/avatar.jpeg'))
      .get('/wikipedia.gif').reply(200, () => fs.readFileSync('./test-it/resources/wikipedia.gif'))
      .persist()
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err: any) => err.status === 302)
    const thumbres = await ax.get(res.data.results[1]._thumbnail)
    assert.equal(thumbres.headers['content-type'], 'image/png')
    assert.equal(thumbres.headers['x-thumbnails-cache-status'], 'MISS')
    assert.equal(thumbres.headers['cache-control'], 'must-revalidate, private, max-age=0')

    const thumbresGif = await ax.get(res.data.results[2]._thumbnail)
    assert.equal(thumbresGif.headers['content-type'], 'image/webp')
    assert.equal(thumbresGif.headers['x-thumbnails-cache-status'], 'MISS')
    assert.equal(thumbresGif.headers['cache-control'], 'must-revalidate, private, max-age=0')
    nockScope.done()
  })

  it('should create thumbnail for the image metadata of a dataset', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/datasets/thumbnail', {
      isRest: true,
      title: 'thumbnail',
      image: 'http://test-thumbnail.com/dataset-image.jpg'
    })
    await ax.put('/api/v1/datasets/thumbnail/permissions', [{ classes: ['read'] }])
    let res = await ax.get('/api/v1/datasets/thumbnail')
    assert.ok(res.data.thumbnail)
    const nockScope = nock('http://test-thumbnail.com')
      .get('/dataset-image.jpg').reply(200, () => fs.readFileSync('./test-it/resources/avatar.jpeg'))
    res = await ax.get(res.data.thumbnail)
    assert.equal(res.headers['content-type'], 'image/png')
    assert.equal(res.headers['x-thumbnails-cache-status'], 'MISS')
    nockScope.done()
  })

  // keep this test skipped most of the time as it depends on an outside service
  it.skip('should provide a redirect for an unsupported image format', async function () {
    const ax = dmeadus
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

  it('should create thumbnails from attachments', async function () {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form), params: { draft: true } })
    let dataset = await workers.hook('finalize/' + res.data.id)
    assert.ok(dataset.draft.schema.some((field) => field.key === '_attachment_url' && field['x-refersTo'] === 'http://schema.org/image'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true } })
    const thumbnail1 = res.data.results[0]._thumbnail
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err: any) => err.status === 302)
    await assert.rejects(anonymous.get(res.data.results[0]._thumbnail), (err: any) => err.status === 403)
    assert.ok(thumbnail1.startsWith(`${config.publicUrl}/api/v1/datasets/${dataset.id}/thumbnail/`))

    const portal = { type: 'data-fair-portals', id: 'portal1', url: `http://localhost:${process.env.NGINX_PORT2}` }
    await ax.post('/api/v1/settings/organization/KWqAGZ4mG/publication-sites', portal)

    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true }, headers: { host: `localhost:${process.env.NGINX_PORT2}` } })
    assert.equal(thumbnail1.replace('localhost:' + process.env.NGINX_PORT1, `localhost:${process.env.NGINX_PORT2}`), res.data.results[0]._thumbnail)

    // remove attachmentsAsImage
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { attachmentsAsImage: null }, { params: { draft: true } })).data
    assert.ok(dataset.schema.some((field) => field.key === '_attachment_url' && field['x-refersTo'] === undefined))
  })

  it('Use an api key defined on the dataset', async function () {
    const ax = dmeadus
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
  it('anitivirus reject upload of infected file in dataset', async function () {
    const ax = dmeadus
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

  it('Calculate enum of values in data', async function () {
    const ax = dmeadus
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
    const dataset = await workers.hook('finalize/rest2')
    const attr1 = dataset.schema.find(p => p.key === 'attr1')
    assert.deepEqual(attr1.enum, ['test2', 'test1'])

    // cardinality too close to line count
    const attr2 = dataset.schema.find(p => p.key === 'attr2')
    assert.equal(attr2.enum, undefined)
    // too sparse
    const attr3 = dataset.schema.find(p => p.key === 'attr3')
    assert.equal(attr3.enum, undefined)
  })

  it('Create simple meta only datasets', async function () {
    const ax = dmeadus

    const res = await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'a meta only dataset' })
    assert.equal(res.status, 201)
    const dataset = res.data
    assert.equal(dataset.slug, 'a-meta-only-dataset')

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { title: 'a meta only dataset 2' })
  })

  it('relative path in dataset file name', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), '../dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    const dataset = await workers.hook('finalize/' + res.data.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
  })

  it('relative path in dataset id', async function () {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('id', '../dataset1')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 400)

    const form2 = new FormData()
    form2.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), 'dataset1.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + encodeURIComponent('../dataset1'), form2, { headers: formHeaders(form2) }), (err: any) => err.status === 404)
  })

  it('relative path in attachment name', async function () {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = dmeadus
    const res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    const dataset = await workers.hook('finalize/' + res.data.id)
    const attachmentRes = await ax.get(`/api/v1/datasets/${dataset.id}/attachments/test.odt`)
    assert.equal(attachmentRes.status, 200)
    const attachmentHackRes1 = await ax.get(`/api/v1/datasets/${dataset.id}/attachments//test.odt`)
    assert.equal(attachmentHackRes1.headers['content-length'], attachmentRes.headers['content-length'])
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/~/test.odt`), (err: any) => err.status === 404)
    await assert.rejects(ax.get(`/api/v1/datasets/${dataset.id}/attachments/${encodeURIComponent('../files.zip')}`), (err: any) => err.status === 404)
  })

  it('send user notification', async function () {
    const ax = dmeadusOrg
    const dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'user notif 1',
      schema: [{ key: 'str', type: 'string' }]
    })).data

    // listen to all notifications
    const notifications = []
    testEvents.on('notification', (n) => notifications.push(n))

    await assert.rejects(ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { title: 'Title' }), (err: any) => err.status === 400)

    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [])

    await ax.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    assert.equal(notifications.length, 1)
    assert.equal(notifications[0].title, 'Title')
    assert.ok(notifications[0].topic.key.endsWith(':topic1'))
    assert.equal(notifications[0].visibility, 'private')

    await assert.rejects(ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' }), (err: any) => err.status === 403)
    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
      { type: 'user', id: 'ngernier4', operations: ['sendUserNotification'] }
    ])
    await ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    await assert.rejects(ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' }), (err: any) => err.status === 403)

    await ax.put(`/api/v1/datasets/${dataset.id}/permissions`, [
      { type: 'user', id: 'ngernier4', operations: ['sendUserNotification', 'sendUserNotificationPublic'] }
    ])
    await ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title' })
    await ngernier4Org.post(`/api/v1/datasets/${dataset.id}/user-notification`, { topic: 'topic1', title: 'Title', visibility: 'public' })
  })
})
