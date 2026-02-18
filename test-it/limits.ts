import { strict as assert } from 'node:assert'
import { it, describe, before, after, beforeEach, afterEach } from 'node:test'
import { startApiServer, stopApiServer, scratchData, checkPendingTasks, getAxiosAuth, formHeaders, sendDataset, getAxios } from './utils/index.ts'
import FormData from 'form-data'
import * as workers from '../api/src/workers/index.ts'
import config from 'config'
import fs from 'fs-extra'
import tmp from 'tmp-promise'

const anonymous = getAxios()
const dmeadus = await getAxiosAuth('dmeadus0@answers.com', 'passwd')
const alban = await getAxiosAuth('alban.mouton@koumoul.com', 'passwd', undefined, true)
const hlalonde3 = await getAxiosAuth('hlalonde3@desdev.cn', 'passwd')

const baseLimit = {
  indexed_bytes: { limit: 300000, consumption: 0 },
  store_bytes: { limit: 300000, consumption: 0 },
  nb_datasets: { limit: 10, consumption: 0 },
  lastUpdate: new Date().toISOString()
}

describe('limits', function () {
  before(startApiServer)
  beforeEach(scratchData)
  after(stopApiServer)
  afterEach((t) => checkPendingTasks(t.name))

  it('Manage a user storage limit', async function () {
    const ax = dmeadus

    // Just fill up a little
    let form = new FormData()
    form.append('file', Buffer.alloc(150000), 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    assert.equal(res.status, 201)
    await assert.rejects(workers.hook('finalize/' + res.data.id))

    // Send dataset applying default limits
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 429)

    // define a higher limit
    res = await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })

    // test storage size limit
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    res = await ax.post('/api/v1/datasets', form, { headers: formHeaders(form) })
    await assert.rejects(workers.hook('finalize/' + res.data.id))
    assert.equal(res.status, 201)
    form = new FormData()
    form.append('file', Buffer.alloc(100004), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: formHeaders(form) }), (err: any) => err.status === 429)

    // test nb datasets size limit
    let lastDataset
    for (let i = 0; i < 8; i++) {
      lastDataset = (await ax.post('/api/v1/datasets/rest-dataset-' + (i + 1), { title: 'rest-dataset', isRest: true })).data
    }
    await assert.rejects(ax.post('/api/v1/datasets', { title: 'rest-dataset', isRest: true }), (err: any) => err.status === 429)

    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
    assert.equal(res.data.store_bytes.consumption, 250000)
    assert.equal(res.data.nb_datasets.limit, 10)
    assert.equal(res.data.nb_datasets.consumption, 10)

    // delete a dataset and check nb_datasets
    await ax.delete('/api/v1/datasets/' + lastDataset.id)
    res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.data.nb_datasets.consumption, 9)
  })

  it('A user cannot change limits', async function () {
    const ax = dmeadus
    await assert.rejects(
      ax.post('/api/v1/limits/user/dmeadus0', baseLimit),
      { status: 403 }
    )
  })

  it('A user can read his limits', async function () {
    const ax = dmeadus
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
  })

  it('A user cannot read the list of limits', async function () {
    const ax = dmeadus
    await assert.rejects(
      ax.get('/api/v1/limits'),
      { status: 403 }
    )
  })

  it('A super admin can read the list of limits', async function () {
    const ax = alban
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].id, 'dmeadus0')
    assert.equal(res.data.results[0].type, 'user')
  })

  it('rate limiting should throttle content download', async function () {
    const ax = await hlalonde3

    // higher storage limit first
    await ax.post('/api/v1/limits/user/hlalonde3',
      { store_bytes: { limit: 10000000, consumption: 0 }, lastUpdate: new Date().toISOString() },
      { params: { key: config.secretKeys.limits } })

    // a public dataset of about 100KB
    const tmpFile = await tmp.file({ postfix: '.csv' })
    const csvContent = await fs.readFile('./test-it/resources/datasets/dataset1.csv')
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

  it('rate limiting should block requests when there are too many', async function () {
    const ax = await dmeadus
    const promises = []
    for (let i = 0; i < 200; i++) {
      promises.push(ax.get('/api/v1/datasets'))
    }
    await assert.rejects(
      Promise.all(promises),
      { status: 429 }
    )
    // after 1 s the rate limiter is emptied
    await new Promise(resolve => setTimeout(resolve, 1000))
    await ax.get('/api/v1/datasets')
  })
})
