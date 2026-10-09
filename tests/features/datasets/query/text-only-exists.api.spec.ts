import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const ax = await axiosAuth('test_user1@test.com')

// A "long text" column, as prepareSchema configures textarea/markdown fields: no exact keyword
// index, no doc_values, only the analyzed sub-field. Existence must still be filterable.
const textOnlyCapabilities = { index: false, values: false, insensitive: false }

const setup = async (id: string, capabilities: Record<string, boolean> = textOnlyCapabilities) => {
  await ax.post('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    schema: [
      { key: 'label', type: 'string' },
      { key: 'bio', type: 'string', 'x-capabilities': capabilities }
    ]
  })
  await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [
    { label: 'with', bio: 'une biographie assez longue' },
    { label: 'without' }
  ])
  await waitForFinalize(ax, id)
}

test.describe('_exists on a text-only column', () => {
  test.beforeEach(async () => { await clean() })

  test('_exists matches the line that has a value', async () => {
    await setup('to-exists')
    const res = await ax.get('/api/v1/datasets/to-exists/lines', { params: { bio_exists: 'true' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'with')
  })

  test('_nexists matches the line that has no value', async () => {
    await setup('to-nexists')
    const res = await ax.get('/api/v1/datasets/to-nexists/lines', { params: { bio_nexists: 'true' } })
    assert.equal(res.data.total, 1)
    assert.equal(res.data.results[0].label, 'without')
  })

  test('_exists still works when only the unstemmed analysis is kept', async () => {
    await setup('to-exists-std', { index: false, values: false, insensitive: false, text: false })
    const res = await ax.get('/api/v1/datasets/to-exists-std/lines', { params: { bio_exists: 'true' } })
    assert.equal(res.data.total, 1)
  })

  test('_exists is refused when no indexed representation can answer it', async () => {
    await setup('to-exists-none', { index: false, values: false, insensitive: false, text: false, textStandard: false })
    await assert.rejects(ax.get('/api/v1/datasets/to-exists-none/lines', { params: { bio_exists: 'true' } }),
      (e: any) => e.status === 400)
  })

  test('_exists works on an unindexed but sortable column through its doc_values', async () => {
    await setup('to-exists-dv', { index: false })
    const res = await ax.get('/api/v1/datasets/to-exists-dv/lines', { params: { bio_exists: 'true' } })
    assert.equal(res.data.total, 1)
  })
})
