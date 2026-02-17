import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, anonymous, superadmin, cdurning2 } from './utils/index.ts'
import path from 'node:path'
import { readFileSync } from 'node:fs'

const geocoderApi = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../test/resources/geocoder-api.json'), 'utf8'))

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
    const ax1 = cdurning2
    await assert.rejects(ax1.patch('/api/v1/remote-services/' + eaId, { title: 'Test external api' }), { status: 403 })
    await assert.rejects(ax1.delete('/api/v1/remote-services/' + eaId), { status: 403 })
    res = await ax.delete('/api/v1/remote-services/' + eaId)
    assert.equal(res.status, 204)
    res = await ax.get('/api/v1/remote-services')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  it('Unknown external service', async function () {
    const ax = anonymous
    await assert.rejects(ax.get('/api/v1/remote-services/unknownId'), { status: 404 })
  })

  it('Unknown referer', async function () {
    const ax = anonymous
    await assert.rejects(ax.get('/api/v1/remote-services/geocoder-koumoul/proxy/coords', { headers: { referer: 'https://test.com' } }), { status: 404 })
  })
})
