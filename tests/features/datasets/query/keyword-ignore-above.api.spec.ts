import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const ax = await axiosAuth('test_user1@test.com')
const long = 'L'.repeat(260)

// dataset with a plain keyword column and a wildcard-capable column; one short + one long row.
const setup = async (id: string) => {
  await ax.post('/api/v1/datasets/' + id, {
    isRest: true,
    title: id,
    schema: [
      { key: 'plain', type: 'string' },
      { key: 'wild', type: 'string', 'x-capabilities': { wildcard: true } }
    ]
  })
  await ax.post(`/api/v1/datasets/${id}/_bulk_lines`, [
    { plain: 'short', wild: 'short' },
    { plain: long, wild: long }
  ])
  await waitForFinalize(ax, id)
}

test.describe('keyword ignore_above — exact filters (operand-driven)', () => {
  test.beforeEach(async () => { await clean() })

  test('_eq with a > 200-char value on a plain column → 400', async () => {
    await setup('ia-eq')
    await assert.rejects(ax.get('/api/v1/datasets/ia-eq/lines', { params: { plain_eq: long } }),
      (e: any) => e.status === 400)
  })
  test('_eq with a > 200-char value routes to .wildcard and matches', async () => {
    await setup('ia-eq2')
    const res = await ax.get('/api/v1/datasets/ia-eq2/lines', { params: { wild_eq: long } })
    assert.equal(res.data.total, 1)
  })
  test('_eq short value still works on the plain column', async () => {
    await setup('ia-eq3')
    const res = await ax.get('/api/v1/datasets/ia-eq3/lines', { params: { plain_eq: 'short' } })
    assert.equal(res.data.total, 1)
  })
  test('_in with a > 200-char value and no wildcard → 400', async () => {
    await setup('ia-in')
    await assert.rejects(ax.get('/api/v1/datasets/ia-in/lines', { params: { plain_in: `short,${long}` } }),
      (e: any) => e.status === 400)
  })
})

test.describe('keyword ignore_above — exists/starts (flag-gated)', () => {
  test.beforeEach(async () => { await clean() })

  test('_exists finds the long-valued row on the plain column (union after detection)', async () => {
    await setup('ia-exists')
    const res = await ax.get('/api/v1/datasets/ia-exists/lines', { params: { plain_exists: 'true' } })
    assert.equal(res.data.total, 2)
  })
  test('_nexists does not wrongly include the long-valued row', async () => {
    await setup('ia-nexists')
    const res = await ax.get('/api/v1/datasets/ia-nexists/lines', { params: { plain_nexists: 'true' } })
    assert.equal(res.data.total, 0)
  })
  test('_starts matches a long value through .wildcard on the wildcard column', async () => {
    await setup('ia-starts')
    const res = await ax.get('/api/v1/datasets/ia-starts/lines', { params: { wild_starts: 'LL' } })
    assert.equal(res.data.total, 1)
  })
})
