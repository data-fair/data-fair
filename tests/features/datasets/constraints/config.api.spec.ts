import { test } from '../../../fixtures/diagnostics.ts'
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

  // PATCH smoke test: proves validation + persistence is wired into the PATCH
  // entry point. Rejection cases (nonexistent column, virtual/metaOnly guard)
  // are unit-tested directly against checkConstraints in constraints-check.unit.spec.ts.
  test('accepts a valid unique constraint via PATCH', async () => {
    await makeRest('cfg-ok')
    const res = await testUser1.patch('/api/v1/datasets/cfg-ok', {
      constraints: [{ type: 'unique', properties: ['a', 'b'] }]
    })
    assert.equal(res.status, 200)
    assert.deepEqual(res.data.constraints, [{ type: 'unique', properties: ['a', 'b'] }])
  })

  // POST smoke test: proves validation is wired into the creation entry point.
  test('rejects a REST dataset created with an invalid constraint', async () => {
    const res = await testUser1.post('/api/v1/datasets/cfg-create-bad', {
      isRest: true,
      title: 'cfg-create-bad',
      schema: [{ key: 'a', type: 'string' }, { key: 'b', type: 'integer' }],
      constraints: [{ type: 'unique', properties: ['nope'] }]
    }, { validateStatus: () => true })
    assert.equal(res.status, 400)
  })

  // the multipart entry point parses constraints from a form field, a distinct path from the JSON one
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
})

test.describe('dateCoherence constraint config', () => {
  test.beforeEach(async () => { await clean() })

  const conceptSchema = [
    { key: 'deb', type: 'string', format: 'date', 'x-refersTo': 'https://schema.org/startDate' },
    { key: 'fin', type: 'string', format: 'date', 'x-refersTo': 'https://schema.org/endDate' }
  ]

  test('accepted on a REST dataset whose schema carries both concepts', async () => {
    const res = await testUser1.post('/api/v1/datasets/coherence-ok', {
      isRest: true, title: 'coherence-ok', schema: conceptSchema, constraints: [{ type: 'dateCoherence' }]
    })
    assert.equal(res.data.constraints?.[0]?.type, 'dateCoherence')
  })

  test('rejected with 400 when the concepts are missing', async () => {
    const res = await testUser1.post('/api/v1/datasets/coherence-ko', {
      isRest: true, title: 'coherence-ko', schema: [{ key: 'a', type: 'string' }], constraints: [{ type: 'dateCoherence' }]
    }, { validateStatus: () => true })
    assert.equal(res.status, 400)
    assert.match(JSON.stringify(res.data), /concept/)
  })

  test('a schema PATCH that drops a concept while the constraint exists is rejected', async () => {
    await testUser1.post('/api/v1/datasets/coherence-drop', {
      isRest: true, title: 'coherence-drop', schema: conceptSchema, constraints: [{ type: 'dateCoherence' }]
    })
    const res = await testUser1.patch('/api/v1/datasets/coherence-drop', {
      schema: [conceptSchema[0], { key: 'fin', type: 'string', format: 'date' }] // endDate concept removed
    }, { validateStatus: () => true })
    assert.equal(res.status, 400)
  })
})
