import { strict as assert } from 'node:assert'
import * as testUtils from './resources/test-utils.js'

describe('Base applications', function () {
  it('Get public base applications', async function () {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
  })

  it('Get privately readable base app', async function () {
    // Only public at first
    const ax = global.ax.dmeadus
    let res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    const baseApp1 = res.data.results[0]
    assert.ok(baseApp1)
    assert.equal(baseApp1.public, true)
    assert.equal(baseApp1.datasetsFilters.length, 2)
    assert.deepEqual(baseApp1.datasetsFilters[0]['field-type'], ['integer', 'number'])
    assert.deepEqual(baseApp1.datasetsFilters[0].select, ['id', 'title', 'schema', 'userPermissions'])

    // super admin patchs the private one
    const adminAx = global.ax.superadmin
    res = await adminAx.get('/api/v1/admin/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
    await adminAx.patch('/api/v1/base-applications/http:monapp2.com', {
      privateAccess: [{ type: 'user', id: 'dmeadus0' }, { type: 'user', id: 'another' }]
    })
    assert.equal(res.status, 200)

    // User sees the public and private base app
    res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
    const baseApp = res.data.results.find(a => a.url === 'http://monapp2.com/')
    assert.equal(baseApp.privateAccess.length, 1)
  })

  it('Get base apps completed with contextual dataset', async function () {
    const ax = global.ax.dmeadus
    const adminAx = global.ax.superadmin
    await adminAx.patch('/api/v1/base-applications/http:monapp2.com', { privateAccess: [{ type: 'user', id: 'dmeadus0' }] })
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0&dataset=' + dataset.id)
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 2)
    const app = res.data.results.find(a => a.url === 'http://monapp2.com/')
    assert.equal(app.category, 'autre')
    assert.equal(app.disabled.length, 1)
    assert.equal(app.disabled[0], 'n\'utilise pas de jeu de données comme source.')
  })
})
