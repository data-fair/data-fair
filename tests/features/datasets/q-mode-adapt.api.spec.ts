import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, config } from '../../support/axios.ts'
import { waitForFinalize, setConfig } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// q_mode=or|and|adapt (see docs/superpowers/plans/2026-07-30-approx-count-ranked-search.md
// Tasks 6-8). adapt = ignore the most common query words in filtering — just enough that the
// filtered set stays above the cap — while every word keeps scoring; report the ignored words.
// THE INVARIANT under test: searches totalling under the cap are untouched.

const id = 'qmodeadapt'
// Deterministic word counts (test cap=100, dataset 2440 rows → probability ≈ 0.41,
// floorSample = ceil(100 × 0.41 × 1.2) ≈ 50 sampled docs ≈ 122 true docs):
//  - 60 rows   'commun rare …'      (AND set 60 < ~122 → 'commun' must be dropped from filtering)
//  - 140 rows  'rare autre …'       (count('rare') = 200 ≥ cap → the rung "require rare" qualifies)
//  - 2000 rows 'commun seulement …' (OR union 2200 ≥ cap → adapt engages)
//  - 200 rows  'grand ensemble …'   (AND set 200 → nothing needs dropping)
//  - 40 rows   'petit exemple …'    (OR union 40 < cap → invariant: untouched)
const rows: Array<{ _id: string, str: string, n: number }> = []
const push = (str: string) => rows.push({ _id: String(rows.length).padStart(5, '0'), str, n: rows.length })
for (let i = 0; i < 60; i++) push('commun rare')
for (let i = 0; i < 140; i++) push('rare autre')
for (let i = 0; i < 2000; i++) push('commun seulement')
for (let i = 0; i < 200; i++) push('grand ensemble')
for (let i = 0; i < 40; i++) push('petit exemple')

const defaultCfg = { minDatasetSize: 100000, cap: 10000, sampleTarget: 100000, minProbability: 0.01, adaptFloorSafety: 1.2 }
const testCfg = { minDatasetSize: 1000, cap: 100, sampleTarget: 1000, minProbability: 0.01, adaptFloorSafety: 1.2 }

test.describe('q_mode adapt — common words ignored in filtering', () => {
  test.beforeAll(async () => {
    await clean()
    // the fixture exceeds the default store_bytes limit — raise it so checkStorage never 429s
    await testUser1.post('/api/v1/limits/user/test_user1',
      { store_bytes: { limit: 10000000, consumption: 0 }, lastUpdate: new Date().toISOString() },
      { params: { key: config.secretKeys.limits } })
    await testUser1.put('/api/v1/datasets/' + id, {
      isRest: true, title: id, schema: [{ key: 'str', type: 'string' }, { key: 'n', type: 'integer' }]
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

  test('adapt drops the most common word from filtering until the set clears the cap', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: 'adapt', size: 20 } })).data
    assert.deepEqual(res.qAdapt, { required: ['rare'], ignored: ['commun'] })
    assert.equal(res.totalRelation, 'estimate')
    assert.ok(res.total >= 140 && res.total < 280, `estimate ${res.total} implausible for true 200`)
    // ignored words still score: 'commun rare' rows outrank 'rare autre' rows
    assert.equal(res.results[0].str, 'commun rare')
  })

  test('adapt keeps every word required when the strict set already clears the cap', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'grand ensemble', q_mode: 'adapt' } })).data
    assert.equal(res.qAdapt, undefined) // nothing was ignored → no flag, just the estimate
    assert.equal(res.totalRelation, 'estimate')
    assert.ok(res.total >= 140 && res.total < 280, `estimate ${res.total} implausible for true 200`)
  })

  test('the invariant: searches under the cap are untouched by adapt', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'petit exemple', q_mode: 'adapt' } })).data
    assert.equal(res.total, 40) // exact, full OR semantics
    assert.equal(res.totalRelation, undefined)
    assert.equal(res.qAdapt, undefined)
  })

  test('q_required applies the filter directly, no preflight', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_required: 'rare', count: 'exact' } })).data
    assert.equal(res.total, 200)
    assert.equal(res.qAdapt, undefined)
    const bad = await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_required: 'absent' } }).catch((err: any) => err)
    assert.equal(bad.status, 400) // q_required words must be tokens of q
  })

  test('adapt pins the exclusion in the next link', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: 'adapt', size: 10 } })).data
    assert.ok(res.next.includes('q_required=rare'), res.next)
  })

  test('q_mode=and stays available as a manual mode', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: 'and', count: 'exact' } })).data
    assert.equal(res.total, 60) // both words required
    assert.equal(res.qAdapt, undefined)
  })

  test('numeric q_mode is rejected', async () => {
    const bad = await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: '3' } }).catch((err: any) => err)
    assert.equal(bad.status, 400)
  })

  test('q_mode=or and default keep todays behaviour', async () => {
    for (const params of [{ q: 'commun rare', count: 'exact' }, { q: 'commun rare', q_mode: 'or', count: 'exact' }] as Record<string, any>[]) {
      const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params })).data
      assert.equal(res.total, 2200) // union (60 both-words rows counted once)
      assert.equal(res.qAdapt, undefined)
    }
  })

  test('a next-paginated chain enumerates exactly the tightened set', async () => {
    // the download pattern: follow next links to exhaustion — must terminate, stay on the
    // pinned filter for every page, and yield exactly the tightened set (200 rows)
    let url: string | undefined = `/api/v1/datasets/${id}/lines?q=${encodeURIComponent('commun rare')}&q_mode=adapt&size=50`
    const collected: string[] = []
    for (let page = 0; url; page++) {
      assert.ok(page < 10, 'chain must terminate')
      const res: any = (await testUser1.get(url)).data
      collected.push(...res.results.map((r: any) => r._id))
      if (res.next) assert.ok(res.next.includes('q_required=rare'), res.next)
      url = res.next
    }
    assert.equal(collected.length, 200)
    assert.equal(new Set(collected).size, 200) // no duplicates across pages
  })
})
