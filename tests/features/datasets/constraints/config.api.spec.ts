import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

test.describe('unicity constraint config', () => {
  test.beforeEach(async () => { await clean() })

  const makeRest = async (id: string) => {
    // REST dataset creation with a schema finalizes synchronously (status
    // is already 'finalized' in the POST response), so there is no need to
    // wait for a finalize-end journal event here.
    const res = await testUser1.post(`/api/v1/datasets/${id}`, {
      isRest: true,
      title: id,
      schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'integer' }]
    })
    assert.equal(res.data.status, 'finalized')
  }

  test('accepts a valid unique constraint via PATCH', async () => {
    await makeRest('cfg-ok')
    const res = await testUser1.patch('/api/v1/datasets/cfg-ok', {
      constraints: [{ type: 'unique', properties: ['a', 'b'] }]
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.constraints, [{ type: 'unique', properties: ['a', 'b'] }])
  })

  test('rejects a constraint on a nonexistent column', async () => {
    await makeRest('cfg-bad')
    const res = await testUser1.patch('/api/v1/datasets/cfg-bad', {
      constraints: [{ type: 'unique', properties: ['nope'] }]
    }, { validateStatus: () => true })
    assert.equal(res.status, 400)
  })
})
