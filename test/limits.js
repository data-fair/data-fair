const FormData = require('form-data')
const assert = require('assert').strict
const config = require('config')
const testUtils = require('./resources/test-utils')
const workers = require('../server/workers')

const baseLimit = { store_bytes: { limit: 300000, consumption: 0 }, store_static_bytes: { limit: 300000, consumption: 0 }, lastUpdate: new Date().toISOString() }

describe('limits', () => {
  it('Manage a user storage limit', async () => {
    const ax = global.ax.dmeadus

    // Just fill up a little
    let form = new FormData()
    form.append('file', Buffer.alloc(150000), 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)

    assert.rejects(workers.hook('fianlizer/dataset'), () => {
      return true
    })

    // Send dataset applying default limits
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    try {
      res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 429)
    }

    // define a higher limit
    res = await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
    assert.equal(res.status, 201)
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    try {
      res = await ax.post('/api/v1/datasets', form, { headers: testUtils.formHeaders(form) })
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 429)
    }

    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_static_bytes.limit, 300000)
    assert.equal(res.data.store_static_bytes.consumption, 250000)
  })

  it('A user cannot change limits', async () => {
    const ax = global.ax.dmeadus
    try {
      await ax.post('/api/v1/limits/user/dmeadus0', baseLimit)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 401)
    }
  })

  it('A user can read his limits', async () => {
    const ax = global.ax.dmeadus
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
  })

  it('A user cannot read the list of limits', async () => {
    const ax = global.ax.dmeadus
    try {
      await ax.get('/api/v1/limits')
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 401)
    }
  })

  it('A super admin can read the list of limits', async () => {
    const ax = global.ax.alban
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].id, 'dmeadus0')
    assert.equal(res.data.results[0].type, 'user')
  })
})
