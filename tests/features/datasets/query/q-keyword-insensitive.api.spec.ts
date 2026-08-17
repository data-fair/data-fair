import { test } from '@playwright/test'
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

test.describe('q on a pure-keyword column', () => {
  test.beforeEach(async () => { await clean() })

  test('matches ignoring case and diacritics', async () => {
    await setup('qki-insensitive')
    const res = await ax.get('/api/v1/datasets/qki-insensitive/lines', { params: { q: 'patisserie', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code, 'PÂTISSERIE')
  })

  test('still matches the exact value', async () => {
    await setup('qki-exact')
    const res = await ax.get('/api/v1/datasets/qki-exact/lines', { params: { q: 'PÂTISSERIE', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
  })

  test('matches a lowercase value from an uppercase query', async () => {
    await setup('qki-upper')
    const res = await ax.get('/api/v1/datasets/qki-upper/lines', { params: { q: 'BOULANGERIE', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code, 'boulangerie')
  })

  test('stays case sensitive when the insensitive capability is disabled', async () => {
    await setup('qki-strict')
    let res = await ax.get('/api/v1/datasets/qki-strict/lines', { params: { q: 'patisserie', q_fields: 'strict' } })
    assert.equal(res.data.total, 0)
    res = await ax.get('/api/v1/datasets/qki-strict/lines', { params: { q: 'PÂTISSERIE', q_fields: 'strict' } })
    assert.equal(res.data.total, 1)
  })
})
