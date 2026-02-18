import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, dmeadus, sendDataset } from './utils/index.ts'
import config from 'config'
import fs from 'fs-extra'
import tmp from 'tmp-promise'

describe('rate limiting', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('should throttle content download', async function () {
    const ax = await hlalonde3

    // higher storage limit first
    await ax.post('/api/v1/limits/user/hlalonde3',
      { store_bytes: { limit: 10000000, consumption: 0 }, lastUpdate: new Date().toISOString() },
      { params: { key: config.secretKeys.limits } })

    // a public dataset of about 100KB
    const tmpFile = await tmp.file({ postfix: '.csv' })
    const csvContent = await fs.readFile('resources/datasets/dataset1.csv')
    for (let i = 0; i < 600; i++) {
      await fs.write(tmpFile.fd, csvContent)
    }

    const dataset = await sendDataset(tmpFile.path, ax)
    await ax.put('/api/v1/datasets/' + dataset.id + '/permissions', [
      { classes: ['read'] }
    ])
    assert.ok(dataset.file.size > 90000 && dataset.file.size < 110000, 'content should be around 100KB, got ' + dataset.file.size)

    // static data access by authenticated user (400 kb/s defined in config/test.cjs)
    let t0 = new Date().getTime()
    await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    let t1 = new Date().getTime()
    assert.ok((t1 - t0 > 500) && (t1 - t0 < 1500), 'throttled download should be around 1s, got ' + (t1 - t0))

    // static data access by anonymous user (200 kb/s defined in config/test.cjs)
    t0 = new Date().getTime()
    await anonymous.get(`/api/v1/datasets/${dataset.id}/raw`)
    await anonymous.get(`/api/v1/datasets/${dataset.id}/full`)
    await anonymous.get(`/api/v1/datasets/${dataset.id}/raw`)
    await anonymous.get(`/api/v1/datasets/${dataset.id}/full`)
    t1 = new Date().getTime()
    assert.ok((t1 - t0 > 1200) && (t1 - t0 < 3000), 'throttled download should be around 2s, got ' + (t1 - t0))

    // dynamic data access by authenticated user (200 kb/s defined in config/test.cjs)
    t0 = new Date().getTime()
    await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { size: 500 } })
    t1 = new Date().getTime()
    assert.ok((t1 - t0 > 250) && (t1 - t0 < 900), 'throttled download should be around 400ms, got ' + (t1 - t0))
  })

  it('should block requests when there are too many', async function () {
    const ax = await dmeadus
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
