import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../../support/axios.ts'
import { waitForFinalize } from '../../../support/workers.ts'

const adminAx = await axiosAuth('test_superadmin@test.com', undefined, true)
const axOrg = await axiosAuth('test_user1@test.com', 'test_org1')

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

test.describe('keyword ignore_above — per-request hint', () => {
  test.beforeEach(async () => { await clean() })

  test('uncertain _starts on a flagged plain column attaches a readable hint', async () => {
    await setup('ia-hint')
    const res = await ax.get('/api/v1/datasets/ia-hint/lines', { params: { plain_starts: 'sh', hint: 'true' } })
    assert.ok(typeof res.data.hint === 'string' && res.data.hint.includes('plain'))
  })
  test('no hint on a clean column even with hint=true', async () => {
    await ax.post('/api/v1/datasets/ia-clean', { isRest: true, title: 'ia-clean', schema: [{ key: 'plain', type: 'string' }] })
    await ax.post('/api/v1/datasets/ia-clean/_bulk_lines', [{ plain: 'short' }])
    await waitForFinalize(ax, 'ia-clean')
    const res = await ax.get('/api/v1/datasets/ia-clean/lines', { params: { plain_starts: 'sh', hint: 'true', count: 'false' } })
    assert.equal(res.data.hint, undefined)
  })
})

test.describe('keyword ignore_above — diagnose + ODS where equality', () => {
  test.beforeEach(async () => { await clean() })

  test('diagnose surfaces IgnoredKeywordValues for a long-valued plain column', async () => {
    await setup('ia-diag')
    const diagnose = (await adminAx.get('/api/v1/datasets/ia-diag/_diagnose')).data
    assert.ok(diagnose.warnings.find((w: any) => w.code === 'IgnoredKeywordValues'))
  })

  test('ODS where equality with a > 200-char value and no wildcard → 400', async () => {
    await axOrg.put('/api/v1/settings/organization/test_org1', { compatODS: true })
    await axOrg.post('/api/v1/datasets/ia-ods', {
      isRest: true,
      title: 'ia-ods',
      schema: [
        { key: 'plain', type: 'string' },
        { key: 'wild', type: 'string', 'x-capabilities': { wildcard: true } }
      ]
    })
    await axOrg.post('/api/v1/datasets/ia-ods/_bulk_lines', [
      { plain: 'short', wild: 'short' },
      { plain: long, wild: long }
    ])
    await waitForFinalize(axOrg, 'ia-ods')
    await assert.rejects(
      axOrg.get('/api/v1/datasets/ia-ods/compat-ods/records', { params: { where: `plain = "${long}"` } }),
      (e: any) => e.status === 400)
  })
})
