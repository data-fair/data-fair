import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'

describe('Base applications', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Get public base applications', async function () {
    const ax = anonymous
    const res = await ax.get('/api/v1/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
  })

  it('Get privately readable base app', async function () {
    // Only public at first
    const ax = dmeadus
    let res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
    const baseApp1 = res.data.results[0]
    assert.ok(baseApp1)
    assert.equal(baseApp1.public, true)
    assert.equal(baseApp1.datasetsFilters.length, 2)
    assert.deepEqual(baseApp1.datasetsFilters[0]['field-type'], ['integer', 'number'])
    assert.deepEqual(baseApp1.datasetsFilters[0].select, ['id', 'title', 'schema', 'userPermissions'])
    const baseApp3 = res.data.results[1]
    assert.ok(baseApp3)
    assert.equal(baseApp3.public, true)
    assert.equal(baseApp3.datasetsFilters.length, 1)
    assert.deepEqual(baseApp3.datasetsFilters[0].select, ['id', 'title', 'schema'])

    // super admin patchs the private one
    const adminAx = superadmin
    res = await adminAx.get('/api/v1/admin/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    await adminAx.patch('/api/v1/base-applications/http:monapp2.com', {
      privateAccess: [{ type: 'user', id: 'dmeadus0' }, { type: 'user', id: 'another' }]
    })
    assert.equal(res.status, 200)

    // User sees the public and private base app
    res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    const baseApp = res.data.results.find(a => a.url === 'http://monapp2.com/')
    assert.equal(baseApp.privateAccess.length, 1)
  })

  it('Get base apps completed with contextual dataset', async function () {
    const ax = dmeadus
    const adminAx = superadmin
    await adminAx.patch('/api/v1/base-applications/http:monapp2.com', { privateAccess: [{ type: 'user', id: 'dmeadus0' }] })
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0&dataset=' + dataset.id)
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 3)
    const app = res.data.results.find(a => a.url === 'http://monapp2.com/')
    assert.equal(app.category, 'autre')
    assert.equal(app.disabled.length, 1)
    assert.equal(app.disabled[0], 'n\'utilise pas de jeu de données comme source.')
  })
})
