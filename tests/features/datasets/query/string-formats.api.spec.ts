import { test } from '../../../fixtures/diagnostics.ts'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

// an organization account, as the ods compatibility is an organization setting
const ax = await axiosAuth('test_datafair_user1@test.com', 'test_datafair_org1')
const longUri = 'https://example.com/' + 'a'.repeat(250)

// string formats other than the dates (email, uri...) are keyword strings like a plain column
test.describe('string columns with a non-date format', () => {
  test.beforeAll(async () => {
    await clean()
    await ax.put('/api/v1/settings/organization/test_datafair_org1', { compatODS: true })
    await ax.post('/api/v1/datasets/str-formats', {
      isRest: true,
      title: 'str-formats',
      schema: [
        { key: 'email', type: 'string', format: 'email' },
        { key: 'link', type: 'string', format: 'uri' }
      ]
    })
    await ax.post('/api/v1/datasets/str-formats/_bulk_lines', [
      { email: 'a@example.com', link: 'https://example.com/short' },
      { email: 'B@example.com', link: longUri },
      { email: 'c@example.com' }
    ])
    await waitForFinalize(ax, 'str-formats')
  })

  test('the index is created and the lines are searchable', async () => {
    const res = await ax.get('/api/v1/datasets/str-formats/lines', { params: { q: 'example.com' } })
    assert.equal(res.data.total, 3)
  })

  test('sorting is case insensitive', async () => {
    const res = await ax.get('/api/v1/datasets/str-formats/lines', { params: { sort: 'email', select: 'email' } })
    assert.deepEqual(res.data.results.map((r: any) => r.email), ['a@example.com', 'B@example.com', 'c@example.com'])
  })

  test('a value longer than the keyword limit is handled like on a plain column', async () => {
    await assert.rejects(ax.get('/api/v1/datasets/str-formats/lines', { params: { link_eq: longUri } }),
      (e: any) => e.status === 400)
    const res = await ax.get('/api/v1/datasets/str-formats/lines', { params: { link_exists: 'true' } })
    assert.equal(res.data.total, 2)
  })

  test('ods order_by is case insensitive', async () => {
    const res = await ax.get('/api/v1/datasets/str-formats/compat-ods/records', { params: { order_by: 'email', select: 'email' } })
    assert.deepEqual(res.data.results.map((r: any) => r.email), ['a@example.com', 'B@example.com', 'c@example.com'])
  })
})
