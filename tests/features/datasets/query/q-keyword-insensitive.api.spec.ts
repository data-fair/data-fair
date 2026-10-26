import { test } from '../../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const ax = await axiosAuth('test_user1@test.com')

// `code` has no analyzed inner field (text + textStandard disabled) so `q` can only match it
// through a keyword view; `strict` additionally drops the insensitive capability.
const setup = async (id: string) => {
  await ax.post('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    schema: [
      { key: 'code', type: 'string', 'x-capabilities': { text: false, textStandard: false } },
      { key: 'strict', type: 'string', 'x-capabilities': { text: false, textStandard: false, insensitive: false } }
    ]
  })
  await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [
    { code: 'PÂTISSERIE', strict: 'PÂTISSERIE' },
    { code: 'boulangerie', strict: 'boulangerie' }
  ])
  await waitForFinalize(ax, id)
}

// all tests only read this fixture, so it is built once for the whole describe block
const id = 'qki'

test.describe('q on a pure-keyword column', () => {
  test.beforeAll(async () => {
    await clean()
    await setup(id)
  })

  test('matches ignoring case and diacritics', async () => {
    const res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'patisserie', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code, 'PÂTISSERIE')
  })

  test('still matches the exact value', async () => {
    const res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'PÂTISSERIE', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
  })

  test('matches a lowercase value from an uppercase query', async () => {
    const res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'BOULANGERIE', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code, 'boulangerie')
  })

  test('stays case sensitive when the insensitive capability is disabled', async () => {
    let res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'patisserie', q_fields: 'strict' } })
    assert.equal(res.data.total, 0)
    res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'PÂTISSERIE', q_fields: 'strict' } })
    assert.equal(res.data.total, 1)
  })
})
