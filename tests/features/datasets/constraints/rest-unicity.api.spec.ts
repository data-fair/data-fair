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
})
