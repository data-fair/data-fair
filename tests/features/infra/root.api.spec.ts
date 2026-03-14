import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { axios, axiosAuth, clean, checkPendingTasks, config, apiUrl, anonymousAx } from '../../support/axios.ts'
import { sendDataset } from '../../support/workers.ts'

const anonymous = axios()
const superadmin = await axiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const dmeadus = await axiosAuth('dmeadus0@answers.com')
const superadminPersonal = await axiosAuth('superadmin@test.com', 'superpasswd')
const icarlens9 = await axiosAuth('icarlens9@independent.co.uk')

const geocoderApi = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, '../../../test-it/resources/geocoder-api.json'), 'utf8'))

test.describe('root', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await checkPendingTasks()
  })

  test('Get API documentation', async () => {
    const ax = anonymous
    const res = await ax.get('/api/v1/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
  })

  test('Get vocabulary', async () => {
    const ax = anonymous
    const res = await ax.get('/api/v1/vocabulary')
    assert.equal(res.status, 200)
  })

  test('Get service info', async () => {
    const ax = superadmin
    const res = await ax.get('/api/v1/admin/info')
    assert.equal(res.status, 200)
    assert.equal(res.data.version, 'test')
  })

  test('Check API format', async () => {
    const ax = dmeadus
    const apiDoc = { ...geocoderApi }
    const res = await ax.post('/api/v1/_check-api', apiDoc)
    assert.equal(res.status, 200)
    delete apiDoc.openapi
    await assert.rejects(
      ax.post('/api/v1/_check-api', apiDoc),
      { status: 400 }
    )
  })

  test('serves streamsaver resources', async () => {
    const ax = anonymous
    const mitm = await ax.get('/streamsaver/mitm.html')
    assert.equal(mitm.status, 200)
    assert.equal(mitm.headers['content-type'], 'text/html; charset=utf-8')
    assert.ok(mitm.data.includes('mitm.html is the lite "man in the middle"'))

    const sw = await ax.get('/streamsaver/sw.js')
    assert.equal(sw.status, 200)
    assert.equal(sw.headers['content-type'], 'text/javascript; charset=utf-8')
    assert.ok(sw.data.includes('self.onmessage'))
  })

  test('Get status', async () => {
    await assert.rejects(anonymous.get('/api/v1/admin/status'), (err: any) => err.status === 401)
    await assert.rejects(superadminPersonal.get('/api/v1/admin/status'), (err: any) => err.status === 403)
    const res = await superadmin.get('/api/v1/admin/status')
    assert.equal(res.status, 200)
    assert.equal(res.data.status, 'ok')
    assert.equal(res.data.details.length, 6)
  })

  test('Ping service', async () => {
    const res = await anonymous.get('/api/v1/ping')
    assert.equal(res.status, 200)
    assert.equal(res.data, 'ok')
  })

  test('Check identities secret key', async () => {
    const ax = anonymous
    await assert.rejects(
      ax.post('/api/v1/identities/user/test', { name: 'Another Name' }, { params: { key: 'bad key' } }),
      { status: 403 }
    )
  })

  test('Propagate name change to a dataset owner identity', async () => {
    const ax = dmeadus
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Danna Meadus')
    let res = await ax.post(`/api/v1/identities/user/${dataset.owner.id}`, { name: 'Another Name' }, { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    res = await ax.get(`/api/v1/datasets/${dataset.id}`)
    assert.equal(res.data.owner.name, 'Another Name')
  })

  test('Delete an identity completely', async () => {
    const ax = icarlens9
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    assert.equal(dataset.owner.name, 'Issie Carlens')

    // check that the user directory exists via test-env endpoint
    let fileExistsRes = await anonymousAx.get(`${apiUrl}/api/v1/test-env/file-exists`, { params: { path: 'user/icarlens9' } })
    assert.ok(fileExistsRes.data.exists)

    const res = await ax.delete('/api/v1/identities/user/icarlens9', { params: { key: config.secretKeys.identities } })
    assert.equal(res.status, 200)
    await assert.rejects(
      ax.get(`/api/v1/datasets/${dataset.id}`),
      { status: 404 }
    )

    fileExistsRes = await anonymousAx.get(`${apiUrl}/api/v1/test-env/file-exists`, { params: { path: 'user/icarlens9' } })
    assert.ok(!fileExistsRes.data.exists)
  })

  // WebSocket tests skipped - they test wsServer internals that require in-process access
  test.skip('Connect to web socket server', async () => {
    // requires in-process WebSocket and wsEmitter access
  })

  test.skip('Receive error from websocker server when sending bad input', async () => {
    // requires in-process WebSocket and wsEmitter access
  })

  test.skip('Subscribe to channel', async () => {
    // requires in-process WebSocket and wsEmitter access
  })

  test.skip('Send lots of events', async () => {
    // requires in-process WebSocket and wsEmitter access
  })

  // DCAT tests skipped - they require importing internal API modules (dcatNormalize, dcatValidate)
  test.skip('DCAT should preserve serialization of a valid example', async () => {
    // requires internal dcatNormalize and dcatValidate imports
  })

  test.skip('Read a XML+RDF DCAT export', async () => {
    // requires internal dcatNormalize and dcatValidate imports
  })

  test.skip('Validate a DCAT example with different serialization', async () => {
    // requires internal dcatNormalize and dcatValidate imports
  })
})
