import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { nanoid } from 'nanoid'
import { axios, axiosAuth, clean, checkPendingTasks, config } from '../../support/axios.ts'

const anonymous = axios()
const dmeadus = await axiosAuth('dmeadus0@answers.com')

test.describe('Cache headers', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  const createDataset = async (ax: any) => {
    let dataset = (await ax.post('/api/v1/datasets', {
      isRest: true,
      title: 'cache-headers-' + nanoid(),
      schema: [{ key: 'str1', type: 'string' }]
    })).data
    dataset = (await ax.get(`/api/v1/datasets/${dataset.id}`)).data
    return dataset
  }

  test('Uses private cache-control for newly created dataset', async () => {
    const ax = dmeadus
    const dataset = await createDataset(ax)
    const id = dataset.id
    assert.equal(dataset.status, 'finalized')
    assert.equal(dataset.owner.type, 'user')
    assert.equal(dataset.owner.id, 'dmeadus0')

    let res = await ax.get(`/api/v1/datasets/${id}/lines`)
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')
    assert.equal(res.headers['x-cache-status'], 'BYPASS')

    // same but without bypassing the cache
    res = await ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'x-cache-bypass': '0' } })
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')
    assert.equal(res.headers['x-cache-status'], 'MISS')

    // the finalizedAt parameter extends the max-age
    res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { finalizedAt: dataset.finalizedAt } })
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=' + config.cache.timestampedPublicMaxAge)
  })

  test('Supports private cache revalidation', async () => {
    const ax = dmeadus
    const dataset = await createDataset(ax)
    const id = dataset.id

    const res = await ax.get(`/api/v1/datasets/${id}/lines`)

    // sending etag in if-none-match should return a 304
    await assert.rejects(ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'x-cache-bypass': '0', 'if-none-match': res.headers.etag } }), (err: any) => err.status === 304)
    await assert.rejects(ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'if-none-match': res.headers.etag } }), (err: any) => err.status === 304)
    // sending last-modified in if-modified-since should return a 304
    await assert.rejects(ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'x-cache-bypass': '0', 'if-modified-since': res.headers['last-modified'] } }), (err: any) => err.status === 304)
    await assert.rejects(ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'if-modified-since': res.headers['last-modified'] } }), (err: any) => err.status === 304)
  })

  test('Manage public cache-control header based on permissions', async () => {
    const ax = dmeadus
    const axAnonymous = anonymous
    const dataset = await createDataset(ax)
    const id = dataset.id
    await ax.put(`/api/v1/datasets/${id}/permissions`, [{ classes: ['read'] }])

    let res = await axAnonymous.get(`/api/v1/datasets/${id}/lines`)
    assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)

    res = await ax.get(`/api/v1/datasets/${id}/lines`)
    assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)

    res = await axAnonymous.get(`/api/v1/datasets/${id}/lines`, { params: { finalizedAt: dataset.finalizedAt } })
    assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.timestampedPublicMaxAge)
  })

  test('Supports public cache revalidation', async () => {
    const ax = dmeadus
    const dataset = await createDataset(ax)
    const id = dataset.id
    await ax.put(`/api/v1/datasets/${id}/permissions`, [{ classes: ['read'] }])

    let res = await ax.get(`/api/v1/datasets/${id}/lines`)
    assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)

    // max-age did not elapse, get a HIT from the cache
    res = await ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'x-cache-bypass': '0' } })
    assert.equal(res.headers['x-cache-status'], 'HIT')

    // max-age elapsed, the cache should revalidate
    await new Promise(resolve => setTimeout(resolve, config.cache.publicMaxAge * 2000))
    res = await ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'x-cache-bypass': '0' } })
    assert.equal(res.headers['x-cache-status'], 'REVALIDATED')

    // sending etag in if-none-match should return a 304
    await assert.rejects(ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'x-cache-bypass': '0', 'if-none-match': res.headers.etag } }), (err: any) => err.status === 304)
    // sending last-modified in if-modified-since should return a 304
    await assert.rejects(ax.get(`/api/v1/datasets/${id}/lines`, { headers: { 'x-cache-bypass': '0', 'if-modified-since': res.headers['last-modified'] } }), (err: any) => err.status === 304)
  })

  test('Supports caching of lists', async () => {
    const ax = dmeadus
    await createDataset(ax)
    const dataset = await createDataset(ax)
    const id = dataset.id
    await ax.put(`/api/v1/datasets/${id}/permissions`, [{ classes: ['read', 'list'] }])

    let res = await ax.get('/api/v1/datasets')
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')
    assert.equal(res.data.count, 2)

    // sending etag in if-none-match should return a 304
    await assert.rejects(ax.get('/api/v1/datasets', { headers: { 'x-cache-bypass': '0', 'if-none-match': res.headers.etag } }), (err: any) => err.status === 304)

    res = await ax.get('/api/v1/datasets', { params: { select: '-userPermissions' } })
    // use base userPermissions is remove but we might see private/protected resources
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')
    assert.equal(res.data.count, 2)

    res = await ax.get('/api/v1/datasets', { params: { visibility: 'public' } })
    // only public resources but userPermissions depends on current user
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')
    assert.equal(res.data.count, 1)

    res = await ax.get('/api/v1/datasets', { params: { select: '-userPermissions', visibility: 'public' } })
    // no userPermissions and only public resources means we can use a public cache
    assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)
    assert.equal(res.data.count, 1)
  })
})
