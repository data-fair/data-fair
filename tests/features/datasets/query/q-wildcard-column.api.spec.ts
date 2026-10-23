import { test } from '../../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const ax = await axiosAuth('test_user1@test.com')

// `code` is the typical "code column" configuration: no text analysis, but wildcard enabled so it
// can be filtered on a group of characters. `full` keeps the default text analysis.
const setup = async (id: string) => {
  await ax.post('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    schema: [
      { key: 'code', type: 'string', 'x-capabilities': { text: false, textStandard: false, wildcard: true } },
      { key: 'full', type: 'string', 'x-capabilities': { wildcard: true } }
    ]
  })
  await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [
    { code: 'boulangerie', full: 'boulangerie' },
    { code: 'patisserie', full: 'patisserie' }
  ])
  await waitForFinalize(ax, id)
}

// all tests only read this fixture, so it is built once for the whole describe block
const id = 'qwc'

test.describe('q_mode=complete on a wildcard column without text analysis', () => {
  test.beforeAll(async () => {
    await clean()
    await setup(id)
  })

  test('matches on a group of characters inside the value', async () => {
    const res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'ulange', q_mode: 'complete', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code, 'boulangerie')
  })

  test('does not widen the match to other values', async () => {
    const res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'zzz', q_mode: 'complete', q_fields: 'code' } })
    assert.equal(res.data.total, 0)
  })

  test('text-analyzed wildcard column keeps matching the same way', async () => {
    const res = await ax.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'ulange', q_mode: 'complete', q_fields: 'full' } })
    assert.equal(res.data.total, 1)
  })
})
