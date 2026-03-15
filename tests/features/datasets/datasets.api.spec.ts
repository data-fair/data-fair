import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, config, mockUrl } from '../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError, setupMockRoute, clearMockRoutes } from '../../support/workers.ts'
import { TestEventClient } from '../../support/events.ts'
import fs from 'fs-extra'
import FormData from 'form-data'

const anonymous = axios()
const dmeadus = await axiosAuth('dmeadus0@answers.com')
const dmeadusOrg = await axiosAuth('dmeadus0@answers.com', 'passwd', 'KWqAGZ4mG')
const alone = await axiosAuth('alone@no.org')
const ngernier4Org = await axiosAuth('ngernier4@usa.gov', 'passwd', 'KWqAGZ4mG')

const datasetFd = fs.readFileSync('./test-it/resources/datasets/dataset1.csv')

test.describe('datasets', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await checkPendingTasks()
  })

  test('Get datasets when not authenticated', async () => {
    const ax = anonymous
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  test('Get datasets when authenticated', async () => {
    const ax = await alone
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  test('Search and apply some params (facets, raw, count, select, etc)', async () => {
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

  test('Failure to upload dataset exceeding limit', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', Buffer.alloc(160000), 'largedataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 413)
  })

  test('Failure to upload multiple datasets exceeding limit', async () => {
    const ax = dmeadus
    let form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForDatasetError(ax, res.data.id)

    form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset2.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 429)
  })

  test('Upload new dataset in user zone', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'user')
    assert.equal(res.data.owner.id, 'dmeadus0')
    assert.equal(res.data.previews.length, 1)
    assert.equal(res.data.previews[0].id, 'table')
    assert.equal(res.data.previews[0].title, 'Tableau')
    assert.ok(res.data.previews[0].href.endsWith(`/embed/dataset/${res.data.id}/table`))
    assert.equal(res.data.updatedAt, res.data.createdAt)
    assert.equal(res.data.updatedAt, res.data.dataUpdatedAt)
    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.file.encoding, 'UTF-8')
    assert.equal(dataset.count, 2)

    // get simple stats
    res = await ax.get('/api/v1/stats')
    assert.equal(res.status, 200)
    assert.ok(res.data.limits.store_bytes.limit > 0)
  })

  test('Upload new dataset in user zone with title', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    form.append('title', 'My title\'')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, 'my-title')
    assert.equal(res.data.title, 'My title\'')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset with utf8 filename', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, '1-Réponse N° 1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, '1-reponse-n-1')
    assert.equal(res.data.title, '1 Réponse N° 1')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset in organization zone', async () => {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset in organization zone with explicit department', async () => {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    form.append('body', JSON.stringify({ owner: { type: 'organization', id: 'KWqAGZ4mG', name: 'Fivechat', department: 'dep1' } }))
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'KWqAGZ4mG')
    assert.equal(res.data.owner.department, 'dep1')
    await waitForFinalize(ax, res.data.id)
  })

  test('Uploading same file twice should increment slug', async () => {
    const ax = dmeadusOrg
    for (const i of [1, 2, 3]) {
      const form = new FormData()
      form.append('file', datasetFd, 'my-dataset.csv')
      const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
      assert.equal(res.status, 201)
      assert.equal(res.data.slug, 'my-dataset' + (i === 1 ? '' : '-' + i))
      await waitForFinalize(ax, res.data.id)
    }
  })

  test('Upload new dataset with pre-filled attributes', async () => {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('title', 'A dataset with pre-filled title')
    form.append('publications', '[{"catalog": "test", "status": "waiting"}]')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.data.title, 'A dataset with pre-filled title')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset with JSON body', async () => {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('body', JSON.stringify({ title: 'A dataset with both file and JSON body' }))
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.data.title, 'A dataset with both file and JSON body')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset with defined id', async () => {
    const ax = dmeadus
    let form = new FormData()
    form.append('title', 'my title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    let res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.title, 'my title')
    assert.equal(res.data.id, 'my-dataset-id')
    await waitForFinalize(ax, 'my-dataset-id')
    form = new FormData()
    form.append('title', 'my other title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    res = await ax.post('/api/v1/datasets/my-dataset-id', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 200)
    await waitForFinalize(ax, 'my-dataset-id')
  })

  test('Reject some not URL friendly id', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('title', 'my title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/my dataset id', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 400)
  })

  test('Reject some other pre-filled attributes', async () => {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('id', 'pre-filling id is not possible')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 400)
  })

  test('Fail to upload new dataset when not authenticated', async () => {
    const ax = anonymous
    const form = new FormData()
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 401)
  })

  // TODO: requires notifier, WebSocket, webhooks
  test.skip('Upload dataset - full test with webhooks', async () => {
  })

  test('Upload dataset and update with different file name', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets/dataset-name', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'dataset-name')
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.ok(res.data.store_bytes.consumption > 150)
    assert.ok(res.data.store_bytes.consumption < 300)

    const form2 = new FormData()
    form2.append('file', datasetFd, 'dataset-name2.csv')
    res = await ax.put('/api/v1/datasets/dataset-name', form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    const dataset = await waitForFinalize(ax, 'dataset-name')
    assert.equal(dataset.originalFile.name, 'dataset-name2.csv')
    assert.equal(dataset.file.name, 'dataset-name2.csv')
    assert.equal(dataset.updatedAt, dataset.dataUpdatedAt)
    assert.notEqual(dataset.updatedAt, dataset.createdAt)
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.ok(res.data.store_bytes.consumption > 150)
    assert.ok(res.data.store_bytes.consumption < 300)
  })

  test('Upload new dataset and detect types', async () => {
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

  test('Upload dataset and update it\'s data and schema', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets/dataset-name', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'dataset-name')
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
    res = await ax.post('/api/v1/datasets/dataset-name', form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    await waitForFinalize(ax, 'dataset-name')
    res = await ax.get('/api/v1/datasets/dataset-name')
    assert.equal(res.data.schema.filter(f => f['x-transform']).length, 6)
  })

  test('Sort datasets by title', async () => {
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

  test('Upload new dataset and specify encoding', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    form.append('file_encoding', 'ISO-8859-1')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    let dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.file.explicitEncoding, 'ISO-8859-1')
    assert.equal(dataset.file.encoding, 'ISO-8859-1')

    const form2 = new FormData()
    form2.append('file', datasetFd, 'dataset1.csv')
    form2.append('file_encoding', 'ISO-8859-2')
    await ax.post('/api/v1/datasets/' + dataset.id, form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } })
    dataset = await waitForFinalize(ax, dataset.id)
    assert.equal(dataset.file.explicitEncoding, 'ISO-8859-2')
    assert.equal(dataset.file.encoding, 'ISO-8859-2')
  })

  test('should create thumbnails for datasets with illustrations', async () => {
    const ax = dmeadus
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
    await setupMockRoute({ path: '/avatar.jpg', status: 200, bodyBase64: fs.readFileSync('./test-it/resources/avatar.jpeg').toString('base64'), contentType: 'image/jpeg' })
    await setupMockRoute({ path: '/wikipedia.gif', status: 200, bodyBase64: fs.readFileSync('./test-it/resources/wikipedia.gif').toString('base64'), contentType: 'image/gif' })

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
    const ax = dmeadus
    await setupMockRoute({ path: '/dataset-image.jpg', status: 200, bodyBase64: fs.readFileSync('./test-it/resources/avatar.jpeg').toString('base64'), contentType: 'image/jpeg' })

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
  })

  test('should create thumbnails from attachments', async () => {
    const ax = dmeadusOrg
    const form = new FormData()
    form.append('attachmentsAsImage', 'true')
    form.append('dataset', fs.readFileSync('./test-it/resources/datasets/attachments.csv'), 'attachments.csv')
    form.append('attachments', fs.readFileSync('./test-it/resources/datasets/files.zip'), 'files.zip')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() }, params: { draft: true } })
    let dataset = await waitForFinalize(ax, res.data.id)
    assert.ok(dataset.draft.schema.some((field: any) => field.key === '_attachment_url' && field['x-refersTo'] === 'http://schema.org/image'))
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { thumbnail: true, draft: true } })
    const thumbnail1 = res.data.results[0]._thumbnail
    await assert.rejects(ax.get(res.data.results[0]._thumbnail, { maxRedirects: 0 }), (err: any) => err.status === 302)
    await assert.rejects(anonymous.get(res.data.results[0]._thumbnail), (err: any) => err.status === 403)
    assert.ok(thumbnail1.startsWith(`${config.publicUrl}/api/v1/datasets/${dataset.id}/thumbnail/`))

    // remove attachmentsAsImage
    dataset = (await ax.patch(`/api/v1/datasets/${dataset.id}`, { attachmentsAsImage: null }, { params: { draft: true } })).data
    assert.ok(dataset.schema.some((field: any) => field.key === '_attachment_url' && field['x-refersTo'] === undefined))
  })

  test('Use an api key defined on the dataset', async () => {
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
  test('anitivirus reject upload of infected file in dataset', async () => {
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

  test('Calculate enum of values in data', async () => {
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
    const dataset = await waitForFinalize(ax, 'rest2')
    const attr1 = dataset.schema.find(p => p.key === 'attr1')
    assert.deepEqual(attr1.enum, ['test2', 'test1'])

    // cardinality too close to line count
    const attr2 = dataset.schema.find(p => p.key === 'attr2')
    assert.equal(attr2.enum, undefined)
    // too sparse
    const attr3 = dataset.schema.find(p => p.key === 'attr3')
    assert.equal(attr3.enum, undefined)
  })

  test('Create simple meta only datasets', async () => {
    const ax = dmeadus

    const res = await ax.post('/api/v1/datasets', { isMetaOnly: true, title: 'a meta only dataset' })
    assert.equal(res.status, 201)
    const dataset = res.data
    assert.equal(dataset.slug, 'a-meta-only-dataset')

    await ax.patch(`/api/v1/datasets/${dataset.id}`, { title: 'a meta only dataset 2' })
  })

  test('relative path in dataset file name', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), '../dataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const dataset = await waitForFinalize(ax, res.data.id)
    assert.equal(dataset.file.name, 'dataset1.csv')
  })

  test('relative path in dataset id', async () => {
    const ax = dmeadus
    const form = new FormData()
    form.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), 'dataset1.csv')
    form.append('id', '../dataset1')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 400)

    const form2 = new FormData()
    form2.append('file', fs.readFileSync('./test-it/resources/datasets/dataset1.csv'), 'dataset1.csv')
    await assert.rejects(ax.post('/api/v1/datasets/' + encodeURIComponent('../dataset1'), form2, { headers: { 'Content-Length': form2.getLengthSync(), ...form2.getHeaders() } }), (err: any) => err.status === 404)
  })

  test('relative path in attachment name', async () => {
    // Send dataset
    const datasetFd = fs.readFileSync('./test-it/resources/datasets/files.zip')
    const form = new FormData()
    form.append('dataset', datasetFd, 'files.zip')
    const ax = dmeadus
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
    const ax = dmeadusOrg
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
    } finally {
      events.close()
    }
  })
})
