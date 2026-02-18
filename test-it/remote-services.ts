import { strict as assert } from 'node:assert'
import nock from 'nock'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxios, getAxiosAuth, sendDataset } from './utils/index.ts'

const anonymous = getAxios()
const superadmin = await getAxiosAuth('superadmin@test.com', 'superpasswd', undefined, true)
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const cdurning2 = await getAxiosAuth('cdurning2@desdev.cn', 'passwd')

const geocoderApi = JSON.parse(readFileSync(path.join(import.meta.dirname, '/resources/geocoder-api.json'), 'utf8'))

describe('remote-services', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get external APIs when not authenticated', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  it('Post a minimal external API, read it, update it and delete it', async function () {
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

  it('Unknown external service', async function () {
    const ax = anonymous
    await assert.rejects(
      ax.get('/api/v1/remote-services/unknownId'),
      { status: 404 }
    )
  })

  it('Unknown referer', async function () {
    const ax = anonymous
    await assert.rejects(
      ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coords', { headers: { referer: 'https://test.com' } }),
      { status: 404 }
    )
  })

  it('Handle timeout errors from proxied service', async function () {
    const ax = superadmin

    // it is necessary to create an application, only applications are allowed to use remote-services' proxies
    nock('http://test.com').get('/geocoder/coord').delay(60000).reply(200, { content: 'ok' })
    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data

    await assert.rejects(
      ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord', { headers: { referer: app.exposedUrl } }),
      { status: 504 }
    )
  })

  it('Prevent abusing remote service re-exposition', async function () {
    const ax = superadmin

    // it is necessary to create an application, only applications are allowed to use remote-services' proxies
    const app = (await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })).data

    const nockScope = nock('http://test.com').get('/geocoder/coord').reply(200, { content: 'ok' })
    const res = await ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coord', { headers: { referer: app.exposedUrl } })
    assert.equal(res.data.content, 'ok')

    nockScope.done()
    await assert.rejects(
      ax.post('/api/v1/remote-services/geocoder-koumoul/proxy/coords', null, { headers: { referer: app.exposedUrl } }),
      { status: 405 }
    )
  })

  it('Get unpacked actions inside remote services', async function () {
    const ax = anonymous
    let res = await ax.get('/api/v1/remote-services-actions')
    assert.equal(res.data.results.length, 4)
    assert.ok(res.data.results.find(item => item.id === 'geocoder-koumoul--getCoord'))
    assert.ok(res.data.results.find(item => item.id === 'geocoder-koumoul--postCoords'))

    res = await ax.get('/api/v1/remote-services-actions?inputCollection=false')
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.results.find(item => item.id === 'geocoder-koumoul--getCoord'))

    res = await ax.get('/api/v1/remote-services-actions?inputCollection=false&q=geocoder')
    assert.equal(res.data.results.length, 1)
    assert.ok(res.data.results.find(item => item.id === 'geocoder-koumoul--getCoord'))

    res = await ax.get('/api/v1/remote-services-actions', { params: { 'output-concepts': 'http://www.datatourisme.fr/ontology/core/1.0#apeNaf' } })
    assert.equal(res.data.results.length, 2)
    res = await ax.get('/api/v1/remote-services-actions', { params: { 'output-concepts': 'codeAPE' } })
    assert.equal(res.data.results.length, 2)
  })
})
