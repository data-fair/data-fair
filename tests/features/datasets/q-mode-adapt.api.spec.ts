import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean, config } from '../../support/axios.ts'
import { waitForFinalize, setConfig } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

// q_mode=or|and|adapt (see docs/superpowers/plans/2026-08-01-adapt-or-of-retained.md and
// benchmark/INVESTIGATIONS.md §14). adapt = ignore the most common query words in filtering —
// just enough that the RETAINED-WORD UNION stays above the cap — while every word keeps
// scoring; the match set is the plain OR minus docs that only matched ignored words.
// THE INVARIANT under test: searches totalling under the cap are untouched.

const id = 'qmodeadapt'
// Deterministic word counts (test cap=100, dataset 2640 rows → probability clamps to 0.5,
// floorSample = ceil(100 × 0.5 × 1.2) = 60 sampled docs = 120 true docs):
//  - 60 rows   'commun rare …'      (count('rare') = 200 ≥ cap → "retain rare" qualifies; 'commun' ignored)
//  - 140 rows  'rare autre …'
//  - 2000 rows 'commun seulement …' (OR unions ≥ cap → adapt engages)
//  - 200 rows  'grand ensemble …'   (phrase-like: the words co-occur, so ignoring one would
//    exclude nothing — the min-bite guard must keep adapt a no-op, ignoredWords absent)
//  - 40 rows   'petit exemple …'    (OR union 40 < cap → invariant: untouched)
//  - 70 rows   'commun alpha …'  +  130 rows 'commun beta …'  (the OR proof: for
//    q='commun alpha beta' adapt must ignore 'commun' and retain BOTH rare words —
//    alpha-rows and beta-rows share no rare word, so a conjunction would return nothing;
//    retained-union 200 ≥ 120 qualifies, keep-only-alpha 70 < 120 cannot, with safe
//    sampling margins on both sides at p=0.5)
const rows: Array<{ _id: string, str: string, n: number }> = []
const push = (str: string) => rows.push({ _id: String(rows.length).padStart(5, '0'), str, n: rows.length })
for (let i = 0; i < 60; i++) push('commun rare')
for (let i = 0; i < 140; i++) push('rare autre')
for (let i = 0; i < 2000; i++) push('commun seulement')
for (let i = 0; i < 200; i++) push('grand ensemble')
for (let i = 0; i < 40; i++) push('petit exemple')
for (let i = 0; i < 70; i++) push('commun alpha')
for (let i = 0; i < 130; i++) push('commun beta')

const defaultCfg = { minDatasetSize: 100000, cap: 10000, sampleTarget: 20000 }
const testCfg = { minDatasetSize: 1000, cap: 100, sampleTarget: 1000 }

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
    assert.deepEqual(res.meta.ignoredWords, ['commun'])
    assert.ok(Number.isInteger(res.meta.totalMarginPct))
    assert.equal(res.meta.hints, undefined) // meta describes, hints only carry actionable advice
    assert.ok(res.total >= 140 && res.total < 280, `estimate ${res.total} implausible for true 200`)
    // ignored words still score: 'commun rare' rows outrank 'rare autre' rows
    assert.equal(res.results[0].str, 'commun rare')
  })

  test('adapt ignores nothing when ignoring would not shrink the set (co-occurring words)', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'grand ensemble', q_mode: 'adapt' } })).data
    assert.equal(res.meta.ignoredWords, undefined) // nothing was ignored → no field, just the estimate
    assert.ok(Number.isInteger(res.meta.totalMarginPct))
    assert.ok(res.total >= 140 && res.total < 280, `estimate ${res.total} implausible for true 200`)
  })

  test('retained words stay an OR: rows matching either rare word are all kept', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun alpha beta', q_mode: 'adapt', size: 100 } })).data
    assert.deepEqual(res.meta.ignoredWords, ['commun'])
    // the tightened set is the UNION of alpha-rows and beta-rows (70 + 130 = 200 — a
    // conjunction of the retained words would be empty: no row contains both)
    assert.ok(res.total >= 140 && res.total < 280, `estimate ${res.total} implausible for true 200`)
    const strs = new Set(res.results.map((r: any) => r.str))
    assert.ok(strs.has('commun alpha'), 'alpha-only rows must stay in the set')
    assert.ok(strs.has('commun beta'), 'beta-only rows must stay in the set')
  })

  test('the invariant: searches under the cap are untouched by adapt', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'petit exemple', q_mode: 'adapt' } })).data
    assert.equal(res.total, 40) // exact, full OR semantics
    assert.equal(res.meta, undefined)
  })

  test('q_ignored applies the filter directly, no preflight', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_ignored: 'commun', count: 'exact' } })).data
    assert.equal(res.total, 200) // docs matching the retained word 'rare'
    assert.equal(res.meta, undefined)
    const bad = await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_ignored: 'absent' } }).catch((err: any) => err)
    assert.equal(bad.status, 400) // q_ignored words must be tokens of q
    const bad2 = await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_ignored: 'commun,rare' } }).catch((err: any) => err)
    assert.equal(bad2.status, 400) // at least one word must remain retained
  })

  test('adapt pins the exclusion in the next link', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: 'adapt', size: 10 } })).data
    assert.ok(res.next.includes('q_ignored=commun'), res.next)
  })

  test('q_mode=and stays available as a manual mode', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: 'and', count: 'exact' } })).data
    assert.equal(res.total, 60) // both words required
    assert.equal(res.meta, undefined)
  })

  test('numeric q_mode is rejected', async () => {
    const bad = await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: '3' } }).catch((err: any) => err)
    assert.equal(bad.status, 400)
  })

  test('adapt is the default mode', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare' } })).data
    assert.deepEqual(res.meta.ignoredWords, ['commun'])
  })

  test('q_mode=or and count=exact keep the broad exact behaviour', async () => {
    for (const params of [{ q: 'commun rare', count: 'exact' }, { q: 'commun rare', q_mode: 'or', count: 'exact' }] as Record<string, any>[]) {
      const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params })).data
      assert.equal(res.total, 2400) // union (60 both-words rows counted once, plus the alpha/beta commun rows)
      assert.equal(res.meta, undefined)
    }
  })

  test('sqs syntax in q makes adapt step aside (plain cap + estimate)', async () => {
    // '+commun rare' is expert sqs syntax (commun required, rare optional) — adapt must not
    // reinterpret it; the request falls back to the capped search with a sampled estimate
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: '+commun rare', q_mode: 'adapt' } })).data
    assert.equal(res.meta.ignoredWords, undefined)
    assert.ok(Number.isInteger(res.meta.totalMarginPct))
    assert.ok(res.total >= 1600 && res.total < 2600, `estimate ${res.total} implausible for true 2260`)
  })

  test('the ignored words are reported once, as data — never duplicated as a hint', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', hint: 'true' } })).data
    assert.deepEqual(res.meta.ignoredWords, ['commun'])
    assert.equal(res.meta.hints, undefined, JSON.stringify(res.meta.hints))
    assert.equal(res.hint, undefined) // the legacy root field is gone
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
      if (res.next) assert.ok(res.next.includes('q_ignored=commun'), res.next)
      url = res.next
    }
    assert.equal(collected.length, 200)
    assert.equal(new Set(collected).size, 200) // no duplicates across pages
  })
})
