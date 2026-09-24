import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks, config } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('Schema maxCardinality filter', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Stored and contextual cardinality filtering', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-card', {
      isRest: true,
      title: 'rest-card',
      schema: [
        { key: 'region', type: 'string' },
        { key: 'city', type: 'string' },
        { key: 'txt', type: 'string', 'x-capabilities': { values: false } }
      ]
    })
    await ax.post('/api/v1/datasets/rest-card/_bulk_lines', [
      { region: 'R1', city: 'A', txt: 'a1' },
      { region: 'R1', city: 'B', txt: 'a2' },
      { region: 'R1', city: 'A', txt: 'a3' },
      { region: 'R2', city: 'C', txt: 'a4' },
      { region: 'R2', city: 'D', txt: 'a5' },
      { region: 'R2', city: 'C', txt: 'a6' }
    ])
    const dataset = await waitForFinalize(ax, 'rest-card')
    assert.equal(dataset.schema.find((p: any) => p.key === 'region')['x-cardinality'], 2)
    assert.equal(dataset.schema.find((p: any) => p.key === 'city')['x-cardinality'], 4)

    // without data filters, the stored whole-dataset cardinality is used
    let keys = (await ax.get('/api/v1/datasets/rest-card/schema', { params: { maxCardinality: '3' } })).data.map((p: any) => p.key)
    assert.deepEqual(keys.sort(), ['region'])
    // fields without a usable cardinality (values: false) are dropped too
    keys = (await ax.get('/api/v1/datasets/rest-card/schema', { params: { maxCardinality: '100' } })).data.map((p: any) => p.key)
    assert.deepEqual(keys.sort(), ['city', 'region'])

    // contextual: within region R1 the city column has only 2 distinct values, it passes a
    // threshold that its whole-dataset cardinality (4) exceeds
    let res = await ax.get('/api/v1/datasets/rest-card/schema', { params: { region_eq: 'R1', maxCardinality: '3' } })
    keys = res.data.map((p: any) => p.key)
    assert.deepEqual(keys.sort(), ['city', 'region'])
    // the response keeps exposing the stored whole-dataset cardinality
    assert.equal(res.data.find((p: any) => p.key === 'city')['x-cardinality'], 4)

    // qs context: only the lines with city C remain, both columns pass a threshold that the
    // stored cardinality of city (4) exceeds
    res = await ax.get('/api/v1/datasets/rest-card/schema', { params: { qs: 'city:C', maxCardinality: '2' } })
    keys = res.data.map((p: any) => p.key)
    assert.deepEqual(keys.sort(), ['city', 'region'])
    // the same threshold without the data filter keeps only region
    keys = (await ax.get('/api/v1/datasets/rest-card/schema', { params: { maxCardinality: '2' } })).data.map((p: any) => p.key)
    assert.deepEqual(keys.sort(), ['region'])

    // combined with the other schema filters
    keys = (await ax.get('/api/v1/datasets/rest-card/schema', { params: { region_eq: 'R1', type: 'string', maxCardinality: '3' } })).data.map((p: any) => p.key)
    assert.deepEqual(keys.sort(), ['city', 'region'])
    res = await ax.get('/api/v1/datasets/rest-card/schema', { params: { region_eq: 'R1', type: 'integer', maxCardinality: '3' } })
    assert.deepEqual(res.data, [])

    // mimeType conversions happen after the filtering
    res = await ax.get('/api/v1/datasets/rest-card/schema', { params: { region_eq: 'R1', maxCardinality: '3', mimeType: 'application/tableschema+json' } })
    assert.deepEqual(res.data.fields.map((f: any) => f.name).sort(), ['city', 'region'])

    // the safe schema never filters on cardinality (it does not expose it)
    res = await ax.get('/api/v1/datasets/rest-card/safe-schema', { params: { region_eq: 'R1', maxCardinality: '3' } })
    assert.deepEqual(res.data, [])

    // an unknown filter column is rejected by the query builder
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-card/schema', { params: { unknown_eq: 'x', maxCardinality: '3' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('unknown'))
        return true
      }
    )
  })

  test('Contextual cardinality filtering uses resource based cache headers', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-card-cache', {
      isRest: true,
      title: 'rest-card-cache',
      schema: [{ key: 'region', type: 'string' }, { key: 'city', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest-card-cache/_bulk_lines', [
      { region: 'R1', city: 'A' },
      { region: 'R1', city: 'B' },
      { region: 'R2', city: 'C' },
      { region: 'R2', city: 'D' }
    ])
    const dataset = await waitForFinalize(ax, 'rest-card-cache')
    const params = { region_eq: 'R1', maxCardinality: '3' }

    // the plain schema read stays uncached
    let res = await ax.get('/api/v1/datasets/rest-card-cache/schema', { params: { maxCardinality: '3' } })
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')
    assert.equal(res.headers['last-modified'], undefined)

    // private dataset: validator but no shared cache
    res = await ax.get('/api/v1/datasets/rest-card-cache/schema', { params })
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=0')
    const lastModified = res.headers['last-modified']
    assert.ok(lastModified)
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-card-cache/schema', { params, headers: { 'if-modified-since': lastModified } }),
      (err: any) => err.status === 304
    )
    res = await ax.get('/api/v1/datasets/rest-card-cache/schema', { params: { ...params, finalizedAt: dataset.finalizedAt } })
    assert.equal(res.headers['cache-control'], 'must-revalidate, private, max-age=' + config.cache.timestampedPublicMaxAge)

    // a metadata edit of the schema moves updatedAt but not finalizedAt, the validator follows it
    await new Promise(resolve => setTimeout(resolve, 1100))
    const schema = dataset.schema.filter((p: any) => !p['x-calculated']).map((p: any) => p.key === 'city' ? { ...p, title: 'Ville' } : p)
    const patched = (await ax.patch('/api/v1/datasets/rest-card-cache', { schema })).data
    assert.equal(patched.finalizedAt, dataset.finalizedAt)
    res = await ax.get('/api/v1/datasets/rest-card-cache/schema', { params, headers: { 'if-modified-since': lastModified } })
    assert.equal(res.status, 200)
    assert.notEqual(res.headers['last-modified'], lastModified)
    assert.equal(res.data.find((p: any) => p.key === 'city').title, 'Ville')

    // public dataset: shared cache
    await ax.put('/api/v1/datasets/rest-card-cache/permissions', [{ classes: ['read'] }])
    res = await ax.get('/api/v1/datasets/rest-card-cache/schema', { params })
    assert.equal(res.headers['cache-control'], 'must-revalidate, public, max-age=' + config.cache.publicMaxAge)

    // no agg needed (every field already passes on its stored cardinality), invalid filters are still rejected
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-card-cache/schema', { params: { unknown_eq: 'x', maxCardinality: '10' } }),
      (err: any) => err.status === 400
    )
  })
})
