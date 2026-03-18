import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
import fs from 'fs-extra'
import tmp from 'tmp-promise'
import { axios, axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'
import { sendDataset, waitForDatasetError, clearRateLimiting } from '../../support/workers.ts'

const anonymous = axios()
const dmeadus = await axiosAuth('dmeadus0@answers.com')
const alban = await axiosAuth('alban.mouton@koumoul.com', 'passwd', undefined, true)
const hlalonde3 = await axiosAuth('hlalonde3@desdev.cn')

const baseLimit = {
  indexed_bytes: { limit: 300000, consumption: 0 },
  store_bytes: { limit: 300000, consumption: 0 },
  nb_datasets: { limit: 10, consumption: 0 },
  lastUpdate: new Date().toISOString()
}

test.describe('limits', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Manage a user storage limit', async () => {
    const ax = dmeadus

    // Just fill up a little
    let form = new FormData()
    form.append('file', Buffer.alloc(150000), 'dataset.csv')
    let res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    assert.equal(res.status, 201)
    await waitForDatasetError(ax, res.data.id)

    // Send dataset applying default limits
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 429)

    // define a higher limit
    res = await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })

    // test storage size limit
    form = new FormData()
    form.append('file', Buffer.alloc(100000), 'dataset.csv')
    res = await ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } })
    await waitForDatasetError(ax, res.data.id)
    assert.equal(res.status, 201)
    form = new FormData()
    form.append('file', Buffer.alloc(100004), 'dataset.csv')
    await assert.rejects(ax.post('/api/v1/datasets', form, { headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() } }), (err: any) => err.status === 429)

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

  test('A user cannot change limits', async () => {
    const ax = dmeadus
    await assert.rejects(
      ax.post('/api/v1/limits/user/dmeadus0', baseLimit),
      { status: 403 }
    )
  })

  test('A user can read his limits', async () => {
    const ax = dmeadus
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits/user/dmeadus0')
    assert.equal(res.status, 200)
    assert.equal(res.data.store_bytes.limit, 300000)
  })

  test('A user cannot read the list of limits', async () => {
    const ax = dmeadus
    await assert.rejects(
      ax.get('/api/v1/limits'),
      { status: 403 }
    )
  })

  test('A super admin can read the list of limits', async () => {
    const ax = alban
    await ax.post('/api/v1/limits/user/dmeadus0', baseLimit, { params: { key: config.secretKeys.limits } })
    const res = await ax.get('/api/v1/limits')
    assert.equal(res.status, 200)
    assert.equal(res.data.count, 1)
    assert.equal(res.data.results.length, 1)
    assert.equal(res.data.results[0].id, 'dmeadus0')
    assert.equal(res.data.results[0].type, 'user')
  })

  test('rate limiting should throttle content download', async () => {
    const ax = hlalonde3

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

    // static data access by authenticated user (400 kb/s defined in config/development.cjs)
    let t0 = new Date().getTime()
    await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    await ax.get(`/api/v1/datasets/${dataset.id}/raw`)
    await ax.get(`/api/v1/datasets/${dataset.id}/full`)
    let t1 = new Date().getTime()
    assert.ok((t1 - t0 > 500) && (t1 - t0 < 1500), 'throttled download should be around 1s, got ' + (t1 - t0))

    // static data access by anonymous user (200 kb/s defined in config/development.cjs)
    t0 = new Date().getTime()
    await anonymous.get(`/api/v1/datasets/${dataset.id}/raw`)
    await anonymous.get(`/api/v1/datasets/${dataset.id}/full`)
    await anonymous.get(`/api/v1/datasets/${dataset.id}/raw`)
    await anonymous.get(`/api/v1/datasets/${dataset.id}/full`)
    t1 = new Date().getTime()
    assert.ok((t1 - t0 > 1200) && (t1 - t0 < 3000), 'throttled download should be around 2s, got ' + (t1 - t0))

    // dynamic data access by authenticated user (200 kb/s defined in config/development.cjs)
    t0 = new Date().getTime()
    await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { params: { size: 500 } })
    t1 = new Date().getTime()
    assert.ok((t1 - t0 > 250) && (t1 - t0 < 900), 'throttled download should be around 400ms, got ' + (t1 - t0))
  })

  test('rate limiting should block requests when there are too many', async () => {
    const ax = dmeadus
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
    // clear rate limiting state
    await clearRateLimiting()
    await ax.get('/api/v1/datasets')
  })
})
