import { strict as assert } from 'node:assert'
import path from 'node:path'
import { readFileSync } from 'node:fs'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks } from './utils/index.ts'

const geocoderApi = JSON.parse(readFileSync(path.resolve(import.meta.dirname, '../test/resources/geocoder-api.json'), 'utf8'))

describe('root', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach(function () { checkPendingTasks(this.name) })

  it('Get API documentation', async function () {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/api-docs.json')
    assert.equal(res.status, 200)
    assert.equal(res.data.openapi, '3.1.0')
  })

  it('Get vocabulary', async function () {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/vocabulary')
    assert.equal(res.status, 200)
  })

  it('Get service info', async function () {
    const ax = global.ax.superadmin
    const res = await ax.get('/api/v1/admin/info')
    assert.equal(res.status, 200)
    assert.equal(res.data.version, 'test')
  })

  it('Check API format', async function () {
    const ax = global.ax.dmeadus
    const res = await ax.post('/api/v1/_check-api', geocoderApi)
    assert.equal(res.status, 200)
    delete geocoderApi.openapi
    try {
      await ax.post('/api/v1/_check-api', geocoderApi)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 400)
    }
  })

  it('serves streamsaver resources', async function () {
    const ax = global.ax.anonymous
    const mitm = await ax.get('/streamsaver/mitm.html')
    assert.equal(mitm.status, 200)
    assert.equal(mitm.headers['content-type'], 'text/html; charset=utf-8')
    assert.ok(mitm.data.includes('mitm.html is the lite "man in the middle"'))

    const sw = await ax.get('/streamsaver/sw.js')
    assert.equal(sw.status, 200)
    assert.equal(sw.headers['content-type'], 'text/javascript; charset=utf-8')
    assert.ok(sw.data.includes('self.onmessage'))
  })
})
