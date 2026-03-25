import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axios, axiosAuth, clean, checkPendingTasks, mockUrl } from '../../../support/axios.ts'
import { waitForFinalize, sendDataset, waitForDatasetError, setupMockRoute, clearMockRoutes, getMockReceivedRequests } from '../../../support/workers.ts'
import { collectWsEvents } from '../../../support/events.ts'
import fs from 'fs-extra'
import FormData from 'form-data'
import { validate } from 'tableschema'

const anonymous = axios()
const testUser1 = await axiosAuth('test_user1@test.com')
const testUser1Org = await axiosAuth('test_user1@test.com', 'test_org1')
const testUser3 = await axiosAuth('test_user3@test.com')

const datasetFd = fs.readFileSync('./tests/resources/datasets/dataset1.csv')

test.describe('datasets - upload', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Get datasets when not authenticated', async () => {
    const ax = anonymous
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  test('Get datasets when authenticated', async () => {
    const ax = await axiosAuth('test_alone@test.com')
    const res = await ax.get('/api/v1/datasets')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  test('Search and apply some params (facets, raw, count, select, etc)', async () => {
    const ax = testUser1
    const axOrg = testUser1Org

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
    assert.equal(res.data.facets.owner[0].value.id, 'test_user1')
    assert.equal(res.data.facets.owner[0].value.type, 'user')
    assert.equal(res.data.facets['field-type'].length, 4)
    assert.equal(res.data.facets['field-type'][0].count, 1)
    assert.equal(res.data.sums.count, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count' } })
    assert.equal(res.data.count, 3)
    assert.equal(res.data.facets.owner.length, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { facets: 'owner,field-type', sums: 'count', owner: 'organization:test_org1' } })
    assert.equal(res.data.count, 2)
    assert.equal(res.data.facets.owner.length, 2)
    // owner facet is not affected by the owner filter
    assert.equal(res.data.facets.owner[0].count, 2)
    assert.equal(res.data.facets.owner[0].value.id, 'test_org1')
    assert.equal(res.data.facets.owner[0].value.type, 'organization')
    // field-type facet is affected by the owner filter
    assert.equal(res.data.facets['field-type'].length, 4)
    assert.equal(res.data.facets['field-type'][0].count, 2)
    assert.equal(res.data.sums.count, 4)

    res = await axOrg.get('/api/v1/datasets', { params: { count: false } })
    assert.equal(res.data.count, undefined)

    res = await axOrg.get('/api/v1/datasets', { params: { raw: true, select: 'count', owner: 'organization:test_org1' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.equal(res.data.results[0].owner, undefined)
    assert.equal(res.data.results[0].count, 2)

    res = await axOrg.get('/api/v1/datasets', { params: { select: '-userPermissions', owner: 'organization:test_org1' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.deepEqual(res.data.results[0].owner, { id: 'test_org1', name: 'Test Org 1', type: 'organization' })
    res = await axOrg.get('/api/v1/datasets', { params: { select: '-userPermissions,-owner', owner: 'organization:test_org1' } })
    assert.equal(res.data.results[0].userPermissions, undefined)
    assert.deepEqual(res.data.results[0].owner, undefined)
  })

  test('Failure to upload dataset exceeding limit', async () => {
    const ax = testUser1
    const form = new FormData()
    form.append('file', Buffer.alloc(160000), 'largedataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 413)
  })

  test('Failure to upload multiple datasets exceeding limit', async () => {
    const ax = testUser1
    let form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForDatasetError(ax, res.data.id)

    form = new FormData()
    form.append('file', Buffer.alloc(110000), 'largedataset2.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 429)
  })

  test('Upload new dataset in user zone', async () => {
    const ax = testUser1
    const form = new FormData()
    form.append('file', datasetFd, 'dataset1.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'user')
    assert.equal(res.data.owner.id, 'test_user1')
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
    const ax = testUser1
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
    const ax = testUser1
    const form = new FormData()
    form.append('file', datasetFd, '1-Réponse N° 1.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.slug, '1-reponse-n-1')
    assert.equal(res.data.title, '1 Réponse N° 1')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset in organization zone', async () => {
    const ax = testUser1Org
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'test_org1')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset in organization zone with explicit department', async () => {
    const ax = testUser1Org
    const form = new FormData()
    form.append('file', datasetFd, 'dataset2.csv')
    form.append('body', JSON.stringify({ owner: { type: 'organization', id: 'test_org1', name: 'Test Org 1', department: 'dep1' } }))
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    assert.equal(res.data.owner.type, 'organization')
    assert.equal(res.data.owner.id, 'test_org1')
    assert.equal(res.data.owner.department, 'dep1')
    await waitForFinalize(ax, res.data.id)
  })

  test('Uploading same file twice should increment slug', async () => {
    const ax = testUser1Org
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
    const ax = testUser1Org
    const form = new FormData()
    form.append('title', 'A dataset with pre-filled title')
    form.append('publications', '[{"catalog": "test", "status": "waiting"}]')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.data.title, 'A dataset with pre-filled title')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset with JSON body', async () => {
    const ax = testUser1Org
    const form = new FormData()
    form.append('body', JSON.stringify({ title: 'A dataset with both file and JSON body' }))
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    const res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.data.title, 'A dataset with both file and JSON body')
    await waitForFinalize(ax, res.data.id)
  })

  test('Upload new dataset with defined id', async () => {
    const ax = testUser1
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
    const ax = testUser1
    const form = new FormData()
    form.append('title', 'my title')
    form.append('file', datasetFd, 'yet-a-dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets/my dataset id', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 400)
  })

  test('Reject some other pre-filled attributes', async () => {
    const ax = testUser1Org
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

  test('Upload dataset - full test with webhooks', async () => {
    const ax = testUser3

    // Set up mock route to accept webhook POSTs
    await setupMockRoute({ path: '/webhook', status: 200, body: { ok: true } })

    // Configure webhook for dataset-finalize-end events
    await ax.put('/api/v1/settings/user/test_user3', {
      webhooks: [{
        title: 'test',
        events: ['dataset-finalize-end'],
        target: { type: 'http', params: { url: `${mockUrl}/webhook` } }
      }]
    })

    // Upload a CSV file
    let form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    const datasetId = res.data.id

    // Wait for finalize and verify first webhook received
    await waitForFinalize(ax, datasetId)
    let received = await getMockReceivedRequests()
    assert.equal(received.length, 1, 'should have received first webhook')
    assert.equal(received[0].body.event, 'finalize-end')
    assert.ok(received[0].body.href.includes(datasetId))

    // Verify API docs
    res = await ax.get(`/api/v1/datasets/${datasetId}/api-docs.json`)
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
    res = await ax.post('/api/v1/_check-api', res.data)

    // Testing journal
    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')
    assert.equal(res.status, 200)
    assert.equal(res.data.length, 2)

    // Subscribe to WS journal events before re-uploading
    const wsCollector = collectWsEvents('datasets/' + datasetId + '/journal')

    // Send again the data to the same dataset
    form = new FormData()
    form.append('file', fs.readFileSync('./tests/resources/datasets/Antennes du CD22.csv'), 'Antennes du CD22.csv')
    res = await ax.post('/api/v1/datasets/' + datasetId, form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 200)

    // Wait for second finalize
    await waitForFinalize(ax, datasetId)

    // Verify WS journal events were received
    await new Promise(resolve => setTimeout(resolve, 300))
    assert.ok(wsCollector.events.length > 0, 'should have received WS journal events')
    wsCollector.stop()

    // Verify second webhook
    received = await getMockReceivedRequests()
    assert.equal(received.length, 2, 'should have received second webhook')

    res = await ax.get('/api/v1/datasets/' + datasetId + '/journal')
    assert.equal(res.data.length, 5)

    // Testing permissions
    await assert.rejects(testUser1.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)
    await assert.rejects(anonymous.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 403)

    // Updating schema
    res = await ax.get('/api/v1/datasets/' + datasetId)
    const schema = res.data.schema
    schema.find((field: any) => field.key === 'lat')['x-refersTo'] = 'http://schema.org/latitude'
    schema.find((field: any) => field.key === 'lon')['x-refersTo'] = 'http://schema.org/longitude'
    res = await ax.patch('/api/v1/datasets/' + datasetId, { schema })

    assert.ok(res.data.dataUpdatedAt > res.data.createdAt)
    assert.ok(res.data.updatedAt > res.data.dataUpdatedAt)

    // Wait for third finalize and verify third webhook
    await waitForFinalize(ax, datasetId)
    received = await getMockReceivedRequests()
    assert.equal(received.length, 3, 'should have received third webhook')

    // Validate tableschema
    res = await ax.get('/api/v1/datasets/' + datasetId + '/schema?mimeType=application/tableschema%2Bjson')
    const { valid } = await validate(res.data)
    assert.equal(valid, true)

    // Delete the dataset
    res = await ax.delete('/api/v1/datasets/' + datasetId)
    assert.equal(res.status, 204)
    await assert.rejects(ax.get('/api/v1/datasets/' + datasetId), (err: any) => err.status === 404)

    await clearMockRoutes()
  })

  test('Upload dataset and update with different file name', async () => {
    const ax = testUser1
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets/dataset-name', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'dataset-name')
    res = await ax.get('/api/v1/limits/user/test_user1')
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
    res = await ax.get('/api/v1/limits/user/test_user1')
    assert.ok(res.data.store_bytes.consumption > 150)
    assert.ok(res.data.store_bytes.consumption < 300)
  })

  test('Upload new dataset and detect types', async () => {
    const ax = testUser1
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
    const ax = testUser1
    const form = new FormData()
    form.append('file', datasetFd, 'dataset-name.csv')
    let res = await ax.post('/api/v1/datasets/dataset-name', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForFinalize(ax, 'dataset-name')
    res = await ax.get('/api/v1/datasets/dataset-name')
    const schema = res.data.schema.filter((f: any) => !f['x-calculated'])
    schema.forEach((f: any) => {
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
    assert.equal(res.data.schema.filter((f: any) => f['x-transform']).length, 6)
  })

  test('Sort datasets by title', async () => {
    const ax = testUser1

    for (const title of ['aa', 'bb', 'àb', ' àb', '1a']) {
      await ax.post('/api/v1/datasets', { isRest: true, title })
    }

    let res = await ax.get('/api/v1/datasets', { params: { select: 'title', raw: true, sort: 'title:1' } })
    assert.deepEqual(res.data.results.map((d: any) => d.title), ['1a', 'aa', 'àb', 'àb', 'bb'])
    res = await ax.get('/api/v1/datasets', { params: { select: 'id,title', raw: true, sort: 'title:-1' } })
    assert.deepEqual(res.data.results.map((d: any) => d.title), ['bb', 'àb', 'àb', 'aa', '1a'])

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
    const ax = testUser1
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
})
