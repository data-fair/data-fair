const assert = require('assert').strict
const testUtils = require('./resources/test-utils')

describe('Base applications', () => {
  it('Get public base applications', async () => {
    const ax = global.ax.anonymous
    const res = await ax.get('/api/v1/base-applications')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
  })

  it('Get privately readable base app', async () => {
    // Only public at first
    const ax = global.ax.dmeadus
    let res = await ax.get('/api/v1/base-applications?privateAccess=user:dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)

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

  it('Get base apps completed with contextual dataset', async () => {
    const ax = global.ax.dmeadus
    const dataset = await testUtils.sendDataset('datasets/dataset1.csv', ax)
    const res = await ax.get('/api/v1/base-applications?dataset=' + dataset.id)
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    const app = res.data.results[0]
    assert.equal(app.category, 'autre')
    assert.equal(app.disabled.length, 1)
    assert.equal(app.disabled[0], 'n\'utilise pas de jeu de données comme source.')
  })
})
