import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
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
})
