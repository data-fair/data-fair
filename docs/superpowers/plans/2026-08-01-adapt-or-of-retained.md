# `q_mode=adapt` OR-of-retained Filtering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change `q_mode=adapt` filter semantics from AND-of-required (conjunction of the rarest words) to OR-of-retained (the plain OR search minus documents that match *only* ignored words), replacing the `q_required` pagination param with `q_ignored`, so the behaviour finally matches the user-facing message "some words were ignored".

**Architecture:** The preflight keeps its shape (one filters-agg probe on the `_rand` sample slice, one optional `_msearch`, strictest-first cap-floor selection) but candidates become "ignore the k most frequent words" with the retained words' **union** as the measured set; max/sum solo-count bounds eliminate most union counts. The main query keeps score-broad-match-strict: scores stay pure OR, the non-scoring filter becomes a single `bool`/`should` over the retained words. Evidence: `benchmark/INVESTIGATIONS.md` §14 (2026-08-01, RNA corpus, ES 7.17.28 + 8.19.9) — top-20 identical to plain OR everywhere, cheaper than the shipped design wherever both act, adapts in a case the conjunction lattice cannot, and the fixed-noise-threshold alternatives are refuted.

**Tech Stack:** Node/TS API (`api/` workspace), Elasticsearch 7.17+ (plain `bool`/`multi_match` only), Playwright test projects (`unit` / `api`).

## Global Constraints

- **Production ES is 7.17.28** — the new filter uses only `bool`/`should`/`multi_match`, ES 7.0-compatible.
- **THE INVARIANT is unchanged**: searches totalling under the cap run exactly as today; adapt never tightens a search below the exactness horizon (`floorSample = cap × probability × ADAPT_FLOOR_SAFETY`). §14 finding 5 re-validated the floor (a true-10 097 set sampled 101 < floor — boundary noise the safety margin exists to absorb).
- **Scoring must never change**: requirements stay in non-scoring `filter` position (measured 2.5× slower otherwise, `load-management.md` §9); ignored words keep scoring (§14 finding 1 — this is what preserves 20/20 pages).
- **`meta.ignoredWords` and `meta.totalMarginPct` keep their names and semantics** — UI (`ui/src/composables/dataset/lines.ts`, `dataset-nb-results.vue`, `dataset-table.vue`) reads them and needs no change.
- **`q_required` is removed, not deprecated** (shipped yesterday in #528, unreleased to prod, documented "Ne pas construire manuellement"). Task 4 verifies unknown-param tolerance so stale links degrade gracefully.
- TypeScript ratchet: pre-push runs `dev/check-types-ratchet.sh` — no net-new tsc errors.
- Follow `docs/architecture/code-conventions.md`: pure logic in `operations.ts`, unit tests target pure functions only (never trick node config).
- Run only related tests while iterating (`npx playwright test <file>`); the full suite runs on push.
- Commits: `feat(datasets): …` style, one per task.
- All work in the `chore-better-q-adapt` worktree (`/home/alban/data-fair/data-fair_chore-better-q-adapt`); its docker deps (ES 8.19.9, mongo, simple-directory) are already up. The bench `bench-rna` index coexists in that ES — tests `clean()` only their own aliases.

---

### Task 1: Pure layer — `parseQIgnored` + `buildOrAdaptCandidates`

Additions only (nothing removed yet) so the tree stays green.

**Files:**
- Modify: `api/src/datasets/es/operations.ts` (append next to `parseQRequired` at ~880 and `chooseStrictestCandidate` at ~907)
- Test: `tests/features/datasets/q-mode-operations.unit.spec.ts`

**Interfaces:**
- Consumes: nothing new.
- Produces: `parseQIgnored(q: string, raw: string): string[]` (400s on non-token or all-words-covered), `interface OrAdaptCandidate { ignored: string[], retained: string[], sampledCount: number | null }`, `buildOrAdaptCandidates(words: string[], soloSampledCount: Record<string, number>, orSampledCount: number, floorSample: number): OrAdaptCandidate[]` — ordered strictest-first, `sampledCount: null` marks candidates Task 3 must count via `_msearch`. `chooseStrictestCandidate` is reused as-is.

- [ ] **Step 1: Write the failing unit tests**

Append to `tests/features/datasets/q-mode-operations.unit.spec.ts` (extend the import line with `parseQIgnored, buildOrAdaptCandidates`):

```ts
test('parseQIgnored accepts only whitespace tokens of q and must leave a word retained', () => {
  assert.deepEqual(parseQIgnored('commun rare', 'commun'), ['commun'])
  assert.deepEqual(parseQIgnored('commun alpha beta', ' commun , alpha '), ['commun', 'alpha'])
  assert.throws(() => parseQIgnored('commun rare', 'absent'), { status: 400 })
  assert.throws(() => parseQIgnored('commun rare', 'commu'), { status: 400 }) // partial words are not tokens
  assert.throws(() => parseQIgnored('commun rare', 'commun,rare'), { status: 400 }) // nothing left to filter on
  assert.throws(() => parseQIgnored('commun rare', 'commun,commun,rare'), { status: 400 }) // duplicates don't hide full coverage
})

test('buildOrAdaptCandidates orders strictest-first and lets bounds fill the counts', () => {
  // rue-baudelaire shape: one rare pivot — the strictest candidate is decided by its solo count
  const c1 = buildOrAdaptCandidates(['rue', 'baudelaire'], { rue: 14000, baudelaire: 7 }, 14119, 120)
  assert.deepEqual(c1, [
    { ignored: ['rue'], retained: ['baudelaire'], sampledCount: 7 }, // solo bound, disqualified
    { ignored: [], retained: ['rue', 'baudelaire'], sampledCount: 14119 } // the plain-OR fallback
  ])
  // a qualifying single-word candidate stops the walk (nothing looser can be chosen)
  const c2 = buildOrAdaptCandidates(['commun', 'rare'], { commun: 1030, rare: 100 }, 1100, 60)
  assert.deepEqual(c2, [
    { ignored: ['commun'], retained: ['rare'], sampledCount: 100 },
    { ignored: [], retained: ['commun', 'rare'], sampledCount: 1100 }
  ])
  // sum-bound disqualifies without counting; max-bound qualifies and stops the walk with
  // sampledCount null (Task 3 counts it for the display total)
  const c3 = buildOrAdaptCandidates(
    ['de', 'la', 'amis', 'bibliothèque'],
    { de: 25000, la: 22000, amis: 750, bibliothèque: 101 },
    30000, 120)
  assert.deepEqual(c3, [
    { ignored: ['de', 'la', 'amis'], retained: ['bibliothèque'], sampledCount: 101 }, // solo, disqualified
    { ignored: ['de', 'la'], retained: ['amis', 'bibliothèque'], sampledCount: null }, // max 750 ≥ 120: chosen, needs its total
    { ignored: [], retained: ['de', 'la', 'amis', 'bibliothèque'], sampledCount: 30000 }
  ])
  // sum-bound: two tiny words can be disqualified together without an ES count
  const c4 = buildOrAdaptCandidates(['big', 'x', 'y'], { big: 5000, x: 20, y: 30 }, 5040, 120)
  assert.equal(c4[1].sampledCount, 50) // {x,y} union ≤ 20+30 < 120 — no count needed
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd /home/alban/data-fair/data-fair_chore-better-q-adapt && npx playwright test tests/features/datasets/q-mode-operations.unit.spec.ts`
Expected: FAIL — `parseQIgnored`/`buildOrAdaptCandidates` are not exported.

- [ ] **Step 3: Implement the two pure functions**

In `api/src/datasets/es/operations.ts`, after `parseQRequired`:

```ts
/**
 * Parse and validate q_ignored — the words excluded from the non-scoring filter of the
 * score-broad-match-strict shape (they keep scoring); pinned by q_mode=adapt in next
 * links, or set manually. Every word must be a whitespace token of q, and at least one
 * word of q must remain retained, else 400.
 */
export const parseQIgnored = (q: string, raw: string): string[] => {
  const qWords = new Set(q.split(/\s+/))
  const words = String(raw).split(',').map(word => word.trim()).filter(Boolean)
  for (const word of words) {
    if (!qWords.has(word)) throw httpError(400, `Le paramètre q_ignored contient "${word}" qui n'est pas un mot de la recherche q.`)
  }
  if (new Set(words).size >= qWords.size) throw httpError(400, 'Le paramètre q_ignored ne peut pas couvrir tous les mots de la recherche q.')
  return words
}

export interface OrAdaptCandidate {
  /** the words dropped from filtering, most frequent first */
  ignored: string[]
  /** the words whose OR forms the non-scoring filter */
  retained: string[]
  /** sampled size of the retained union; null = needs an ES count (bounds could not decide) */
  sampledCount: number | null
}

/**
 * Candidates for OR-of-retained adapt, ordered strictest-first: ignore the k most frequent
 * words, k = words.length-1 … 0 (k=0 = nothing ignored, the plain OR — always last).
 * Union-size bounds fill sampledCount without an ES count where they can: a single
 * retained word IS its solo count; union ≤ sum(solo) < floor disqualifies; union ≥
 * max(solo) ≥ floor qualifies outright — and since every stricter candidate already
 * failed, that candidate will be chosen, so the walk stops there (its exact sampled count
 * is still needed, for the display total). Measured to eliminate the second probe in most
 * real queries — INVESTIGATIONS.md §14 finding 3.
 */
export const buildOrAdaptCandidates = (
  words: string[],
  soloSampledCount: Record<string, number>,
  orSampledCount: number,
  floorSample: number
): OrAdaptCandidate[] => {
  const byFreq = [...words].sort((a, b) => soloSampledCount[b] - soloSampledCount[a])
  const candidates: OrAdaptCandidate[] = []
  for (let k = words.length - 1; k >= 1; k--) {
    const candidate: OrAdaptCandidate = { ignored: byFreq.slice(0, k), retained: byFreq.slice(k), sampledCount: null }
    candidates.push(candidate)
    const solos = candidate.retained.map(word => soloSampledCount[word])
    const max = Math.max(...solos)
    const sum = solos.reduce((a, b) => a + b, 0)
    if (candidate.retained.length === 1) {
      candidate.sampledCount = solos[0]
      if (solos[0] >= floorSample) break
    } else if (sum < floorSample) {
      candidate.sampledCount = sum // disqualified either way — the ≤-bound is enough
    } else if (max >= floorSample) {
      break // qualified outright: chosen; only its display total still needs counting
    }
  }
  candidates.push({ ignored: [], retained: byFreq, sampledCount: orSampledCount })
  return candidates
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx playwright test tests/features/datasets/q-mode-operations.unit.spec.ts`
Expected: PASS (including the pre-existing `parseQRequired`/`chooseStrictestCandidate` tests — nothing removed yet).

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/operations.ts tests/features/datasets/q-mode-operations.unit.spec.ts
git commit -m "feat(datasets): pure helpers for OR-of-retained adapt (parseQIgnored, candidate bounds)"
```

---

### Task 2: Rewrite the API contract test to the OR semantics (red)

The spec is rewritten *first* and must FAIL against the shipped AND implementation — that failure is the proof the new fixture discriminates the two designs.

**Files:**
- Modify: `tests/features/datasets/q-mode-adapt.api.spec.ts`

**Interfaces:**
- Consumes: the running worktree dev deps (ES + mongo + simple-directory docker services).
- Produces: the executable contract Task 3 must turn green.

- [ ] **Step 1: Extend the fixture with an OR-discriminating 3-word case**

Replace the fixture block (lines 13–27). With 2-word queries, AND-of-one ≡ OR-of-one — only a 3-word query with *disjoint* rare-word rows separates the designs: under AND-of-retained `[alpha, beta]` the set would be empty, under OR it is both groups.

```ts
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
```

- [ ] **Step 2: Update the header comment and the tests to the OR contract**

Header comment (lines 8–11):

```ts
// q_mode=or|and|adapt (see docs/superpowers/plans/2026-08-01-adapt-or-of-retained.md and
// benchmark/INVESTIGATIONS.md §14). adapt = ignore the most common query words in filtering —
// just enough that the RETAINED-WORD UNION stays above the cap — while every word keeps
// scoring; the match set is the plain OR minus docs that only matched ignored words.
// THE INVARIANT under test: searches totalling under the cap are untouched.
```

Test changes, in place:

1. `'adapt drops the most common word …'` — unchanged assertions (`ignoredWords: ['commun']`, total 140–280, top result `'commun rare'`) — same outcome in both designs, keep as the continuity witness.

2. Replace `'adapt keeps every word required when the strict set already clears the cap'` with the min-bite no-op test (the observable outcome for this fixture is unchanged — `ignoredWords` absent — but the mechanism is now the bite guard: ignoring `grand` would qualify yet exclude nothing, since the words co-occur):

```ts
  test('adapt ignores nothing when ignoring would not shrink the set (co-occurring words)', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'grand ensemble', q_mode: 'adapt' } })).data
    assert.equal(res.meta.ignoredWords, undefined) // nothing was ignored → no field, just the estimate
    assert.ok(Number.isInteger(res.meta.totalMarginPct))
    assert.ok(res.total >= 140 && res.total < 280, `estimate ${res.total} implausible for true 200`)
  })
```

3. NEW — the OR-semantics proof:

```ts
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
```

4. Replace the `q_required` direct test:

```ts
  test('q_ignored applies the filter directly, no preflight', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_ignored: 'commun', count: 'exact' } })).data
    assert.equal(res.total, 200) // docs matching the retained word 'rare'
    assert.equal(res.meta, undefined)
    const bad = await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_ignored: 'absent' } }).catch((err: any) => err)
    assert.equal(bad.status, 400) // q_ignored words must be tokens of q
    const bad2 = await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_ignored: 'commun,rare' } }).catch((err: any) => err)
    assert.equal(bad2.status, 400) // at least one word must remain retained
  })
```

5. `'adapt pins the exclusion in the next link'` — assert `res.next.includes('q_ignored=commun')` (the pinned param is now the ignored list — genuinely "the exclusion").

6. `'a next-paginated chain enumerates exactly the tightened set'` — same 200-row expectations, pinned-param assert becomes `res.next.includes('q_ignored=commun')`.

7. `'q_mode=or and count=exact keep the broad exact behaviour'` — the fixture grew: expected union for `'commun rare'` becomes `2200 + 70 + 130 = 2400` (`commun` now also matches the alpha/beta rows). Update `assert.equal(res.total, 2400)`.

8. `'sqs syntax in q makes adapt step aside'` — `+commun rare` now truly matches `2060 + 200 = 2260` docs (commun required: 60+2000+70+130 = 2260). The existing `res.total >= 1600 && res.total < 2600` range still holds; update only the comment (`true 2260`).

9. All other tests (`invariant`, `q_mode=and`, `numeric q_mode`, `default mode`, `hints`) — unchanged.

- [ ] **Step 3: Run the spec to verify it fails against the shipped AND implementation**

Run: `npx playwright test tests/features/datasets/q-mode-adapt.api.spec.ts`
Expected: FAIL — at minimum the OR-proof test (shipped AND requires `[alpha, beta]`… which cannot qualify, so it degenerates differently — either way `ignoredWords`/results mismatch), the `q_ignored` tests (unknown param → no filter applied → totals wrong), and the next-link asserts (`q_required=` still pinned). The `'commun rare'` continuity test may still pass — that is expected and fine.

- [ ] **Step 4: Commit the red spec**

```bash
git add tests/features/datasets/q-mode-adapt.api.spec.ts
git commit -m "test(datasets): rewrite q_mode=adapt contract to OR-of-retained semantics (red)"
```

---

### Task 3: The switchover — `buildQClauses`, `commons.ts`, `adaptive-q.ts`, `read.ts` (green)

**Files:**
- Modify: `api/src/datasets/es/operations.ts:484-546` (`buildQClauses`), `~880` (delete `parseQRequired`)
- Modify: `api/src/datasets/es/commons.ts:338-339`
- Modify: `api/src/datasets/es/adaptive-q.ts` (rewrite of the candidate/probe2 section + result shape)
- Modify: `api/src/datasets/routes/read.ts:94-108`
- Modify: `tests/features/datasets/q-mode-operations.unit.spec.ts` (drop the `parseQRequired` tests)

**Interfaces:**
- Consumes: `parseQIgnored`, `buildOrAdaptCandidates`, `OrAdaptCandidate`, `chooseStrictestCandidate` from Task 1.
- Produces: `buildQClauses(dataset, q, qFields, qMode, sqsOptions?, ignoredWords?: string[])` (last param renamed and re-purposed), `AdaptResult { ignored: string[], total: number, marginPct: number }` from `runAdaptivePreflight` (the `required` field is gone).

- [ ] **Step 1: `buildQClauses` — the filter becomes an OR over the retained words**

Replace the tail of `buildQClauses` (operations.ts:530-546) — signature parameter `requiredWords?: string[]` becomes `ignoredWords?: string[]`:

```ts
  const scored = { bool: { should, minimum_should_match: 1 } }

  // "score broad, match strict": q_mode=and and q_ignored tighten the MATCH SET through a
  // non-scoring filter while scores stay pure OR — the page is OR's page restricted to the
  // tightened set, and the filter leads the iteration. For q_ignored the filter is the OR
  // of the retained (non-ignored) words: the match set is the plain OR minus docs that
  // only matched ignored words — ignored words keep scoring. Requirements must NEVER move
  // into scoring position (measured 2.5× slower on ES 7, see load-management.md §9).
  // Not composed with `complete` mode (its prefix/wildcard clauses carry their own semantics).
  if (qMode !== 'complete') {
    const matchFields = reduced ? qSearchFields : [...qSearchFields, ...qStandardFields]
    if (qMode === 'and' && matchFields.length) {
      return { bool: { must: [scored], filter: [{ simple_query_string: { query: q, fields: matchFields, default_operator: 'and' } }] } }
    }
    if (ignoredWords?.length && matchFields.length) {
      const retained = [...new Set(q.split(/\s+/))].filter(word => !ignoredWords.includes(word))
      return {
        bool: {
          must: [scored],
          filter: [{ bool: { should: retained.map(word => ({ multi_match: { query: word, fields: matchFields } })), minimum_should_match: 1 } }]
        }
      }
    }
  }
  return scored
```

- [ ] **Step 2: `commons.ts` — parse `q_ignored` instead of `q_required`**

At commons.ts:338-339 (and the matching import of `parseQRequired` at the top of the file):

```ts
      const ignoredWords = query.q_ignored ? parseQIgnored(q, query.q_ignored) : undefined
      must.push(buildQClauses(dataset, q, qFields, qMode, sqsOptions, ignoredWords))
```

- [ ] **Step 3: Rewrite `adaptive-q.ts`**

Replace the header comment, `AdaptResult`, and the candidate/probe2 section. The probe1 block (`orQuery`, `sampleSlice`, `wordMatchClauses`, the filters-agg search, `sampledCap`/`floorSample`, the `orSampledCount < sampledCap → null` early return) is unchanged except: `q_required: undefined` becomes `q_ignored: undefined` in the `prepareQuery` call, the word split gains a dedupe (`[...new Set(q.split(/\s+/))].slice(0, MAX_ADAPT_WORDS)`), and the import line pulls `buildOrAdaptCandidates, type OrAdaptCandidate` instead of nothing new.

```ts
// q_mode=adapt: ignore the most frequent words of the search in filtering — just enough of
// them that the RETAINED-WORD UNION stays above the exactness horizon (the track_total_hits
// cap) — while every word keeps scoring (see buildQClauses' score-broad-match-strict shape).
// The match set is the plain OR search minus the docs that only matched ignored words.
//
// The decision is measured on the `_rand < randBound` sample slice, so every count in this
// module is in SAMPLED DOCS (multiply by 1/probability for real counts). One size:0 search
// returns the sampled count of the full OR search plus a per-word sampled count (filters
// agg); union-size bounds decide most candidates from those alone (buildOrAdaptCandidates),
// and the few undecided unions are counted in one _msearch.
//
// Outcomes (THE INVARIANT: searches totalling under the cap run exactly as today):
//   - OR search under the cap                 → null (plain behaviour, exact total)
//   - some words can be ignored               → { ignored: the most frequent }
//   - nothing ignorable above the floor, or
//     ignoring would not bite (co-occurring
//     words: the union ≈ the full OR)        → { ignored: [] } (plain capped OR, sampled total)
// The chosen candidate's sampled count also provides the response total, so the /lines
// pipeline needs no separate count leg. Design evidence: benchmark/INVESTIGATIONS.md §14.

export interface AdaptResult {
  ignored: string[]
  total: number
  /** margin of error in percent (~95 % confidence, rounded up) — becomes meta.totalMarginPct */
  marginPct: number
}
```

The candidate/probe2/choose section (replacing lines 83–139 of the current file):

```ts
  // candidates strictest-first: ignore the k most frequent words, keep the rest as an OR
  // filter. Union-size bounds fill most sampled counts without ES (see the helper's doc);
  // the undecided unions are counted in one _msearch, each as a top-level filtered query
  // (the retained-OR filter leads the iteration over its own posting lists).
  const candidates = buildOrAdaptCandidates(words, wordSampledCount, orSampledCount, floorSample)
  const needCounting = candidates.filter(candidate => candidate.sampledCount === null)

  if (needCounting.length) {
    const msearchBody = needCounting.flatMap(candidate => [
      {},
      {
        size: 0,
        track_total_hits: true,
        // _msearch rejects a `timeout` querystring but accepts it per body — same ES-side
        // bound as every other search (the client requestTimeout stays the backstop)
        timeout: config.elasticsearch.searchTimeout,
        query: {
          bool: {
            filter: [
              orQuery,
              { bool: { should: candidate.retained.map(word => wordMatchClauses[word]), minimum_should_match: 1 } },
              sampleSlice
            ]
          }
        }
      }
    ])
    const res = await timedEsCall(abortContext, () => client.transport.request({
      method: 'POST',
      path: `/${aliasName(dataset)}/_msearch`,
      bulkBody: msearchBody
    }, { ...abortContext, meta: true }))
    const responses: any[] = ((res as any).body).responses
    for (const [i, candidate] of needCounting.entries()) {
      if (responses[i].error) throw httpError(500, '[internal] adapt preflight msearch failed: ' + JSON.stringify(responses[i].error).slice(0, 200))
      candidate.sampledCount = responses[i].hits.total.value
    }
  }

  const chosen = chooseStrictestCandidate(candidates as Array<OrAdaptCandidate & { sampledCount: number }>, floorSample)

  // an ignore-set must actually bite: when the query's words co-occur (phrase-like
  // searches), the retained union covers (almost) the whole OR sample — filtering would
  // exclude (almost) nothing and reporting "ignored" words would be pure noise. The two
  // counts are nested on the same sample slice, so this comparison is exact, not
  // statistical; and the union grows along looseness, so if the strictest candidate does
  // not bite, no candidate does.
  if (chosen.ignored.length && chosen.sampledCount >= orSampledCount * ADAPT_MIN_BITE) {
    return {
      ignored: [],
      total: extrapolateApproxTotal(orSampledCount, mode),
      marginPct: estimateMarginPct(orSampledCount)
    }
  }
  return {
    ignored: chosen.ignored,
    total: extrapolateApproxTotal(chosen.sampledCount, mode),
    marginPct: estimateMarginPct(chosen.sampledCount)
  }
```

And in `operations.ts`, next to `ADAPT_FLOOR_SAFETY`:

```ts
/**
 * Minimum "bite" for an adapt ignore-set: the retained union must exclude at least 2 % of
 * the sampled OR set, else filtering is pointless overhead (phrase-like queries whose
 * words co-occur) and adapt reports nothing ignored. Both counts are nested on the same
 * sample slice — the comparison is exact. A UX constant, deliberately not configuration.
 */
export const ADAPT_MIN_BITE = 0.98
```

(`buildQClauses` stays imported for `wordMatchClauses`; the adaptive-q import line adds `buildOrAdaptCandidates`, `ADAPT_MIN_BITE` and `type OrAdaptCandidate`, and drops nothing else. The `Candidate` interface local to the old file is deleted — `OrAdaptCandidate` replaces it.)

- [ ] **Step 4: `read.ts` — pin `q_ignored` in the mutated query**

Replace read.ts:94-108:

```ts
  // q_mode=adapt: ignore over-common words in filtering (they keep scoring) so the retained
  // union stays above the cap — see es/adaptive-q.ts. The preflight rewrites the effective
  // query to q_ignored BEFORE the main search; `next` links inherit it from the mutated
  // query, so after= pages replay the exact same tightened query with no preflight (chain
  // consistency).
  let ignoredWords: string[] | undefined
  const resolvedQMode = query.q ? parseQMode(query.q_mode, DEFAULT_Q_MODE) : undefined
  if (countMode && query.count !== 'estimate' && resolvedQMode === 'adapt' && !query.q_ignored) {
    const adaptResult = await runAdaptivePreflight(req.app.get('es'), dataset, query, countMode, esAbortContext)
    observe.reqStep(req, 'adaptPreflight')
    if (adaptResult) {
      // the transparency field only appears when adapt actually ignored at least one word
      if (adaptResult.ignored.length) {
        query.q_ignored = adaptResult.ignored.join(',')
        ignoredWords = adaptResult.ignored
      }
      // the preflight already estimated the chosen candidate's total — no separate count leg needed
      approxTotalThunk = () => Promise.resolve({ total: adaptResult.total, marginPct: adaptResult.marginPct })
    }
  }
```

- [ ] **Step 5: Delete `parseQRequired` and its unit tests**

Remove `parseQRequired` from operations.ts and its test block from `q-mode-operations.unit.spec.ts` (keep the `parseQMode` and `chooseStrictestCandidate` tests — both functions survive).

- [ ] **Step 6: Run unit + API specs to verify green**

Run: `npx playwright test tests/features/datasets/q-mode-operations.unit.spec.ts tests/features/datasets/q-mode-adapt.api.spec.ts`
Expected: PASS, all tests.

- [ ] **Step 7: Ratchet + lint**

Run: `bash dev/check-types-ratchet.sh && npm run lint`
Expected: no net-new tsc errors, lint clean.

- [ ] **Step 8: Commit**

```bash
git add api/src/datasets/es/operations.ts api/src/datasets/es/commons.ts api/src/datasets/es/adaptive-q.ts api/src/datasets/routes/read.ts tests/features/datasets/q-mode-operations.unit.spec.ts
git commit -m "feat(datasets): q_mode=adapt filters on the OR of retained words (q_ignored replaces q_required)"
```

---

### Task 4: Contract docs, param plumbing, stale-link tolerance, trace docs

**Files:**
- Modify: `api/contract/dataset-api-docs.ts:170-200` (q_mode + q_required→q_ignored param docs), `~723-726` (meta.ignoredWords description — verify, likely unchanged)
- Modify: `api/src/misc/utils/query-advice.ts:70`
- Modify: `docs/architecture/text-search-evaluation.md` §7 (amendment note)
- Test: `tests/features/datasets/q-mode-adapt.api.spec.ts` (one added tolerance test)

**Interfaces:**
- Consumes: the Task 3 behaviour.
- Produces: user-facing OpenAPI docs and the §7 design-trace amendment.

- [ ] **Step 1: Verify unknown-param behaviour, then encode stale-`q_required`-link tolerance**

Check what a stale #528-era next link does now: `GET /lines?q=commun rare&q_required=rare`. Read `query-advice.ts` around line 70 to see whether unlisted params 400 or merely produce a hint. Then add the test capturing the intended behaviour — a stale link must NOT 400; it re-runs the preflight and returns a coherent page:

```ts
  test('a stale q_required link (pre-rename #528) degrades gracefully', async () => {
    const res = (await testUser1.get(`/api/v1/datasets/${id}/lines`, { params: { q: 'commun rare', q_required: 'rare' } })).data
    assert.deepEqual(res.meta.ignoredWords, ['commun']) // the preflight re-ran; q_required is inert
    assert.ok(res.total >= 140 && res.total < 280)
  })
```

If the advice layer 400s on unknown params (or `query-advice.ts:70` gates them), keep `'q_required'` listed there alongside `'q_ignored'` with the comment `// tolerated pre-rename param (#528, never released) — remove after next release`; otherwise just rename the entry.

- [ ] **Step 2: Update the OpenAPI param docs**

In `api/contract/dataset-api-docs.ts`, the q_mode `adapt` paragraph becomes (only the first sentence's mechanics change — it now describes exactly what happens):

```
  Le mode "adapt" ignore automatiquement pour le filtrage les mots trop fréquents — juste assez pour que l'ensemble des résultats contenant au moins un des mots restants reste au-dessus du seuil de comptage exact ; les mots ignorés comptent toujours pour le classement et sont signalés dans la réponse (\`meta.ignoredWords\`). Une recherche dont le total est sous le seuil, ou utilisant la syntaxe d'opérateurs, n'est pas modifiée.
```

The `q_required` param block is replaced by:

```ts
  }, {
    in: 'query',
    name: 'q_ignored',
    description: `
  Paramètre technique renseigné automatiquement par le mode "adapt" dans les liens de pagination (\`next\`) pour garantir des pages cohérentes : liste de mots de la recherche "q" (séparés par des virgules) ignorés du filtrage — les résultats contiennent au moins un des autres mots de la recherche, les mots ignorés comptent toujours pour le classement. Ne pas construire manuellement.
    `,
    schema: {
      title: 'Mots ignorés (pagination adapt)',
      type: 'string'
    }
  }, {
```

Verify the `meta.ignoredWords` response-field description (~line 726) still reads correctly — it already says "ignoré des mots trop fréquents pour le filtrage (ils comptent toujours pour le classement)", which is now exactly true; leave it.

- [ ] **Step 3: Amend `docs/architecture/text-search-evaluation.md` §7**

Append at the end of §7:

```markdown
> **Amendment (2026-08-01).** The shipped `adapt` (#528) filtered on the *conjunction* of
> the rarest words ("require the rarest, ignore the rest"). Re-benchmarked against the
> OR-of-retained reading — filter = union of the non-ignored words, i.e. the plain search
> minus docs that only matched ignored words — the OR form gives identical top-20 pages,
> is cheaper wherever both designs act, adapts in cases the conjunction lattice cannot,
> and matches the "some words were ignored" message users actually see. Filter semantics
> were switched accordingly and the pinned pagination param renamed `q_required` →
> `q_ignored`. Evidence and decision rule: `benchmark/INVESTIGATIONS.md` §14.
```

- [ ] **Step 4: Run the API spec, ratchet, lint**

Run: `npx playwright test tests/features/datasets/q-mode-adapt.api.spec.ts && bash dev/check-types-ratchet.sh && npm run lint`
Expected: PASS / no net-new errors / clean.

- [ ] **Step 5: Commit**

```bash
git add api/contract/dataset-api-docs.ts api/src/misc/utils/query-advice.ts docs/architecture/text-search-evaluation.md tests/features/datasets/q-mode-adapt.api.spec.ts
git commit -m "docs(datasets): q_ignored param docs, stale q_required tolerance, §7 amendment"
```

---

### Task 5: Full verification sweep

**Files:** none new — verification only.

- [ ] **Step 1: Run every spec that exercises the adapt/approx machinery**

Run: `npx playwright test tests/features/datasets/q-mode-adapt.api.spec.ts tests/features/datasets/q-mode-operations.unit.spec.ts tests/features/datasets/approx-count-operations.unit.spec.ts $(grep -rln "totalMarginPct\|ignoredWords\|q_mode" tests/features --include="*.spec.ts" | tr '\n' ' ')`
Expected: PASS. Any spec still asserting `q_required` shows up here — fix it to `q_ignored` semantics before proceeding.

- [ ] **Step 2: Grep for leftovers**

Run: `grep -rn "q_required\|parseQRequired\|\brequired\b.*ignored" api/src api/contract ui/src --include="*.ts" --include="*.vue"`
Expected: only the deliberate tolerance entry from Task 4 Step 1 (if the advice layer needed it) and historical mentions in `docs/superpowers/plans/2026-07-30-*` (leave those — plans are records).

- [ ] **Step 3: Final ratchet + lint + build-types sanity**

Run: `bash dev/check-types-ratchet.sh && npm run lint`
Expected: clean. (Full suite runs on push via husky.)

- [ ] **Step 4: Commit anything the sweep fixed**

```bash
git add -A && git commit -m "fix(datasets): sweep fixes from adapt OR-semantics verification" # only if the sweep changed files
```
