import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, config } from '../../support/axios.ts'
import { waitForFinalize, setConfig } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// Approximate counts for ranked text searches (see load-management.md §9 and
// docs/superpowers/plans/2026-07-30-approx-count-ranked-search.md). The invariant under
// test: searches totalling under the cap behave exactly as today; above it the total
// becomes a `_rand`-sampled estimate described by meta.totalMarginPct, while the top hits
// stay identical to the exact behaviour.

const N = 2500
const id = 'approxcount'
// `str` holds the searched token "label" on rows where i % 7 !== 0 (deterministic count);
// lat/lon make the dataset geo so the geojson format works
const rows = Array.from({ length: N }, (_, i) => ({
  _id: String(i).padStart(5, '0'),
  str: i % 7 === 0 ? `other ${i}` : `label ${i}`,
  n: i,
  lat: 47 + (i % 50) * 0.001,
  lon: -2 + (i % 50) * 0.001
}))
const EXACT = rows.filter(r => r.str.startsWith('label')).length

const defaultCfg = { minDatasetSize: 100000, cap: 10000, sampleTarget: 100000 }
const testCfg = { minDatasetSize: 1000, cap: 100, sampleTarget: 1000 }
// probability = clamp(1000/2500, floor 100/100 = 1, 0.5) = 0.5 → sampled ≈ 0.5·EXACT, stderr ≈ 2.1%

test.describe('approximate count for ranked text search', () => {
  test.beforeAll(async () => {
    await clean()
    // the 2500-row fixture exceeds the default store_bytes limit — raise it so checkStorage
    // never 429s regardless of which suites ran (and consumed storage) before this one
    await testUser1.post('/api/v1/limits/user/test_user1',
      { store_bytes: { limit: 10000000, consumption: 0 }, lastUpdate: new Date().toISOString() },
      { params: { key: config.secretKeys.limits } })
    await testUser1.put('/api/v1/datasets/' + id, {
      isRest: true,
      title: id,
      schema: [
        { key: 'str', type: 'string' },
        { key: 'n', type: 'integer' },
        { key: 'lat', type: 'number', 'x-refersTo': 'http://schema.org/latitude' },
        { key: 'lon', type: 'number', 'x-refersTo': 'http://schema.org/longitude' }
      ]
    })
    for (let i = 0; i < rows.length; i += 1000) {
      const res: any = await testUser1.post(`/api/v1/datasets/${id}/_bulk_lines`, rows.slice(i, i + 1000))
      assert.equal(res.data.nbOk, rows.slice(i, i + 1000).length)
    }
    await waitForFinalize(testUser1, id, 30000)
    await setConfig('elasticsearch.approxCount', testCfg)
  })
  test.afterAll(async () => {
    await setConfig('elasticsearch.approxCount', defaultCfg)
  })

  test('ranked q search over the cap returns an estimated total, with its margin', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', size: 3 } })).data
    assert.ok(Number.isInteger(res.meta?.totalMarginPct), JSON.stringify(res.meta))
    assert.ok(res.meta.totalMarginPct >= 1 && res.meta.totalMarginPct <= 30, `margin ${res.meta.totalMarginPct} implausible for ~1000 samples`)
    assert.ok(res.total > testCfg.cap, `estimate ${res.total} must exceed the cap`)
    // 0.5-probability sample of 2143 matches: ±20% is > 9 sigma, no flakiness at this width
    assert.ok(res.total > EXACT * 0.8 && res.total < EXACT * 1.2, `estimate ${res.total} implausibly far from ${EXACT}`)
    assert.equal(res.results.length, 3)
  })

  test('count=exact keeps todays exact behaviour', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', count: 'exact' } })).data
    assert.equal(res.total, EXACT)
    assert.equal(res.meta, undefined)
  })

  test('top hits are identical with and without the cap', async () => {
    const approx = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', size: 20, select: '_id' } })).data
    const exact = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', size: 20, select: '_id', count: 'exact' } })).data
    assert.deepEqual(approx.results.map((r: any) => r._id), exact.results.map((r: any) => r._id))
  })

  test('non-ranked shapes stay exact', async () => {
    for (const params of [
      { q: 'label', sort: 'n' }, // explicit sort → not ranked-primary
      {}, // no q
      { q: 'label', count: 'false' }
    ] as Record<string, any>[]) {
      const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params })).data
      assert.equal(res.meta, undefined, JSON.stringify(params))
      if (params.count !== 'false') assert.equal(typeof res.total, 'number')
      if (!params.sort && params.q && params.count !== 'false') assert.equal(res.total, EXACT)
    }
  })

  test('results below the cap keep an exact total with no flag', async () => {
    const exactOther = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'other', count: 'exact' } })).data.total
    assert.ok(exactOther > 100, 'fixture: "other" must exceed the small test cap')
    await setConfig('elasticsearch.approxCount', { ...testCfg, cap: 1000 }) // raise cap above the match count
    const capped = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'other' } })).data
    assert.equal(capped.total, exactOther)
    assert.equal(capped.meta, undefined)
    await setConfig('elasticsearch.approxCount', testCfg)
  })

  test('count=estimate shares the cap: exact below, sampled estimate above', async () => {
    // historical behaviour returned a bare misleading total of 1000; count=estimate is now the
    // ranked-search counting mode as an explicit opt-in — same cap, same sampler, any query shape
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', count: 'estimate' } })).data
    assert.ok(Number.isInteger(res.meta?.totalMarginPct), JSON.stringify(res.meta))
    assert.ok(res.total > testCfg.cap, `estimate ${res.total} must exceed the cap`)
    assert.ok(res.total > EXACT * 0.8 && res.total < EXACT * 1.2, `estimate ${res.total} implausibly far from ${EXACT}`)
    // below the cap the total stays exact and unflagged
    await setConfig('elasticsearch.approxCount', { ...testCfg, cap: 1000 })
    const small = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'other', count: 'estimate' } })).data
    assert.equal(small.meta, undefined)
    assert.ok(small.total < 1000) // exact 357
    await setConfig('elasticsearch.approxCount', testCfg)
  })

  test('hints advise, meta describes: an estimated total carries no hint restating it', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', hint: 'true' } })).data
    assert.ok(Number.isInteger(res.meta?.totalMarginPct))
    assert.equal(res.meta.hints, undefined, JSON.stringify(res.meta.hints))
  })

  test('geojson envelope carries the estimated total too', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', format: 'geojson', size: 2 } })).data
    assert.ok(res.total > testCfg.cap)
    assert.ok(Number.isInteger(res.meta?.totalMarginPct))
  })
})
