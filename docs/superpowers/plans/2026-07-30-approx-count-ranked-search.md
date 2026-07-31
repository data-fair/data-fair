# Approximate Count for Ranked Text Search — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop paying full-match scored enumeration on page-1 ranked text searches over large datasets: cap `track_total_hits` at 10 000 and, when the cap is hit, replace the exact total with a sampled estimate computed from the indexed `_rand` field — transparently signalled in the API response and the table preview. On top of that machinery, extend `q_mode` with `or | and | adapt` (Tasks 6–8): `adapt` excludes from *filtering* the most common query words — just enough of them that the filtered set stays above the cap (never below 10 000 results; searches under the cap are untouched) — while every word keeps scoring, and reports the ignored words. This shrinks the match set itself, which also relieves aggregations, exports and deep pagination — costs the cap cannot touch. `adapt` ships opt-in; the default flip is a config value, staged per environment.

**Architecture:** A pure predicate (`getApproxCountMode`) decides per-request whether approx mode applies (ranked `q` search, large dataset, no overriding params). `prepareQuery` caps `track_total_hits` when it does. After the search, if `hits.total.relation === 'gte'`, a second cheap ES request counts the matches inside the stable `_rand < bound` sample slice (filter context, `size: 0`, request-cacheable) and extrapolates. The `/lines` JSON envelope gains an optional `totalRelation: "estimate"` field; the UI shows `~` plus a tooltip. `count=exact` restores today's behavior.

**Tech Stack:** Node/TS API (`api/` workspace), Elasticsearch 7.17+ (no `random_sampler` — ES ≥ 8.2 only; the `_rand` range filter replaces it), Vue 3 / Vuetify UI, Playwright test projects (`unit` / `api`).

## Global Constraints

- **Production ES is 7.17.28** — only 7.0-compatible features: numeric `track_total_hits`, filter-context counts, `size: 0` request cache, `_rand` range filter. NO `random_sampler` aggregation.
- **`_rand`** is a uniform random integer in `[0, 1_000_000)` on every indexed line (`api/src/datasets/utils/extensions.ts:718`, declared `x-calculated` in `api/src/datasets/utils/data-schema.ts:224`).
- **No breaking API change**: `total` stays a number; the only additions are the optional `totalRelation` response field and the `count=exact` param value. Requests with `sort=`, `after=`, `collapse=`, `count=false|estimate`, or without `q` behave exactly as today.
- **Evidence base**: `benchmark/INVESTIGATIONS.md` §11 (`count-split` experiment) — cap −42 % ES work with top-20 provably identical; `_rand` 1 % sample count ≈ 3 ms vs 8 ms exact, −1.6 % accuracy.
- Follow `docs/architecture/code-conventions.md` (pure logic in `operations.ts`, request-context accessors) and `docs/architecture/read-lines-efficiency.md` (do not restructure the `/lines` streaming pipeline).
- TypeScript ratchet: pre-push runs `dev/check-types-ratchet.sh` — no net-new tsc errors.
- Implementation happens in a **fresh worktree off `master`** (this plan was written on `perf-es-optims`, which carries benchmark/doc work only).
- Commit after each task; messages `feat(datasets): …` / `feat(ui): …` style.
- `q_mode` already has values `simple | complete`: `or` becomes an alias of `simple`, `complete` (autocomplete) is NEVER affected by the new modes, `and`/`adapt` are new (no numeric msm value — a free-integer-or-enum union renders poorly in OpenAPI doc viewers, and nothing internal needs it). The default mode is `config.elasticsearch.qModeDefault` (ships `'simple'`; flipping to `'adapt'` is a per-environment config decision, not code).
- Evidence for Tasks 6–8: `benchmark/INVESTIGATIONS.md` §12-C and `docs/architecture/text-search-evaluation.md` §7 (RNA real-corpus runs; `adapt` end-to-end 2–8 ms ES 8 / 2–24.5 ms ES 7 vs 22.5–59 ms today, decisions identical across ES versions).

---

### Task 1: Config keys + pure helpers (`getApproxCountMode`, `extrapolateApproxTotal`)

**Files:**
- Modify: `api/config/default.cjs:94` (inside the `elasticsearch` block, after `maxPageSize`)
- Modify: `api/config/type/schema.json:221-233` (properties + `required` list of the elasticsearch object)
- Modify: `api/src/datasets/es/operations.ts` (append near the other exported pure helpers)
- Test: `tests/features/datasets/approx-count-operations.unit.spec.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `getApproxCountMode(dataset: { count?: number }, query: Record<string, any>, cfg: ApproxCountConfig): ApproxCountMode | null` and `extrapolateApproxTotal(sampledCount: number, mode: ApproxCountMode): number`, plus types `ApproxCountConfig { minDatasetSize: number | null, cap: number, sampleTarget: number, minProbability: number }` and `ApproxCountMode { cap: number, randBound: number, probability: number }`. Config path: `config.elasticsearch.approxCount`.

- [ ] **Step 1: Add the config block**

In `api/config/default.cjs`, after `maxPageSize: 10000,`:

```js
    // Approximate counts for ranked text searches on large datasets: cap track_total_hits
    // and estimate overflowing totals from the `_rand < randBound` sample slice.
    // minDatasetSize: null disables the feature entirely.
    approxCount: {
      minDatasetSize: 100000,
      cap: 10000,
      sampleTarget: 100000, // aim for ~this many docs in the sample slice
      minProbability: 0.01 // never sample below 1% (accuracy floor near the cap boundary)
    },
```

In `api/config/type/schema.json`, add `"approxCount"` to the elasticsearch object's `required` array (line 221) and to its `properties`:

```json
        "approxCount": {
          "type": "object",
          "additionalProperties": false,
          "required": ["minDatasetSize", "cap", "sampleTarget", "minProbability"],
          "properties": {
            "minDatasetSize": { "type": ["number", "null"] },
            "cap": { "type": "number" },
            "sampleTarget": { "type": "number" },
            "minProbability": { "type": "number" }
          }
        },
```

Run: `npm run build-types` (regenerates `api/config/type/index.ts`), then `npm run check-types`.
Expected: type build succeeds; no net-new errors.

- [ ] **Step 2: Write the failing unit test**

`tests/features/datasets/approx-count-operations.unit.spec.ts`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { getApproxCountMode, extrapolateApproxTotal } from '../../../api/src/datasets/es/operations.ts'

const cfg = { minDatasetSize: 100000, cap: 10000, sampleTarget: 100000, minProbability: 0.01 }
const bigDataset = { count: 1_000_000 }

test('approx mode activates only for ranked q searches on large datasets', () => {
  const mode = getApproxCountMode(bigDataset, { q: 'analyse' }, cfg)
  assert.ok(mode)
  assert.equal(mode.cap, 10000)
  // probability = clamp(100000/1000000, 0.01, 0.5) = 0.1 → randBound 100000
  assert.equal(mode.randBound, 100000)
  assert.equal(mode.probability, 0.1)
})

test('approx mode stays off for every excluded shape', () => {
  assert.equal(getApproxCountMode(bigDataset, {}, cfg), null) // no q
  assert.equal(getApproxCountMode(bigDataset, { q: '  ' }, cfg), null) // blank q
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', sort: 'field1' }, cfg), null) // explicit sort → not ranked-primary
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', after: '[10]' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', collapse: 'field1' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', count: 'false' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', count: 'estimate' }, cfg), null)
  assert.equal(getApproxCountMode(bigDataset, { q: 'a', count: 'exact' }, cfg), null) // escape hatch
  assert.equal(getApproxCountMode({ count: 50000 }, { q: 'a' }, cfg), null) // small dataset
  assert.equal(getApproxCountMode({}, { q: 'a' }, cfg), null) // no count metadata → safe default off
  assert.equal(getApproxCountMode(bigDataset, { q: 'a' }, { ...cfg, minDatasetSize: null }), null) // kill switch
  assert.ok(getApproxCountMode(bigDataset, { _c_q: 'a' }, cfg)) // agent-context q counts as q (commons.ts:316)
})

test('probability is adjusted to dataset size and clamped', () => {
  assert.equal(getApproxCountMode({ count: 100000 }, { q: 'a' }, cfg)!.probability, 0.5) // clamp high
  assert.equal(getApproxCountMode({ count: 50_000_000 }, { q: 'a' }, cfg)!.probability, 0.01) // clamp low
})

test('extrapolation divides by probability and floors at cap+1', () => {
  const mode = { cap: 10000, randBound: 10000, probability: 0.01 }
  assert.equal(extrapolateApproxTotal(8392, mode), 839200)
  assert.equal(extrapolateApproxTotal(3, mode), 10001) // relation was gte, so never report ≤ cap
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/approx-count-operations.unit.spec.ts --project unit`
Expected: FAIL — `getApproxCountMode` is not exported.

- [ ] **Step 4: Implement the helpers**

Append to `api/src/datasets/es/operations.ts`:

```ts
// ---- Approximate counts for ranked text searches (see load-management.md §9) ----

export interface ApproxCountConfig {
  minDatasetSize: number | null
  cap: number
  sampleTarget: number
  minProbability: number
}

export interface ApproxCountMode {
  cap: number
  /** exclusive upper bound of the `_rand` sample slice (`_rand` is uniform in [0, 1_000_000)) */
  randBound: number
  /** exact sampling probability = randBound / 1_000_000 */
  probability: number
}

const RAND_RANGE = 1_000_000

/**
 * Decide whether a /lines request runs in approximate-count mode: page-1 ranked text
 * search (q present, _score is the primary sort — commons.ts appends _score only when
 * there is a q and no explicit sort) on a large dataset, with no param that already
 * controls counting. Returns the sampling parameters, or null for exact behaviour.
 */
export const getApproxCountMode = (
  dataset: { count?: number },
  query: Record<string, any>,
  cfg: ApproxCountConfig
): ApproxCountMode | null => {
  if (cfg.minDatasetSize == null) return null
  if (typeof dataset.count !== 'number' || dataset.count < cfg.minDatasetSize) return null
  if (!String(query.q ?? query._c_q ?? '').trim()) return null
  if (query.sort) return null
  if (query.after) return null
  if (query.collapse) return null
  if (query.count === 'false' || query.count === 'estimate' || query.count === 'exact') return null
  const probability = Math.min(0.5, Math.max(cfg.minProbability, cfg.sampleTarget / dataset.count))
  const randBound = Math.round(probability * RAND_RANGE)
  return { cap: cfg.cap, randBound, probability: randBound / RAND_RANGE }
}

/** Extrapolate the sample-slice count; the first request saw relation "gte", so never report ≤ cap. */
export const extrapolateApproxTotal = (sampledCount: number, mode: ApproxCountMode): number =>
  Math.max(mode.cap + 1, Math.round(sampledCount / mode.probability))
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx playwright test tests/features/datasets/approx-count-operations.unit.spec.ts --project unit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add api/config/default.cjs api/config/type/ api/src/datasets/es/operations.ts tests/features/datasets/approx-count-operations.unit.spec.ts
git commit -m "feat(datasets): approx-count config and pure mode/extrapolation helpers"
```

---

### Task 2: Cap `track_total_hits`, sampling request, `/lines` wiring (json + geojson)

**Files:**
- Modify: `api/src/datasets/es/commons.ts:201-212` (`prepareQuery` count branch)
- Create: `api/src/datasets/es/approx-count.ts`
- Modify: `api/src/datasets/routes/read.ts` (`readLines`, around :199-318 and the `streamJson`/geojson calls at :432-441)
- Modify: `api/src/datasets/routes/lines-pipeline.ts:146-163` (`streamJson`) and :223-231 (geojson)
- Modify: `api/src/datasets/routes/lines-body.ts:116-121` (`geojsonBodyPrefix` gains the relation)
- Test: `tests/features/datasets/approx-count.api.spec.ts` (new)

**Interfaces:**
- Consumes: `getApproxCountMode`, `extrapolateApproxTotal`, `ApproxCountMode` from Task 1; `prepareQuery` (`commons.ts:188`); the `timedEsCall` / `EsAbortContext` wrapper from `api/src/datasets/es/abort.ts`; alias naming as used by `api/src/datasets/es/count.ts`.
- Produces: `approxTotal(client, dataset, query, mode, abortContext?): Promise<number>` (new module); `StreamJsonContext.approxTotal?: () => Promise<number>`; response field `totalRelation: 'estimate'` (JSON envelope, key order `{ hint, total, totalRelation?, next?, totalCollapse?, results }`; geojson foreign member next to `total`).

- [ ] **Step 1: Write the failing API test**

`tests/features/datasets/approx-count.api.spec.ts` — mirror the setup conventions of `tests/features/datasets/stream-read-lines.api.spec.ts` (same imports, `clean()`, limits bump, REST dataset + `_bulk_lines`, `waitForFinalize`), plus `setConfig` from `tests/support/workers.ts:306`:

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { axiosAuth, clean } from '../../support/axios.ts'
import { waitForFinalize, setConfig } from '../../support/workers.ts'

const testUser1 = await axiosAuth('test_user1@test.com')

const N = 2500
const id = 'approxcount'
// `str` holds the searched token "label" on ~6/7 of rows (deterministic: 2143 rows where i % 7 !== 0)
const rows = Array.from({ length: N }, (_, i) => ({
  _id: String(i).padStart(5, '0'),
  str: i % 7 === 0 ? `other ${i}` : `label ${i}`,
  n: i
}))
const EXACT = rows.filter(r => r.str.startsWith('label')).length

const testCfg = { minDatasetSize: 1000, cap: 100, sampleTarget: 1000, minProbability: 0.01 }
// probability = clamp(1000/2500, 0.01, 0.5) = 0.4 → sampled ≈ 0.4·EXACT ≈ 857, stderr ≈ 2.7%

test.describe('approximate count for ranked text search', () => {
  test.beforeAll(async () => {
    await clean()
    await testUser1.put('/api/v1/datasets/' + id, {
      isRest: true, title: id, schema: [{ key: 'str', type: 'string' }, { key: 'n', type: 'integer' }]
    })
    for (let i = 0; i < rows.length; i += 1000) {
      await testUser1.post(`/api/v1/datasets/${id}/_bulk_lines`, rows.slice(i, i + 1000))
    }
    await waitForFinalize(testUser1, id, 30000)
    await setConfig('elasticsearch.approxCount', testCfg)
  })
  test.afterAll(async () => {
    await setConfig('elasticsearch.approxCount', { minDatasetSize: 100000, cap: 10000, sampleTarget: 100000, minProbability: 0.01 })
  })

  test('ranked q search over the cap returns an estimated total, flagged', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', size: 3 } })).data
    assert.equal(res.totalRelation, 'estimate')
    assert.ok(res.total > testCfg.cap, `estimate ${res.total} must exceed the cap`)
    // 0.4-probability sample of 2143 matches: ±20% is > 7 sigma, no flakiness at this width
    assert.ok(res.total > EXACT * 0.8 && res.total < EXACT * 1.2, `estimate ${res.total} implausibly far from ${EXACT}`)
    assert.equal(res.results.length, 3)
  })

  test('count=exact keeps todays exact behaviour', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', count: 'exact' } })).data
    assert.equal(res.total, EXACT)
    assert.equal(res.totalRelation, undefined)
  })

  test('top hits are identical with and without the cap', async () => {
    const approx = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', size: 20, select: '_id' } })).data
    const exact = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', size: 20, select: '_id', count: 'exact' } })).data
    assert.deepEqual(approx.results.map((r: any) => r._id), exact.results.map((r: any) => r._id))
  })

  test('non-ranked shapes stay exact', async () => {
    for (const params of [
      { q: 'label', sort: 'n' }, // explicit sort → not ranked-primary
      { }, // no q
      { q: 'label', count: 'false' }
    ] as Record<string, any>[]) {
      const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params })).data
      assert.equal(res.totalRelation, undefined, JSON.stringify(params))
      if (params.count !== 'false') assert.equal(typeof res.total, 'number')
      if (!params.sort && params.q && params.count !== 'false') assert.equal(res.total, EXACT)
    }
  })

  test('results below the cap keep an exact total with no flag', async () => {
    // "other" matches 357 rows > cap=100 … so use a term under the cap: "other 7" phrase-free simple q
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'other', count: 'exact' } })).data
    const exactOther = res.total
    await setConfig('elasticsearch.approxCount', { ...testCfg, cap: 1000 }) // raise cap above the match count
    const capped = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'other' } })).data
    assert.equal(capped.total, exactOther)
    assert.equal(capped.totalRelation, undefined)
    await setConfig('elasticsearch.approxCount', testCfg)
  })

  test('geojson envelope carries the estimated total too', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', format: 'geojson', size: 2 } })).data
    assert.ok(res.total > testCfg.cap)
    assert.equal(res.totalRelation, 'estimate')
  })
})
```

Note (from project memory): avoid `q` values that could start with `-` — a leading dash is parsed as an exclusion by `simple_query_string`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx playwright test tests/features/datasets/approx-count.api.spec.ts --project api`
(deps must be up: `npm run test-deps`, dev API running per `docs/architecture/testing.md`)
Expected: FAIL — `totalRelation` undefined and `total` equals the capped 100, since nothing is wired yet. (If `set-config` rejects the unknown `elasticsearch.approxCount` path, Task 1 wasn't merged/deployed to the test server — rebuild first.)

- [ ] **Step 3: Cap `track_total_hits` in `prepareQuery`**

`api/src/datasets/es/commons.ts` — replace the final `else` of the count branch (:210-212):

```ts
  } else {
    const approxCountMode = getApproxCountMode(dataset, query, config.elasticsearch.approxCount)
    esQuery.track_total_hits = approxCountMode ? approxCountMode.cap : true
  }
```

(`count === 'exact'` needs no explicit branch: the helper returns `null` for it, which lands on `true`.) Import `getApproxCountMode` from `./operations.ts` alongside the existing imports.

- [ ] **Step 4: Implement the sampling request**

Create `api/src/datasets/es/approx-count.ts`:

```ts
import { type ApproxCountMode, extrapolateApproxTotal } from './operations.ts'
import { prepareQuery } from './commons.ts' // match the actual export style used by count.ts

// Estimate the total that the capped ranked request declined to compute exactly: count the
// matches inside the stable `_rand < randBound` slice (uniform random int assigned at index
// time) and extrapolate by 1/probability. Filter context + size 0: no scoring, leapfrogs via
// the _rand BKD index, and eligible for the ES shard request cache on repeated queries.
// ES 7.x-compatible on purpose — do NOT switch to random_sampler (ES ≥ 8.2 only).
export const approxTotal = async (client: any, dataset: any, query: Record<string, any>, mode: ApproxCountMode, abortContext?: any): Promise<number> => {
  const esQuery = prepareQuery(dataset, query)
  const body = {
    size: 0,
    track_total_hits: true,
    query: { bool: { filter: [esQuery.query, { range: { _rand: { lt: mode.randBound } } }] } }
  }
  // Execute with the same alias resolution, `timeout: searchTimeout`,
  // `allow_partial_search_results: false` and timedEsCall/abort wrapping as
  // api/src/datasets/es/search.ts:24-37 — copy that call shape verbatim.
  const res = await /* timedEsCall-wrapped client search on aliasName(dataset) with body */
  return extrapolateApproxTotal(res.hits.total.value, mode)
}
```

The `/* … */` marker above is intentionally the one open point: reproduce the exact transport call of `search.ts:24-37` (same querystring params, same abort/timing wrapper) — it is 10 lines and must not drift from the main search path's timeout policy.

- [ ] **Step 5: Wire the route and the two envelopes**

`api/src/datasets/routes/read.ts` (`readLines`): where the json format is handled (`searchStream` at :212, `streamJson` call at :432-441), compute the mode once and pass a lazy counter into the pipeline context:

```ts
const approxCountMode = getApproxCountMode(dataset, req.query, config.elasticsearch.approxCount)
// … existing source construction …
await streamJson(req, res, source, {
  /* existing ctx fields unchanged */,
  approxTotal: approxCountMode ? () => approxTotal(client, dataset, req.query, approxCountMode, abortContext) : undefined
})
```

Same for the geojson branch. `api/src/datasets/routes/lines-pipeline.ts` — extend `StreamJsonContext` with `approxTotal?: () => Promise<number>` and replace lines :156-157:

```ts
  const totalObj = tail?.hits?.total
  let total = totalObj?.value
  let totalEstimated = false
  if (totalObj?.relation === 'gte' && ctx.approxTotal) {
    total = await ctx.approxTotal()
    totalEstimated = true
  }
  if (total != null) head.total = total
  if (totalEstimated) head.totalRelation = 'estimate'
```

geojson (:229-230): apply the same substitution before building the prefix and pass the flag: `geojsonBodyPrefix(total, totalEstimated)`; in `api/src/datasets/routes/lines-body.ts:116-121` emit `"totalRelation":"estimate",` right after the `total` member when the flag is set.

Note the cap value guarantees `relation === 'gte'` fires only when matches exceed the cap; below it ES returns `eq` and no second request happens — that's the "results below the cap stay exact" test.

- [ ] **Step 6: Run the API test to verify it passes**

Run: `npx playwright test tests/features/datasets/approx-count.api.spec.ts --project api`
Expected: PASS (all 6). Also run the neighboring regression suite:
`npx playwright test tests/features/datasets/stream-read-lines.api.spec.ts --project api` — must stay green (its fixtures are far below `minDatasetSize` defaults… but the test config was reverted in `afterAll`, so defaults apply).

- [ ] **Step 7: Lint, types, commit**

```bash
npm run lint && npm run check-types
git add api/src/datasets/es/ api/src/datasets/routes/ tests/features/datasets/approx-count.api.spec.ts
git commit -m "feat(datasets): approximate totals for capped ranked text searches (_rand sampling)"
```

---

### Task 3: Advice/hint coherence + `count` param documentation

**Files:**
- Modify: `api/src/misc/utils/query-advice.ts:32-35` (rule 1) and the rule list
- Modify: `api/i18n/messages/fr.json:17` area and `api/i18n/messages/en.json:17` area
- Modify: `api/contract/dataset-api-docs.ts` (new `countParam` next to `hintParam` :464-478; reference it in the `/lines` operation parameter list at :659)
- Test: extend `tests/features/datasets/approx-count.api.spec.ts`

**Interfaces:**
- Consumes: `getApproxCountMode` (Task 1), `reqDataset` accessor (as used across `api/src/datasets/routes/`), `config.elasticsearch.approxCount`.
- Produces: i18n keys `errors.queryAdviceApproxCount` (fr/en); documented `count` parameter enum `['true', 'false', 'estimate', 'exact']`.

- [ ] **Step 1: Write the failing test** (append to the api spec)

```ts
  test('hint explains the estimate and stops advising count=false', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'label', hint: 'true' } })).data
    assert.ok(res.hint, 'hint requested explicitly must be present')
    assert.ok(/approximatif|approximate/i.test(res.hint), res.hint)
    assert.ok(!/count=false/.test(res.hint), 'stale exact-count advice must not fire in approx mode')
  })
```

Run: `npx playwright test tests/features/datasets/approx-count.api.spec.ts --project api` → the new test FAILS (rule 1 still advises `count=false`, no approx message).

- [ ] **Step 2: Update `queryAdvice`**

In `api/src/misc/utils/query-advice.ts`, rule 1 (:32-35) currently fires on `/lines|/records` when `count !== 'false' && count !== 'estimate' && !after`. Compute `const approxMode = dataset && getApproxCountMode(dataset, req.query, config.elasticsearch.approxCount)` (dataset via the same accessor the file already uses for other rules; guard for routes without a dataset). Then:
- rule 1: add `&& !approxMode` to its condition (the exact-count cost it warns about no longer exists);
- new rule right after it: when `approxMode`, push key `errors.queryAdviceApproxCount`.

i18n messages (`api/i18n/messages/fr.json` / `en.json`, next to `queryAdviceCount`):

```json
"queryAdviceApproxCount": "les totaux au-delà de {cap} résultats sont estimés par échantillonnage sur cette recherche triée par pertinence (le tri des résultats reste exact) ; utilisez count=exact pour un décompte exact",
```
```json
"queryAdviceApproxCount": "totals beyond {cap} results are estimated by sampling on this relevance-ranked search (the ranking itself stays exact); use count=exact for an exact count",
```

Interpolate `{cap}` the same way sibling messages interpolate their params.

- [ ] **Step 3: Document the `count` parameter**

In `api/contract/dataset-api-docs.ts`, add next to `hintParam` (:464-478):

```ts
const countParam = {
  in: 'query',
  name: 'count',
  description: 'Contrôle le calcul du nombre total de résultats. "true" (défaut) : total calculé, éventuellement estimé par échantillonnage sur une recherche textuelle triée par pertinence dans un grand jeu de données (signalé par totalRelation="estimate"). "exact" : total exact garanti. "estimate" : borne rapide. "false" : pas de total.',
  schema: { type: 'string', enum: ['true', 'false', 'estimate', 'exact'], default: 'true' }
}
```

Reference it in the `/lines` operation parameters (:659) beside `hintParam`. Also document the `totalRelation` response property wherever the `/lines` response schema declares `total` in the same file.

- [ ] **Step 4: Run tests, commit**

Run: `npx playwright test tests/features/datasets/approx-count-operations.unit.spec.ts tests/features/datasets/approx-count.api.spec.ts --project unit --project api`
Expected: PASS.

```bash
npm run lint && npm run check-types
git add api/src/misc/utils/query-advice.ts api/i18n/messages/ api/contract/dataset-api-docs.ts tests/features/datasets/approx-count.api.spec.ts
git commit -m "feat(datasets): hint message + count param docs for approximate totals"
```

---

### Task 4: UI — `~` count with tooltip in the table preview

**Files:**
- Modify: `ui/src/composables/dataset/lines.ts` (:59 refs, :63 `Lines` type, :118 capture, exported return)
- Modify: `ui/src/components/dataset/dataset-nb-results.vue`
- Modify: `ui/src/components/dataset/table/dataset-table.vue:8-13` and :94-99 (pass the new prop)

**Interfaces:**
- Consumes: `totalRelation: 'estimate'` from the `/lines` JSON envelope (Task 2).
- Produces: composable exposes `totalRelation: Ref<string | undefined>`; `dataset-nb-results.vue` gains prop `estimate?: boolean` (default `false`).

- [ ] **Step 1: Capture the field in the composable**

`ui/src/composables/dataset/lines.ts`: next to `const total = ref<number>()` (:59) add `const totalRelation = ref<string>()`; extend the `Lines` type (:63) with `totalRelation?: string`; where `total` is assigned (:118) add `totalRelation.value = data.totalRelation` (assign unconditionally so a navigation back to an exact query clears the flag); include `totalRelation` in the composable's returned object.

- [ ] **Step 2: Display it**

`ui/src/components/dataset/dataset-nb-results.vue` — add the prop and swap the bare div for a tooltip'd one (follow the `v-tooltip` usage pattern of `ui/src/components/dataset/table/dataset-table-value.vue:39-56`):

```vue
<template>
  <div
    v-if="total !== null"
    class="text-body-small"
  >
    <template v-if="estimate">
      <span>{{ t('estimated', {total: n(total)}) }}</span>
      <v-icon
        size="x-small"
        :icon="mdiInformationOutline"
      />
      <v-tooltip
        activator="parent"
        location="bottom"
        :text="t('estimateTooltip')"
      />
    </template>
    <template v-else-if="total > limit && unit === 'lines'">
      {{ t('firstLines', {total: n(total)}) }}
    </template>
    <template v-else>
      {{ t(unit, {total: n(total)}, total) }}
    </template>
  </div>
</template>
```

Keep the existing script/props and add `estimate: { type: Boolean, default: false }` plus the icon import, matching the component's current style. Preserve the existing `firstLines` behavior for the non-estimate branch exactly as it is today (:11).

i18n block additions (fr/en, in the SFC `<i18n lang="yaml">` at :16-26):

```yaml
fr:
  estimated: "~ {total} lignes"
  estimateTooltip: "Nombre approximatif obtenu par échantillonnage — le tri des résultats reste exact. L'API permet un décompte exact avec count=exact."
en:
  estimated: "~ {total} lines"
  estimateTooltip: "Approximate count obtained by sampling — the ranking of results stays exact. The API returns an exact count with count=exact."
```

`ui/src/components/dataset/table/dataset-table.vue`: at both usage sites (:8-13 and :94-99) bind `:estimate="totalRelation === 'estimate'"`, pulling `totalRelation` from the same `lines.ts` composable destructuring that already provides `total` (:589).

- [ ] **Step 3: Verify in the dev app**

With the dev stack running (user-managed; `bash dev/status.sh` to check): `npm run dev-fixtures` seeds showcase datasets, but none reaches `minDatasetSize` — instead temporarily set `elasticsearch.approxCount.minDatasetSize` to `100` in `api/config/development.cjs`, restart is user-managed, then open a dataset table, type a query matching more rows than the cap, and confirm the `~` count + tooltip. Revert the development config before committing. If the dev stack isn't available, state that this manual check was skipped — do not claim it done.

- [ ] **Step 4: Lint, types, commit**

```bash
npm run lint && npm run check-types
git add ui/src/composables/dataset/lines.ts ui/src/components/dataset/dataset-nb-results.vue ui/src/components/dataset/table/dataset-table.vue
git commit -m "feat(ui): show approximate totals with a tooltip in the table preview"
```

---

### Task 5: Documentation + rollout notes

**Files:**
- Modify: `docs/architecture/load-management.md` (§6 count bullet + §9 track_total_hits bullet)
- Modify: `benchmark/INVESTIGATIONS.md` §11 (mark the spec follow-up as implemented, pointer to this plan)

**Interfaces:** none — prose only.

- [ ] **Step 1: Update the architecture docs**

In `load-management.md` §9, rewrite the "Exact `track_total_hits` on page 1" bullet's *Proposed bound* into implemented state: describe the trigger predicate (ranked `q`, `dataset.count ≥ elasticsearch.approxCount.minDatasetSize`, none of `sort/after/collapse/count`), the cap, the `_rand` sampling second request (filter context, request-cacheable, ES 7.x-compatible), the `totalRelation: 'estimate'` signal, and the `count=exact` escape. Update §6's `track_total_hits` description (the `true` on page 1 sentence) to mention the capped ranked-search mode. Keep the measured numbers already present.

- [ ] **Step 2: Record the deployment checklist** (in the §9 bullet, as a short "rollout" note)

1. Prod ES is 7.17.28 — fully compatible (`random_sampler` is deliberately not used) and **validated on a real corpus**: the RNA run (`benchmark/INVESTIGATIONS.md` §12 — 3.3M rows of natural French text, prod-faithful `_search` mapping) measured the cap at −52 to −93 % on 7.17 and −87 to −97 % on 8.19, with the top-20 identical in every case on both versions. (§11's earlier 7.17 regression came from the synthetic uniform-vocabulary corpus — WAND's worst case; treat it as a stress test, not the rollout verdict.) The config gate (`approxCount.minDatasetSize: null`) remains the safety valve, not a version gate.
2. Before enabling, verify `_rand` is populated on the oldest prod indices: `GET dataset-*/_count` with `{"query":{"bool":{"must_not":{"exists":{"field":"_rand"}}}}}` must return 0 for every dataset over `minDatasetSize`; a dataset failing this simply needs re-finalization, or raise its exclusion.
3. Config defaults ship enabled (`minDatasetSize: 100000`); the deployment repo can set `minDatasetSize: null` to hold the feature off, or tune per environment.
4. Known consumers that require exact totals on ranked searches: communicate `count=exact` before the release.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/load-management.md benchmark/INVESTIGATIONS.md
git commit -m "docs: approximate ranked-search totals — implemented state and rollout notes"
```

---

### Task 6: `q_mode` extension — parsing + the pure adaptive decision rule

**Files:**
- Modify: `api/config/default.cjs` (elasticsearch block: add `qModeDefault: 'simple'` and, inside `approxCount`, `adaptConfidentSample: 5`)
- Modify: `api/config/type/schema.json` (mirror both keys)
- Modify: `api/src/datasets/es/operations.ts` (append)
- Test: `tests/features/datasets/q-mode-operations.unit.spec.ts` (new)

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseQMode(raw: string | undefined, dflt: string): 'simple' | 'complete' | 'and' | 'adapt'` (throws a message string on invalid input — the caller wraps it in a 400); `decideAdaptiveRung(spectrum: Array<{ msm: number, sampled: number }>, floorSample: number): { msm: number, sampled: number }`.

- [ ] **Step 1: Write the failing unit test**

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { parseQMode, decideAdaptiveRung } from '../../../api/src/datasets/es/operations.ts'

test('parseQMode accepts the legacy and new modes', () => {
  assert.equal(parseQMode(undefined, 'simple'), 'simple')
  assert.equal(parseQMode(undefined, 'adapt'), 'adapt')
  assert.equal(parseQMode('or', 'simple'), 'simple') // alias
  assert.equal(parseQMode('simple', 'adapt'), 'simple')
  assert.equal(parseQMode('complete', 'simple'), 'complete')
  assert.equal(parseQMode('and', 'simple'), 'and')
  assert.equal(parseQMode('adapt', 'simple'), 'adapt')
  assert.throws(() => parseQMode('3', 'simple')) // numeric msm deliberately not supported
  assert.throws(() => parseQMode('bogus', 'simple'))
})

test('decideAdaptiveRung picks the strictest level whose estimate clears the cap floor', () => {
  // spectrum ordered strictest-first, e.g. 5 terms: [{msm:5,...}, ..., {msm:1,...}]
  const spectrum = [
    { msm: 5, sampled: 1 },
    { msm: 4, sampled: 59 },
    { msm: 3, sampled: 589 },
    { msm: 2, sampled: 4289 },
    { msm: 1, sampled: 22356 }
  ]
  // floorSample = cap × probability × safety = 10000 × 0.01 × 1.2 = 120
  const d = decideAdaptiveRung(spectrum, 120)
  assert.equal(d.msm, 3) // 589 ≥ 120; msm=4 (est ~5 900 < cap) would tighten below the horizon — never chosen
  assert.equal(d.sampled, 589)
})

test('decideAdaptiveRung leaves the query unrestricted when no strict level clears the floor', () => {
  // the "rue baudelaire" shape: strict set far below the cap → keep full OR semantics
  const d = decideAdaptiveRung([{ msm: 2, sampled: 3 }, { msm: 1, sampled: 14119 }], 120)
  assert.equal(d.msm, 1)
})
```

- [ ] **Step 2: Run to verify it fails** — `npx playwright test tests/features/datasets/q-mode-operations.unit.spec.ts --project unit` → FAIL (not exported).

- [ ] **Step 3: Implement** (append to `api/src/datasets/es/operations.ts`)

```ts
// ---- q_mode extension: or|and|adapt on top of legacy simple|complete ----

export type QMode = 'simple' | 'complete' | 'and' | 'adapt'

export const parseQMode = (raw: string | undefined, dflt: string): QMode => {
  const value = raw ?? dflt
  if (value === 'or' || value === 'simple') return 'simple'
  if (value === 'complete' || value === 'and' || value === 'adapt') return value
  throw new Error(`q_mode invalide "${value}" — valeurs acceptées : simple (ou or), complete, and, adapt`)
}

/**
 * Adaptive strictness decision from the `_rand`-sampled spectrum (strictest level first).
 * THE INVARIANT: adapt never tightens a search below the exactness horizon (the
 * track_total_hits cap). Any search totalling < cap keeps full OR semantics and an exact
 * total; above the cap, the strictest level whose sampled support clears
 * floorSample = cap × probability × safety is chosen — or none (msm=1, plain OR + capped
 * estimate) when no strict level qualifies. A qualifying level always has ≥ ~cap×p
 * samples (~100+), so every decision is statistically confident: no probe step needed.
 */
// Rung-generic on purpose: v1's ladder is msm levels ({ msm, sampled }), but the same
// decision serves any strictness ladder — the planned rare-must v2 walks rungs of
// "require the j rarest terms" with the identical floor rule (see follow-up notes).
export const decideAdaptiveRung = <T extends { sampled: number }> (
  spectrum: T[],
  floorSample: number
): T => {
  return spectrum.find(l => l.sampled >= floorSample) ?? spectrum[spectrum.length - 1]
}
```

(The Task 6/7 tests call it with `{ msm, sampled }` items — adjust the test imports to `decideAdaptiveRung`; assertions are unchanged since the chosen item is returned whole.)

Config: in `default.cjs` add `qModeDefault: 'simple',` next to `approxCount` and `adaptFloorSafety: 1.2` inside `approxCount` (the floor derives from existing constants: `floorSample = ceil(cap × probability × adaptFloorSafety)`); mirror both in `schema.json`; `npm run build-types`.

- [ ] **Step 4: Run to verify it passes**, then `npm run lint && npm run check-types`.

- [ ] **Step 5: Commit** — `feat(datasets): q_mode or|and|adapt parsing and adaptive decision rule`

---

### Task 7: `adapt` preflight (common-word exclusion), `and` wiring, `q_required` pinning

**Files:**
- Create: `api/src/datasets/es/adaptive-q.ts`
- Modify: `api/src/datasets/es/operations.ts` (`buildQClauses` — `and` mode and the required-words filter shape)
- Modify: `api/src/datasets/es/commons.ts` (`prepareQuery`: resolve mode via `parseQMode`, pass mode/`q_required` into `buildQClauses`)
- Modify: `api/src/datasets/routes/read.ts` (run the preflight for adapt mode, pin `q_required` in the `next` link)
- Modify: `api/src/datasets/routes/lines-pipeline.ts` (envelope: `qAdapt` field; adapt totals bypass the Task 2 count leg — the preflight already provides them)
- Test: `tests/features/datasets/q-mode-adapt.api.spec.ts` (new)

**Interfaces:**
- Consumes: `parseQMode`, `decideAdaptiveRung` (Task 6); `getApproxCountMode` (Task 1 — gates adapt the same way: large dataset, multi-term `q`, page 1, not `complete`); `_msearch` with `_rand`-sliced `size: 0` count bodies (same slice parameters as Task 2).
- Produces: `runAdaptivePreflight(client, dataset, query, approxMode, abortContext?): Promise<{ required: string[], ignored: string[], total: number, totalRelation: 'estimate' } | null>` (`null` = the search totals under the cap → run exactly as today); a `q_required=<comma-separated words>` request parameter (each word must be a token of `q` — 400 otherwise) that applies the filter directly with no preflight — used by `next`-link pinning AND available to users as manual control; response envelope field `qAdapt: { required: string[], ignored: string[] }` placed after `totalRelation` (present only when adapt actually ignored at least one word).

- [ ] **Step 1: Write the failing API test** (`q-mode-adapt.api.spec.ts`, same fixture pattern as `approx-count.api.spec.ts` — REST dataset, 2500 rows, `setConfig`):

```ts
// fixture (with the Task 2 test config: cap=100, dataset ~2300 rows → probability 0.4,
// so floorSample = ceil(100 × 0.4 × 1.2) = 48):
//  - 60 rows  'commun rare …'       (AND set = 60 < cap → 'commun' must be dropped from filtering)
//  - 60 rows  'rare autre …'        (count('rare') = 120 ≥ cap → the rung "require rare" qualifies)
//  - 2000 rows 'commun seulement …' (OR union 2120 ≥ cap → adapt engages)
//  - 150 rows 'grand ensemble …'    (AND set = 150 ≥ cap → nothing needs dropping)
//  - 40 rows  'petit exemple …'     (OR union 40 < cap → the invariant: untouched)
test('adapt drops the most common word from filtering until the set clears the cap', async () => {
  const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_mode: 'adapt', size: 20 } })).data
  assert.deepEqual(res.qAdapt, { required: ['rare'], ignored: ['commun'] })
  assert.equal(res.totalRelation, 'estimate')
  assert.ok(res.total >= 60 && res.total < 250, `estimate ${res.total} implausible for true 120`)
  // ignored words still score: 'commun rare' rows outrank 'rare autre' rows
  assert.ok(res.results[0].str.startsWith('commun rare'), res.results[0].str)
})
test('adapt keeps every word required when the strict set already clears the cap', async () => {
  const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'grand ensemble', q_mode: 'adapt' } })).data
  assert.deepEqual(res.qAdapt, undefined) // nothing was ignored → no flag, just the estimate
  assert.equal(res.totalRelation, 'estimate')
  assert.ok(res.total >= 100 && res.total < 250)
})
test('the invariant: searches under the cap are untouched by adapt', async () => {
  const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'petit exemple', q_mode: 'adapt' } })).data
  assert.equal(res.total, 40) // exact, full OR semantics
  assert.equal(res.totalRelation, undefined)
  assert.equal(res.qAdapt, undefined)
})
test('q_required applies the filter directly, no preflight', async () => {
  const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_required: 'rare', count: 'exact' } })).data
  assert.equal(res.total, 120)
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
test('q_mode=or and default keep todays behaviour', async () => {
  for (const params of [{ q: 'commun rare', count: 'exact' }, { q: 'commun rare', q_mode: 'or', count: 'exact' }]) {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params })).data
    assert.equal(res.total, 2120) // union
    assert.equal(res.qAdapt, undefined)
  }
})
test('a next-paginated chain enumerates exactly the tightened set', async () => {
  // the download pattern: follow next links to exhaustion — must terminate, stay on the
  // pinned filter for every page, and yield exactly the tightened set (120 rows)
  let url = `/api/v1/datasets/${id}/lines?q=${encodeURIComponent('commun rare')}&q_mode=adapt&size=50`
  const collected: string[] = []
  for (let page = 0; url; page++) {
    assert.ok(page < 10, 'chain must terminate')
    const res = (await testUser1.get(url)).data
    collected.push(...res.results.map((r: any) => r._id))
    if (res.next) assert.ok(res.next.includes('q_required=rare'), res.next)
    url = res.next
  }
  assert.equal(collected.length, 120)
  assert.equal(new Set(collected).size, 120) // no duplicates across pages
})
```

Run → FAIL (unknown `q_mode` value rejected or ignored).

- [ ] **Step 2: mode plumbing** — `buildQClauses` (`operations.ts:484-530`): in the *simple*-mode branch, `'and'` and a present `q_required` both produce the score-broad-match-strict shape below (for `'and'`, every word is required). `complete` branch untouched. `prepareQuery` resolves `parseQMode(query.q_mode, config.elasticsearch.qModeDefault)` (wrap the thrown message in `httpError(400, …)`) and threads it through.

- [ ] **Step 3: The preflight module** (`api/src/datasets/es/adaptive-q.ts`):

```ts
// adapt: exclude from FILTERING the most common query words until the filtered set
// clears the cap; every word keeps scoring. The algorithm and its costs
// (INVESTIGATIONS §12-C, real-corpus measurements):
//
// 1. Preflight — ONE size:0 request over the `_rand` slice (0–1 ms warm, both ES
//    versions, request-cacheable, deterministic per dataset):
//      query: bool.filter [ <plain OR q clauses>, { range: { _rand: { lt: randBound } } } ]
//      aggs:  { perTerm: { filters: { filters: { <word>: multi_match per whitespace
//              token of q (capped at 8), over the q search fields } } } }
//    → per-word sampled counts + the sampled OR total from hits.total.
// 2. If the OR estimate < cap → return null: the request runs exactly as today
//    (plain OR, exact total) — searches under the cap are byte-identical to current
//    behaviour. THE INVARIANT.
// 3. Rung walk — order words by sampled count ascending; rung j = "require the j
//    rarest words" (equivalently: ignore the (n−j) most common). Walk j = n → 1,
//    stop at the first rung whose sampled count ≥ floorSample =
//    ceil(cap × probability × adaptFloorSafety):
//      - rung j=1 counts are already exact in the agg (single word);
//      - rungs j ≥ 2 are conjunctions: collect the ones whose upper bound
//        (min of member counts) ≥ floorSample into ONE _msearch of `_rand`-sliced
//        counts (0–2 legs in practice; a rung whose upper bound is below the floor
//        cannot qualify — skip counting it).
//    decideAdaptiveRung({ rung: { required, ignored }, sampled }[], floorSample) picks it.
// 4. Outcomes: rung j=n qualifies → nothing ignored (filter = all words); some rung
//    qualifies → { required, ignored }; no rung qualifies → unrestricted (plain capped
//    OR + estimate; qAdapt absent).
// return { required, ignored, total, totalRelation: 'estimate' } | null
export const runAdaptivePreflight = async (client, dataset, query, approxMode, abortContext) => { /* per the spec above */ }
```

The commented block is the specification; implement it literally (the transport-call
shape copies `search.ts:24-37`, as in Task 2). Note the graceful degenerate cases it
buys with no special-casing: a stopword dropped by the french analyzer still counts via
`.text_standard` (huge count → ignored early); a typo'd token samples ~0 → its rungs
prune → the walk falls through to broader rungs.

**Final-query shape when adapt (or `q_required`) ignored at least one word** — score
broad, match strict:

```ts
{ bool: { must: [<plain OR q clauses>], filter: [<one multi_match per required word>] } }
```

The non-scoring conjunction of required words leads the iteration while scores stay pure
OR BM25 — the page is exactly OR's page restricted to the tightened set (ignored words
still contribute to ranking: a doc matching «rue» AND «baudelaire» outranks a
baudelaire-only doc), measured at parity-or-better with plain capped OR on ES 7.17.
`q_mode=and` reuses the same shape (all words in the filter). For the record: whatever
lands in the filter position must NEVER move to scoring position — a scored clause with
term requirements measured 2.5× slower on ES 7 (see INVESTIGATIONS §12-C).

- [ ] **Step 4: Route + envelope wiring** — in `read.ts`, when the resolved mode is `'adapt'` and `getApproxCountMode` gates pass (large dataset, multi-term ranked `q`, page 1): await `runAdaptivePreflight` BEFORE opening the main search; on a non-null result run the main query with the required-words filter shape, skip the Task 2 count leg (pass the preflight total into the pipeline ctx instead), and append `q_required=<required.join(',')>` to the `next` href (`setNextLink` ctx). In `streamJson`: emit `head.qAdapt = { required, ignored }` after `totalRelation`, only when `ignored.length > 0`. When the gates fail (small dataset, single term, `after=`, `q_required` already present), adapt silently degrades — same results as today.

**Pagination-chain guarantee (the "next-paginated downloads" requirement).** Every page of one
`next`-link chain MUST evaluate the same effective query. The preflight is deterministic
(frozen `_rand` slice, all `size: 0` legs request-cached), so re-deriving on `after=` pages
would *usually* agree — but a dataset update mid-chain re-draws `_rand` and can flip the
exclusion near the floor boundary. The `q_required` pin removes that hazard entirely AND
skips the preflight on pages 2+, so pinning is the implementation: cheap insurance plus an
optimization, exactly one URL param. Corollary that must NOT be implemented instead: letting
`after=` pages fall back to plain OR (the adapt gate excludes `after=` only because the pin
is expected — an unpinned `after=` chain would silently switch match sets between pages).

- [ ] **Step 5: Run the API tests** (`q-mode-adapt` + the Task 2/3 suites — they must stay green: default mode is still `simple`). Then `npm run lint && npm run check-types`.

- [ ] **Step 6: Commit** — `feat(datasets): q_mode=adapt — ignore over-common words in filtering, keep them scoring`

---

### Task 8: adapt transparency — API docs, hint, UI ignored-words message

**Files:**
- Modify: `api/contract/dataset-api-docs.ts` (extend the `q_mode` parameter enum + document `qAdapt` in the response schema)
- Modify: `api/i18n/messages/fr.json` / `en.json` (hint `queryAdviceAdapt`)
- Modify: `api/src/misc/utils/query-advice.ts` (emit it when adapt actually restricted the query)
- Modify: `ui/src/components/dataset/dataset-nb-results.vue` + `ui/src/components/dataset/table/dataset-table.vue` + `ui/src/composables/dataset/lines.ts` (capture `qAdapt`, render the spectrum in the count tooltip)
- Test: extend `tests/features/datasets/q-mode-adapt.api.spec.ts` (hint assertion, same shape as Task 3 Step 1)

**Interfaces:**
- Consumes: `qAdapt: { required, ignored }` (Task 7), the tooltip structure from Task 4.
- Produces: fr/en i18n keys `queryAdviceAdapt`; a tooltip line naming the ignored words.

- [ ] **Step 1**: document `q_mode` (enum `['simple', 'or', 'complete', 'and', 'adapt']`, default from config), `q_required`, and the `qAdapt` response field next to the Task 3 `countParam` work; hint message fr: `"les mots très fréquents ({ignored}) ont été ignorés pour le filtrage — ils comptent toujours pour le classement ; utilisez q_mode=or pour la recherche large"` (en equivalent), emitted by a query-advice rule when the response carries `qAdapt` (pass the flag the same way Task 3 passes approx-mode).
- [ ] **Step 2**: UI — `lines.ts` captures `qAdapt` alongside `totalRelation`; `dataset-nb-results.vue` accepts an optional `ignoredWords: string[]` prop and adds one tooltip line — fr: `"Mots très fréquents ignorés pour le filtrage : {words} (ils comptent toujours pour le classement)"` (en equivalent, SFC i18n block); `dataset-table.vue` passes it through.
- [ ] **Step 3**: run the API suites + `npm run lint && npm run check-types`; manual dev check as in Task 4 Step 3 (same skip-honesty rule).
- [ ] **Step 4: Commit** — `feat: q_mode adapt transparency in api docs, hints and table preview`

---

## Rollout sequencing (supersedes any single-release reading of Task 5)

1. **Release N**: Tasks 1–5 (cap + sampler, default behaviour change limited to totals >10k on ranked `q`) + Tasks 6–8 with `qModeDefault: 'simple'` — adapt is opt-in, zero default change.
2. **Calibration window**: portals/UI teams exercise `q_mode=adapt` explicitly; replay a batch of real production `q` logs through `benchmark/src/rna-check.ts`-style measurement against the prod corpus. With the cap-floor rule, pages are always full and semantics never tighten below the cap by construction — the sweep validates the remaining judgment calls: top-20 overlap vs OR on tightened queries, spectrum estimate plausibility, and the share of traffic adapt actually tightens (expect: only high-volume multi-term queries).
3. **Release N+1**: flip `qModeDefault: 'adapt'` per environment, with release-notes comms aimed at recall/integration consumers (the one genuinely breaking class — they add `q_mode=or`).

**Paginated-download safety (applies from Release N).** Two distinct risks, both covered:

- *Chain consistency*: every page of a `next` chain evaluates the same effective query — the
  `q_required` pin in `next` links (Task 7) guarantees it even across a mid-chain dataset
  update; `after=` pages carry no totals at all (`track_total_hits: false`, unchanged), so
  the estimate machinery never runs inside a chain. Covered by the chain-enumeration API test.
- *Completeness checks*: a downloader that compares collected rows against page-1 `total`
  will see a ±1–2 % mismatch when the total was an estimate. The contract to document
  prominently (API docs `total` description + release notes): **iterate `next` until absent —
  `total` above the cap is an estimate, never a termination condition; use `count=exact` for
  reconciliation.** Before Release N, audit data-fair's own consumers (table infinite scroll,
  the embed download page which displays `dataset-nb-results`, SDK/docs examples) for any
  total-driven stopping logic — none is expected (the UI follows `next` links), but verify.

---

## Self-review notes

- Spec coverage: user requirement → task: *only ranked textual search on large datasets* → Task 1 predicate (+ tests); *capped to 10000* → Task 2 Step 3 (config default in Task 1); *sampler adjusted to dataset size* → Task 1 probability formula + Task 2 sampling leg; *API transparency* → Task 2 (`totalRelation`) + Task 3 (hint + docs); *table preview tooltip* → Task 4; *extensible, minimally breaking* → `count=exact` (Task 1 predicate + Task 3 docs), kill-switch config, no change to any other request shape.
- The one intentionally open implementation point is the transport-call shape in `approx-count.ts` (copy `search.ts:24-37` verbatim) — flagged inline.
- Out of scope, recorded for later: ODS compat API (`api/src/api-compat/ods/operations.ts:384` still `track_total_hits: true` — also keeps `q_mode=simple` semantics), `qs`-only searches (not `_score`-ranked today, `commons.ts:248`), aggregation endpoints, and a possible future `hint` on the exact-split request cache.
- `q_mode` extension coverage (second brief): *or/and/adapt/number modes* → Tasks 6–7; *adapt = exclude the most common words from filtering until the set clears the cap, words keep scoring* → Task 7 preflight (filters-agg over the `_rand` slice + rung walk); *transparency = name the ignored words* → `qAdapt: { required, ignored }` envelope field (Task 7) + tooltip line (Task 8), no number spectrum exposed; *every mode capped + sampler + disclaimers* → Tasks 2–4 machinery applies to all modes unchanged; *adapt as default* → deliberately staged via `qModeDefault` config (rollout sequencing section) rather than day-one, per the calibration argument in `text-search-evaluation.md` §7.
- Design lineage, for the record: `adapt` v1 IS the rare-must algorithm (retired `common_terms` semantics) in its exclusion framing — "ignore the most common words in filtering, keep them scoring, never drop below the cap". The earlier-measured *msm-level ladder* (spectrum `_msearch` across `minimum_should_match` values) remains documented in INVESTIGATIONS §12-C as the evaluated alternative: it lost on page overlap (13–17/20 vs 18–20/20), explicability (a level number vs a list of ignored words), preflight cost (2–8 ms vs 0–1 ms), and stopword handling. A numeric `q_mode=<n>` (raw msm) was considered and dropped — a free-integer-or-enum union renders poorly in OpenAPI doc viewers, and `and` + `q_required` cover the manual-control needs.
