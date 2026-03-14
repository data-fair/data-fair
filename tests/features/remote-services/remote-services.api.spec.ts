import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { axios, axiosAuth, clean, checkPendingTasks, mockAppUrl } from '../../support/axios.ts'
import { setupMockRoute, clearMockRoutes } from '../../support/workers.ts'

const anonymous = axios()
const superadmin = await axiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const cdurning2 = await axiosAuth('cdurning2@desdev.cn')

const geocoderApi = JSON.parse(readFileSync(path.resolve('./test-it/resources/geocoder-api.json'), 'utf8'))

test.describe('remote-services', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await clearMockRoutes()
    await checkPendingTasks()
  })

  test('Get external APIs when not authenticated', async () => {
    const ax = anonymous
    const res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  test('Post a minimal external API, read it, update it and delete it', async () => {
    const ax = superadmin
    geocoderApi.info['x-api-id'] = 'geocoder2'
    let res = await ax.post('/api/v1/remote-services', { apiDoc: geocoderApi, apiKey: { in: 'header', name: 'x-apiKey' }, public: true })
    assert.equal(res.status, 201)
    const eaId = res.data.id
    res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    res = await ax.get('/api/v1/remote-services/' + eaId + '/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
    res = await ax.get('/api/v1/remote-services/' + eaId)
    assert.equal(res.data.apiDoc.info['x-api-id'], 'geocoder2')
    res = await ax.patch('/api/v1/remote-services/' + eaId, { title: 'Test external api' })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'Test external api')
    // Permissions
    const ax1 = cdurning2
    await assert.rejects(
      ax1.patch('/api/v1/remote-services/' + eaId, { title: 'Test external api' }),
      { status: 403 }
    )
    await assert.rejects(
      ax1.delete('/api/v1/remote-services/' + eaId),
      { status: 403 }
    )
    // We delete the entity
    res = await ax.delete('/api/v1/remote-services/' + eaId)
    assert.equal(res.status, 204)
    res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  test('Unknown external service', async () => {
    const ax = anonymous
    await assert.rejects(
      ax.get('/api/v1/remote-services/unknownId'),
      { status: 404 }
    )
  })

  test('Unknown referer', async () => {
    const ax = anonymous
    // unknown referer is not rejected by the server (only a warning is logged)
    // but the request should still go through for public remote services
    const res = await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coords', { headers: { referer: 'https://test.com' } })
    assert.equal(res.status, 200)
  })

  test('Handle timeout errors from proxied service', async () => {
    const ax = superadmin

    // Register a mock route with a 60s delay to trigger the proxy timeout
    await setupMockRoute({
      path: '/geocoder/coord',
      status: 200,
      body: { content: 'ok' },
      delay: 60000
    })

    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data

    await assert.rejects(
      ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord', { headers: { referer: app.exposedUrl } }),
      { status: 504 }
    )
  })

  test('Prevent abusing remote service re-exposition', async () => {
    const ax = superadmin

    // it is necessary to create an application, only applications are allowed to use remote-services' proxies
    const app = (await ax.post('/api/v1/applications', { url: mockAppUrl('monapp1') })).data

    // Register a custom response for the geocoder coord endpoint
    await setupMockRoute({
      path: '/geocoder/coord',
      status: 200,
      body: { content: 'ok' }
    })
    const res = await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord', { headers: { referer: app.exposedUrl } })
    assert.equal(res.data.content, 'ok')

    await assert.rejects(
      ax.post('/api/v1/remote-services/geocoder-koumoul/proxy/coords', null, { headers: { referer: app.exposedUrl } }),
      { status: 405 }
    )
  })

  test('Get unpacked actions inside remote services', async () => {
    const ax = anonymous
    let res = await ax.get('/api/v1/remote-services-actions')
    assert.equal(res.data.results.length, 4)
    assert.ok(res.data.results.find((item: any) => item.id === 'geocoder-koumoul--getCoord'))
    assert.ok(res.data.results.find((item: any) => item.id === 'geocoder-koumoul--postCoords'))

    res = await ax.get('/api/v1/remote-services-actions?inputCollection=false')
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.results.find((item: any) => item.id === 'geocoder-koumoul--getCoord'))

    res = await ax.get('/api/v1/remote-services-actions?inputCollection=false&q=geocoder')
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.results.find((item: any) => item.id === 'geocoder-koumoul--getCoord'))

    res = await ax.get('/api/v1/remote-services-actions', { params: { 'output-concepts': 'http://www.datatourisme.fr/ontology/core/1.0#apeNaf' } })
    assert.equal(res.data.results.length, 2)
    res = await ax.get('/api/v1/remote-services-actions', { params: { 'output-concepts': 'codeAPE' } })
    assert.equal(res.data.results.length, 2)
  })
})
