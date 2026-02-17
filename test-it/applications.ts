import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, anonymous } from './utils/index.ts'

describe('Applications', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get applications when not authenticated', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 0)
  })

  it('Access an unknown applicationId on proxy endpoint', async function () {
    const ax = anonymous
    await assert.rejects(ax.get('/app/unknownId'), { status: 404 })
  })

  it('Post an application configuration, read it, update it and delete it', async function () {
    const ax = dmeadus
    let res = await ax.post('/api/v1/applications', { url: 'http://monapp1.com/' })
    assert.equal(res.status, 201)

    const appId = res.data.id
    res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    assert.ok(res.data.count >= 1)
    res = await ax.get('/api/v1/applications/' + appId)
    assert.equal(res.data.url, 'http://monapp1.com/')
    res = await ax.get('/api/v1/applications/' + appId + '/api-docs.json')
    assert.ok(res.data.openapi)
    res = await ax.get('/api/v1/applications/' + appId + '/config')
    assert.equal(res.status, 200)
    res = await ax.patch('/api/v1/applications/' + appId, { title: 'Test application config' })
    assert.equal(res.status, 200)
    assert.equal(res.data.title, 'Test application config')
    res = await ax.delete('/api/v1/applications/' + appId)
    assert.equal(res.status, 204)
    res = await ax.get('/api/v1/applications')
    assert.equal(res.status, 200)
    const app = res.data.results.find((a: any) => a.id === appId)
    assert.equal(app, undefined)
  })
})
