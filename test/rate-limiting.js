const config = require('config')
const assert = require('assert').strict
const fs = require('fs-extra')
const tmp = require('tmp-promise')
const testUtils = require('./resources/test-utils')

describe('rate limiting', () => {
  it('should throttle content download', async () => {
    const ax = await global.ax.hlalonde3

    // higher storage limit first
    await ax.post('/api/v1/limits/user/hlalonde3',
      { store_bytes: { limit: 10000000, consumption: 0 }, lastUpdate: new Date().toISOString() },
      { params: { key: config.secretKeys.limits } })

    // a public dataset of about 100KB
    const tmpFile = await tmp.file({ postfix: '.csv' })
    const csvContent = await fs.readFile('test/resources/datasets/dataset1.csv')
    for (let i = 0; i < 700; i++) {
      await fs.write(tmpFile.fd, csvContent)
    }

    const dataset = await testUtils.sendDataset(tmpFile.path, ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'] }
    ])
    assert.ok(dataset.file.size > 100000, 'content should be larger than 100KB')

    // raw data access by authenticated user
    let t0 = new Date().getTime()
    await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    let t1 = new Date().getTime()
    assert.ok((t1 - t0 > 250) && (t1 - t0 < 350), 'throttled download should be slightly more than 250ms, got ' + (t1 - t0))

    // raw data access by anonymous user
    t0 = new Date().getTime()
    await global.ax.anonymous.get(`/api/v1/datasets/${dataset.id}/raw`)
    t1 = new Date().getTime()
    assert.ok((t1 - t0 > 500) && (t1 - t0 < 600), 'throttled download should be slightly more than 500ms, got ' + (t1 - t0))

    // extended data access by authenticated user
    t0 = new Date().getTime()
    await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    t1 = new Date().getTime()
    assert.ok((t1 - t0 > 250) && (t1 - t0 < 350), 'throttled download should be slightly more than 500ms, got ' + (t1 - t0))

    // queried data access by authenticated user
    t0 = new Date().getTime()
    await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { size: 500 } })
    t1 = new Date().getTime()
    assert.ok((t1 - t0 > 500) && (t1 - t0 < 800), 'throttled download should be slightly more than 500ms, got ' + (t1 - t0))
  })

  it('should block requests when there are too many', async () => {
    const ax = await global.ax.dmeadus
    const promises = []
    for (let i = 0; i < 200; i++) {
      promises.push(ax.get('/api/v1/datasets'))
    }
    try {
      await Promise.all(promises)
      assert.fail()
    } catch (err) {
      assert.equal(err.status, 429)
    }
    // after 1 s the rate limiter is emptied
    await new Promise(resolve => setTimeout(resolve, 1000))
    await ax.get('/api/v1/datasets')
  })
})
