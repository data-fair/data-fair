import { test } from '../../../fixtures/diagnostics.ts'
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
  // all tests only read this fixture, so it is built once for the whole describe block
  test.beforeAll(async () => {
    await clean()
    await setup('ia-eq')
  })

  test('_eq with a > 200-char value on a plain column → 400', async () => {
    await assert.rejects(ax.get('/api/v1/datasets/ia-eq/lines', { params: { plain_eq: long } }),
      (e: any) => e.status === 400)
  })
  test('_eq with a > 200-char value routes to .wildcard and matches', async () => {
    const res = await ax.get('/api/v1/datasets/ia-eq/lines', { params: { wild_eq: long } })
    assert.equal(res.data.total, 1)
  })
  test('_eq short value still works on the plain column', async () => {
    const res = await ax.get('/api/v1/datasets/ia-eq/lines', { params: { plain_eq: 'short' } })
    assert.equal(res.data.total, 1)
  })
  test('_in with a > 200-char value and no wildcard → 400', async () => {
    await assert.rejects(ax.get('/api/v1/datasets/ia-eq/lines', { params: { plain_in: `short,${long}` } }),
      (e: any) => e.status === 400)
  })
})

test.describe('keyword ignore_above — exists/starts (flag-gated)', () => {
  // all tests only read this fixture, so it is built once for the whole describe block
  test.beforeAll(async () => {
    await clean()
    await setup('ia-exists')
  })

  test('_exists finds the long-valued row on the plain column (union after detection)', async () => {
    const res = await ax.get('/api/v1/datasets/ia-exists/lines', { params: { plain_exists: 'true' } })
    assert.equal(res.data.total, 2)
  })
  test('_nexists does not wrongly include the long-valued row', async () => {
    const res = await ax.get('/api/v1/datasets/ia-exists/lines', { params: { plain_nexists: 'true' } })
    assert.equal(res.data.total, 0)
  })
  test('_starts matches a long value through .wildcard on the wildcard column', async () => {
    const res = await ax.get('/api/v1/datasets/ia-exists/lines', { params: { wild_starts: 'LL' } })
    assert.equal(res.data.total, 1)
  })
})

test.describe('keyword ignore_above — per-request hint', () => {
  // both fixtures only get read, so build them once and clean() only once for the block
  test.beforeAll(async () => {
    await clean()
    await setup('ia-hint')
    await ax.post('/api/v1/datasets/ia-clean', { isRest: true, title: 'ia-clean', schema: [{ key: 'plain', type: 'string' }] })
    await ax.post('/api/v1/datasets/ia-clean/_bulk_lines', [{ plain: 'short' }])
    await waitForFinalize(ax, 'ia-clean')
  })

  test('uncertain _starts on a flagged plain column attaches a readable hint', async () => {
    const res = await ax.get('/api/v1/datasets/ia-hint/lines', { params: { plain_starts: 'sh', hint: 'true' } })
    const hints: string[] = res.data.meta?.hints ?? []
    assert.ok(hints.some((h: string) => h.includes('plain')), JSON.stringify(hints))
  })
  test('no hint on a clean column even with hint=true', async () => {
    const res = await ax.get('/api/v1/datasets/ia-clean/lines', { params: { plain_starts: 'sh', hint: 'true', count: 'false' } })
    assert.equal(res.data.meta, undefined)
  })
})

test.describe('keyword ignore_above — diagnose', () => {
  // both tests only read this fixture, so it is built once for the whole describe block
  test.beforeAll(async () => {
    await clean()
    await setup('ia-diag')
  })

  test('diagnose surfaces IgnoredKeywordValues for a long-valued plain column', async () => {
    const diagnose = (await adminAx.get('/api/v1/datasets/ia-diag/_diagnose')).data
    assert.ok(diagnose.warnings.find((w: any) => w.code === 'IgnoredKeywordValues'))
  })

  test('a newly long-valued plain column logs a journal warning at finalize', async () => {
    // the dataset journal must contain a non-error event mentioning the truncated column
    const journal = (await ax.get('/api/v1/datasets/ia-diag/journal')).data
    const ev = journal.find((e: any) => e.type === 'ignored-keyword-values')
    assert.ok(ev, 'expected an ignored-keyword-values journal event')
    assert.ok(typeof ev.data === 'string' && ev.data.includes('plain'), 'event should name the truncated column')
  })
})

// mutates organization settings, so it must stay isolated with its own clean()
test.describe('keyword ignore_above — ODS where equality', () => {
  test.beforeEach(async () => { await clean() })

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
