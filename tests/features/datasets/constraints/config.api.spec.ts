import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import FormData from 'form-data'
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

  test('rejects a REST dataset created with an invalid constraint', async () => {
    const res = await testUser1.post('/api/v1/datasets/cfg-create-bad', {
      isRest: true,
      title: 'cfg-create-bad',
      schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'integer' }],
      constraints: [{ type: 'unique', properties: ['nope'] }]
    }, { validateStatus: () => true })
    assert.equal(res.status, 400)
  })

  test('accepts a REST dataset created with a valid constraint', async () => {
    const res = await testUser1.post('/api/v1/datasets/cfg-create-ok', {
      isRest: true,
      title: 'cfg-create-ok',
      schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'integer' }],
      constraints: [{ type: 'unique', properties: ['a', 'b'] }]
    })
    assert.equal(res.status, 201)
    assert.equal(res.data.status, 'finalized')
  })

  test('removes a constraint via constraints:null combined with a schema change dropping a constrained column', async () => {
    await makeRest('cfg-null-with-schema')
    let res = await testUser1.patch('/api/v1/datasets/cfg-null-with-schema', {
      constraints: [{ type: 'unique', properties: ['a', 'b'] }]
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.constraints, [{ type: 'unique', properties: ['a', 'b'] }])

    // dropping column "b" while unsetting constraints in the same request must not be validated
    // against the OLD constraint (which still targets "b") - constraints:null means "remove them"
    res = await testUser1.patch('/api/v1/datasets/cfg-null-with-schema', {
      schema: [{ key: 'a', type: 'string' }],
      constraints: null
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.constraints, [])
  })

  test('rejects a file dataset created with an invalid constraint', async () => {
    const form = new FormData()
    form.append('file', Buffer.from('a,b\nx,1\n'), 'data.csv')
    form.append('schema', JSON.stringify([{ key: 'a', type: 'string' }, { key: 'b', type: 'string' }]))
    form.append('constraints', JSON.stringify([{ type: 'unique', properties: ['nope'] }]))
    const res = await testUser1.post('/api/v1/datasets', form, {
      headers: { 'Content-Length': form.getLengthSync(), ...form.getHeaders() },
      validateStatus: () => true
    })
    assert.equal(res.status, 400)
  })
})
