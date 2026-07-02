import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const makeRest = async (id: string, constraints?: any[]) => {
  // REST dataset creation with a schema finalizes synchronously (status is
  // already 'finalized' in the POST response, see config.api.spec.ts), so
  // there is no later finalize-end journal event to wait for here.
  const res = await testUser1.post(`/api/v1/datasets/${id}`, {
    isRest: true,
    title: id,
    schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'integer' }],
    ...(constraints ? { constraints } : {})
  })
  assert.equal(res.data.status, 'finalized')
}

test.describe('REST dataset unique constraint', () => {
  test.beforeEach(async () => { await clean() })

  test('rejects a duplicate line with 409', async () => {
    await makeRest('rest-uniq', [{ type: 'unique', properties: ['a', 'b'] }])
    const first = await testUser1.post('/api/v1/datasets/rest-uniq/lines', { a: 'x', b: 1 }, { validateStatus: () => true })
    assert.ok(first.status === 200 || first.status === 201, `first insert status ${first.status}`)
    const dup = await testUser1.post('/api/v1/datasets/rest-uniq/lines', { a: 'x', b: 1 }, { validateStatus: () => true })
    assert.equal(dup.status, 409)
  })

  test('allows a differing line', async () => {
    await makeRest('rest-uniq2', [{ type: 'unique', properties: ['a', 'b'] }])
    await testUser1.post('/api/v1/datasets/rest-uniq2/lines', { a: 'x', b: 1 })
    const ok = await testUser1.post('/api/v1/datasets/rest-uniq2/lines', { a: 'x', b: 2 }, { validateStatus: () => true })
    assert.ok(ok.status === 200 || ok.status === 201, `status ${ok.status}`)
  })

  test('rejects adding a constraint that existing data already violates', async () => {
    await makeRest('rest-uniq3')
    await testUser1.post('/api/v1/datasets/rest-uniq3/lines', { a: 'x', b: 1 })
    await testUser1.post('/api/v1/datasets/rest-uniq3/lines', { a: 'x', b: 1 })
    await waitForFinalize(testUser1, 'rest-uniq3')
    const res = await testUser1.patch('/api/v1/datasets/rest-uniq3', {
      constraints: [{ type: 'unique', properties: ['a', 'b'] }]
    }, { validateStatus: () => true })
    assert.equal(res.status, 400)
  })

  test('removing a non-last constraint among several does not crash and keeps the survivor enforced', async () => {
    await makeRest('rest-uniq4', [{ type: 'unique', properties: ['a'] }, { type: 'unique', properties: ['b'] }])

    // PATCH removing the FIRST constraint used to trigger an unhandled 500 (MongoDB
    // IndexKeySpecsConflict) because the survivor was renamed by array position and
    // collided with the stale index left behind by the drop loop.
    const patchRes = await testUser1.patch('/api/v1/datasets/rest-uniq4', {
      constraints: [{ type: 'unique', properties: ['b'] }]
    }, { validateStatus: () => true })
    assert.equal(patchRes.status, 200)

    // the surviving constraint on 'b' is still enforced
    const first = await testUser1.post('/api/v1/datasets/rest-uniq4/lines', { a: 'x', b: 1 }, { validateStatus: () => true })
    assert.ok(first.status === 200 || first.status === 201, `first insert status ${first.status}`)
    const dupB = await testUser1.post('/api/v1/datasets/rest-uniq4/lines', { a: 'y', b: 1 }, { validateStatus: () => true })
    assert.equal(dupB.status, 409)

    // the removed constraint on 'a' is no longer enforced
    const dupA1 = await testUser1.post('/api/v1/datasets/rest-uniq4/lines', { a: 'z', b: 2 }, { validateStatus: () => true })
    assert.ok(dupA1.status === 200 || dupA1.status === 201, `dupA1 status ${dupA1.status}`)
    const dupA2 = await testUser1.post('/api/v1/datasets/rest-uniq4/lines', { a: 'z', b: 3 }, { validateStatus: () => true })
    assert.ok(dupA2.status === 200 || dupA2.status === 201, `dupA2 status ${dupA2.status}`)
  })

  test('rejects a schema-only patch that removes a column referenced by an existing constraint', async () => {
    await makeRest('rest-uniq5', [{ type: 'unique', properties: ['a', 'b'] }])

    // schema patch that drops column 'b', without touching `constraints` — must be rejected
    // because the surviving constraint would then reference a nonexistent column
    const patchRes = await testUser1.patch('/api/v1/datasets/rest-uniq5', {
      schema: [{ key: 'a', type: 'string' }]
    }, { validateStatus: () => true })
    assert.equal(patchRes.status, 400)
  })
})
