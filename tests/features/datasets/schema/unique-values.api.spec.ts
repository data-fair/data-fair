import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, checkPendingTasks } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')
const testUser3 = await axiosAuth('test_user3@test.com')

const keysOf = (res: any) => res.data.map((p: any) => p.key).sort()

test.describe('Schema uniqueValues filter', () => {
  test.beforeEach(async () => {
    await clean()
  })

  test.afterEach(async ({}, testInfo) => {
    if (testInfo.status === 'passed') await checkPendingTasks()
  })

  test('Keep the columns with a distinct value on every matching line', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-unique', {
      isRest: true,
      title: 'rest-unique',
      schema: [
        { key: 'id', type: 'string' },
        { key: 'num', type: 'integer' },
        { key: 'region', type: 'string' },
        { key: 'city', type: 'string' },
        { key: 'code', type: 'string' },
        { key: 'tags', type: 'string', separator: ',' },
        { key: 'txt', type: 'string', 'x-capabilities': { values: false } }
      ]
    })
    await ax.post('/api/v1/datasets/rest-unique/_bulk_lines', [
      { id: '1', num: 10, region: 'R1', city: 'A', code: 'c1', tags: 't1', txt: 'a1' },
      { id: '2', num: 20, region: 'R1', city: 'B', code: 'c2', tags: 't2', txt: 'a2' },
      { id: '3', num: 30, region: 'R2', city: 'A', code: 'c3', tags: 't3', txt: 'a3' },
      { id: '4', num: 40, region: 'R2', city: 'C', tags: 't4', txt: 'a4' }
    ])
    await waitForFinalize(ax, 'rest-unique')
    const get = (params: Record<string, string>) => ax.get('/api/v1/datasets/rest-unique/schema', { params: { uniqueValues: 'true', ...params } })

    // whole dataset: city has a duplicate, code an empty line; multi-valued, values-less and
    // calculated columns never qualify
    assert.deepEqual(keysOf(await get({})), ['id', 'num'])
    // a duplicate in the whole dataset can disappear in a filtered context
    assert.deepEqual(keysOf(await get({ region_eq: 'R1' })), ['city', 'code', 'id', 'num'])
    // an empty value on one matching line disqualifies the column
    assert.deepEqual(keysOf(await get({ region_eq: 'R2' })), ['city', 'id', 'num'])
    assert.deepEqual(keysOf(await get({ qs: 'id:1' })), ['city', 'code', 'id', 'num', 'region'])
    // no matching line, no unique column
    assert.deepEqual(keysOf(await get({ region_eq: 'R3' })), [])

    // combined with the other schema filters
    assert.deepEqual(keysOf(await get({ type: 'integer' })), ['num'])
    assert.deepEqual(keysOf(await get({ maxCardinality: '4' })), ['id', 'num'])
    assert.deepEqual(keysOf(await get({ region_eq: 'R1', maxCardinality: '1' })), [])

    // mimeType conversions happen after the filtering
    const res = await get({ region_eq: 'R1', mimeType: 'application/tableschema+json' })
    assert.deepEqual(res.data.fields.map((f: any) => f.name).sort(), ['city', 'code', 'id', 'num'])

    // the safe schema exposes no clue about the data
    assert.deepEqual((await ax.get('/api/v1/datasets/rest-unique/safe-schema', { params: { uniqueValues: 'true' } })).data, [])

    await assert.rejects(get({ unknown_eq: 'x' }), (err: any) => err.status === 400)
  })

  test('Filtered uniqueValues requires the permission to read lines', async () => {
    await testUser1.post('/api/v1/datasets/rest-unique-perm', {
      isRest: true,
      title: 'rest-unique-perm',
      schema: [{ key: 'email', type: 'string' }, { key: 'city', type: 'string' }]
    })
    await testUser1.post('/api/v1/datasets/rest-unique-perm/_bulk_lines', [{ email: 'secret@test.com', city: 'A' }, { email: 'other@test.com', city: 'A' }])
    await waitForFinalize(testUser1, 'rest-unique-perm')
    await testUser1.put('/api/v1/datasets/rest-unique-perm/permissions', [
      { type: 'user', id: 'test_user3', operations: ['readDescription', 'readSchema'] }
    ])
    await assert.rejects(
      testUser3.get('/api/v1/datasets/rest-unique-perm/schema', { params: { email_starts: 'secret', uniqueValues: 'true' } }),
      (err: any) => err.status === 403
    )
    // without data filters it tells no more than the stored cardinality and count
    const res = await testUser3.get('/api/v1/datasets/rest-unique-perm/schema', { params: { uniqueValues: 'true' } })
    assert.deepEqual(keysOf(res), ['email'])
    // it runs an ES query, so it gets the data endpoints' cache validator
    assert.ok(res.headers['last-modified'])
  })
})
