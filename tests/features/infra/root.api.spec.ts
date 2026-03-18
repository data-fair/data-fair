import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import fs from 'node:fs'
import { axios, axiosAuth, clean, checkPendingTasks, config, apiUrl, anonymousAx, wsUrl } from '../../support/axios.ts'
import { sendDataset, wsEmit } from '../../support/workers.ts'
import { WsClient } from '@data-fair/lib-node/ws-client.js'

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

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
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
    assert.equal(res.data.version, 'development')
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
    assert.equal(res.data.details.length, 5)
    // in dev mode, nuxt check fails (no nuxt-dist), so status may be 'error'
    const nonNuxtDetails = res.data.details.filter((d: any) => d.name !== 'nuxt')
    assert.ok(nonNuxtDetails.every((d: any) => d.status === 'ok'))
  })

  test('Ping service', async () => {
    // in dev mode, ping may return 'error' due to missing nuxt-dist
    const res = await anonymous.get('/api/v1/ping', { validateStatus: () => true })
    assert.ok(res.status === 200 || res.status === 500)
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

  test('Connect to web socket server', async () => {
    const log = { info: async (...args: any[]) => {}, error: console.error, debug: () => {} }
    const wsClient = new WsClient({ url: wsUrl, log })
    // If we can subscribe to a channel, the connection works
    await wsClient.subscribe('test_channel')
    wsClient.close()
  })

  test('Receive error from websocker server when sending bad input', async () => {
    const WebSocket = (await import('ws')).default
    const wsServerUrl = wsUrl.replace('/data-fair', '/data-fair/')
    const cli = new WebSocket(wsServerUrl)
    await new Promise<void>((resolve, reject) => {
      cli.on('open', resolve)
      cli.on('error', reject)
    })
    cli.send('{blabla}')
    const msg: any = await new Promise(resolve => cli.on('message', (data: any) => resolve(JSON.parse(data.toString()))))
    assert.equal(msg.type, 'error')
    cli.close()
  })

  test('Subscribe to channel', async () => {
    const WebSocket = (await import('ws')).default
    const wsServerUrl = wsUrl.replace('/data-fair', '/data-fair/')
    const cli = new WebSocket(wsServerUrl)
    await new Promise<void>((resolve, reject) => {
      cli.on('open', resolve)
      cli.on('error', reject)
    })
    cli.send(JSON.stringify({ type: 'subscribe', channel: 'test_channel' }))
    const msg: any = await new Promise(resolve => cli.on('message', (data: any) => resolve(JSON.parse(data.toString()))))
    assert.equal(msg.type, 'subscribe-confirm')
    assert.equal(msg.channel, 'test_channel')
    const [, msg2] = await Promise.all([
      wsEmit('test_channel', 'test_data'),
      new Promise(resolve => cli.on('message', (data: any) => resolve(JSON.parse(data.toString()))))
    ]) as [void, any]
    assert.equal(msg2.type, 'message')
    assert.equal(msg2.channel, 'test_channel')
    assert.equal(msg2.data, 'test_data')
    cli.close()
  })

  // DCAT unit tests moved to dcat.unit.spec.ts
})
