import { test } from '@playwright/test'
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

test.describe('q_mode=complete on a wildcard column without text analysis', () => {
  test.beforeEach(async () => { await clean() })

  test('matches on a group of characters inside the value', async () => {
    await setup('qwc-contains')
    const res = await ax.get('/api/v1/datasets/qwc-contains/lines', { params: { q: 'ulange', q_mode: 'complete', q_fields: 'code' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].code, 'boulangerie')
  })

  test('does not widen the match to other values', async () => {
    await setup('qwc-precise')
    const res = await ax.get('/api/v1/datasets/qwc-precise/lines', { params: { q: 'zzz', q_mode: 'complete', q_fields: 'code' } })
    assert.equal(res.data.total, 0)
  })

  test('text-analyzed wildcard column keeps matching the same way', async () => {
    await setup('qwc-full')
    const res = await ax.get('/api/v1/datasets/qwc-full/lines', { params: { q: 'ulange', q_mode: 'complete', q_fields: 'full' } })
    assert.equal(res.data.total, 1)
  })
})
