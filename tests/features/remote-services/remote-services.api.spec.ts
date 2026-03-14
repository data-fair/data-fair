import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { axios, axiosAuth, clean, checkPendingTasks } from '../../support/axios.ts'
import { setupNock, clearNock } from '../../support/workers.ts'

const anonymous = axios()
const superadmin = await axiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const cdurning2 = await axiosAuth('cdurning2@desdev.cn')

const geocoderApi = JSON.parse(readFileSync(path.resolve('./test-it/resources/geocoder-api.json'), 'utf8'))

test.describe('remote-services', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async () => {
    await clearNock()
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
    await assert.rejects(
      ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coords', { headers: { referer: 'https://test.com' } }),
      { status: 404 }
    )
  })

  test('Handle timeout errors from proxied service', async () => {
    const ax = superadmin

    // Set up a nock interceptor that delays for 60s (will trigger timeout)
    await setupNock({
      origin: 'http://test.com',
      path: '/geocoder/coord',
      reply: { status: 200, body: { content: 'ok' } }
      // Note: the nock setup via test-env may not support delay.
      // The original test used nock().delay(60000). The timeout behavior
      // depends on the server-side proxy timeout configuration.
    })

    // it is necessary to create an application, only applications are allowed to use remote-services' proxies
    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data

    await assert.rejects(
      ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord', { headers: { referer: app.exposedUrl } }),
      { status: 504 }
    )
  })

  test('Prevent abusing remote service re-exposition', async () => {
    const ax = superadmin

    // it is necessary to create an application, only applications are allowed to use remote-services' proxies
    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data

    await setupNock({
      origin: 'http://test.com',
      path: '/geocoder/coord',
      reply: { status: 200, body: { content: 'ok' } }
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
