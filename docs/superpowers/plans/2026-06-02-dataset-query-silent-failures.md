# Dataset Query Silent Partial Failures — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop AI agents from misusing the `_c_` concept-filter prefix on column filters, surface silently-ignored query parameters as an advisory hint, and close three validation gaps with proper 400 errors.

**Architecture:** A new pure `ignoredParamsAdvice(req)` in `query-advice.ts` detects ignored params (misused `_c_` filters + unrecognized params) from `req.query`+`req.dataset.schema`; `attachQueryHint` emits it always (except `hint=false`), independent of the slow-query gate that still governs perf advice. Agent prompts gain an explicit "never `_c_` on columns" rule, the agent data tools surface the response `hint`, and `q_fields`/`highlight`/`geo_agg` metric validation now throw 400 like their siblings.

**Tech Stack:** Node.js/TypeScript API, Express, Elasticsearch query builders, Playwright test runner (`@playwright/test`) with `node:assert/strict`, i18n via the `i18n` npm package.

---

## Spec

See `docs/superpowers/specs/2026-06-02-dataset-query-silent-failures-design.md`.

## File Structure

- `api/i18n/messages/en.json`, `api/i18n/messages/fr.json` — new advice message keys (Task 1).
- `api/src/misc/utils/query-advice.ts` — `RECOGNIZED_PARAMS`, `ignoredParamsAdvice`, modified `attachQueryHint` (Tasks 2-3).
- `api/src/datasets/router.js` — wire `attachQueryHint` into `/metric_agg` (Task 4).
- `agent-tools/_utils.ts`, `agent-tools/dataset-data-subagent.ts`, `ui/src/composables/agent/navigation-tools.ts` — prompt disambiguation (Task 5).
- `agent-tools/search-data.ts`, `agent-tools/aggregate-data.ts`, `agent-tools/calculate-metric.ts` — surface `hint` (Task 6).
- `api/src/datasets/es/commons.js` — `q_fields` + `highlight` validation (Tasks 7-8).
- `api/src/datasets/es/geo-agg.js` — metric validation (Task 9).
- `docs/architecture/agent-integration-architecture.md` — doc update (Task 10).
- Tests: `tests/features/infra/query-advice.unit.spec.ts`, `tests/features/agent-tools/data-tools.unit.spec.ts`, `tests/features/datasets/schema/capabilities.api.spec.ts` (or a new query spec), `tests/features/datasets/query/search-hint.api.spec.ts`.

## Conventions (read before starting)

- Unit specs import the module under test directly and use a `fakeReq` whose `__` echoes the key (see `tests/features/infra/query-advice.unit.spec.ts:7-12`), so assertions match on i18n **key names** via regex, not translated text.
- API specs create REST datasets, push `_bulk_lines`, then `await waitForFinalize(ax, slug)`. 400s are asserted with `await assert.rejects(promise, (err: any) => err.status === 400)`; the error message string is on `err.data`.
- Run a single unit spec file: `npx playwright test tests/features/infra/query-advice.unit.spec.ts`.
- Run a single API spec: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts`.
- Per AGENTS.md: run only the related test cases while iterating; the full suite runs on push via husky.

---

## Task 1: Add i18n message keys for ignored-parameter advice

**Files:**
- Modify: `api/i18n/messages/en.json:22`
- Modify: `api/i18n/messages/fr.json:22`

- [ ] **Step 1: Add the English keys**

In `api/i18n/messages/en.json`, the line for `queryAdviceQFields` (line 22) ends with a comma. Insert these four keys immediately after it:

```json
		"queryAdviceQFields": "restrict full-text search to the relevant columns with q_fields=col1,col2 instead of searching every column",
		"queryAdviceIgnoredIntro": "Some parameters were ignored",
		"queryAdviceConceptUseColumn": "%s → use %s instead (the _c_ prefix is reserved for concept filters, not columns)",
		"queryAdviceConceptUnknown": "%s was ignored — the _c_ prefix is for concept filters and matched no concept in this dataset",
		"queryAdviceUnknownParam": "%s is not a recognized query parameter and was ignored",
```

- [ ] **Step 2: Add the French keys**

In `api/i18n/messages/fr.json`, after the `queryAdviceQFields` line (line 22):

```json
		"queryAdviceQFields": "restreignez la recherche plein texte aux colonnes pertinentes avec q_fields=col1,col2 plutôt que de rechercher dans toutes les colonnes",
		"queryAdviceIgnoredIntro": "Certains paramètres ont été ignorés",
		"queryAdviceConceptUseColumn": "%s → utilisez plutôt %s (le préfixe _c_ est réservé aux filtres par concept, pas aux colonnes)",
		"queryAdviceConceptUnknown": "%s a été ignoré — le préfixe _c_ concerne les filtres par concept et ne correspond à aucun concept de ce jeu de données",
		"queryAdviceUnknownParam": "%s n'est pas un paramètre de requête reconnu et a été ignoré",
```

- [ ] **Step 3: Verify both files are valid JSON**

Run: `node -e "require('./api/i18n/messages/en.json'); require('./api/i18n/messages/fr.json'); console.log('ok')"`
Expected: prints `ok` (no JSON parse error).

- [ ] **Step 4: Commit**

```bash
git add api/i18n/messages/en.json api/i18n/messages/fr.json
git commit -m "i18n: add ignored-parameter query advice messages"
```

---

## Task 2: Implement `ignoredParamsAdvice` (pure detection)

**Files:**
- Modify: `api/src/misc/utils/query-advice.ts`
- Test: `tests/features/infra/query-advice.unit.spec.ts`

- [ ] **Step 1: Write failing tests**

Append this `test.describe` block to `tests/features/infra/query-advice.unit.spec.ts` (and add `ignoredParamsAdvice` to the import on line 3: `import { queryAdvice, shouldEmitHint, attachQueryHint, ignoredParamsAdvice } from '...'`):

```ts
test.describe('ignoredParamsAdvice', () => {
  const ds = {
    schema: [
      { key: 'ville', type: 'string' },
      { key: 'age', type: 'integer' },
      { key: 'cp', type: 'string', 'x-concept': { id: 'postalCode', primary: true } }
    ]
  }

  test('empty when only recognized params and valid column filters are present', () => {
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { size: '10', select: 'ville', sort: '-age', q: 'x', q_fields: 'ville' }, ds)), '')
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { ville_eq: 'Paris', age_gte: '18' }, ds)), '')
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_q: 'x', _c_bbox: '0,0,1,1' }, ds)), '')
  })

  test('legit concept filter that resolves to a primary concept is not flagged', () => {
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_postalCode_eq: '75001' }, ds)), '')
  })

  test('Tier 1: _c_ on a column key suggests the bare column filter', () => {
    const out = ignoredParamsAdvice(fakeReq('/abc/lines', { _c_ville_eq: 'Paris' }, ds))
    assert.match(out, /errors\.queryAdviceIgnoredIntro/)
    assert.match(out, /errors\.queryAdviceConceptUseColumn/)
  })

  test('Tier 2: _c_ matching no concept and no column is flagged as inert', () => {
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_foo_eq: 'x' }, ds)), /errors\.queryAdviceConceptUnknown/)
    // no filter suffix at all
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { _c_foo: 'x' }, ds)), /errors\.queryAdviceConceptUnknown/)
  })

  test('unknown / misspelled parameter is flagged', () => {
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { siez: '10' }, ds)), /errors\.queryAdviceUnknownParam/)
  })

  test('no schema on request: still flags unrecognized scalar params, skips column checks', () => {
    assert.match(ignoredParamsAdvice(fakeReq('/abc/lines', { siez: '10' })), /errors\.queryAdviceUnknownParam/)
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', { size: '10' })), '')
  })

  test('drift guard: no documented data-endpoint param is ever flagged', () => {
    const documented = {
      size: '1', page: '1', after: '["x"]', count: 'false', select: 'ville', sort: 'age',
      truncate: '100', thumbnail: '300x200', html: 'true', format: 'json', hint: 'true', draft: 'true',
      q: 'x', q_fields: 'ville', q_mode: 'complete', qs: 'ville:Paris', highlight: 'ville',
      owner: 'u', account: 'a', bbox: '0,0,1,1', geo_distance: '0,0,1km', date_match: '2020-01-01',
      xyz: '1,2,3', wkt: 'POINT(0 0)', _c_q: 'x', _c_bbox: '0,0,1,1', _c_geo_distance: '0,0,1km', _c_date_match: '2020-01-01',
      agg_size: '10', field: 'ville', metric: 'avg', metric_field: 'age', metrics: 'avg', extra_metrics: 'x',
      percents: '50', precision_threshold: '100', interval: 'month', calendar: 'true', missing: '0', analysis: 'standard', sampling: 'neighbors'
    }
    assert.equal(ignoredParamsAdvice(fakeReq('/abc/lines', documented, ds)), '')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts -g ignoredParamsAdvice`
Expected: FAIL — `ignoredParamsAdvice is not a function` (not yet exported).

- [ ] **Step 3: Implement `ignoredParamsAdvice`**

In `api/src/misc/utils/query-advice.ts`, extend the import on line 3 to also pull `FILTER_CAPABILITIES`:

```ts
import { hasManyQSearchFields, FILTER_CAPABILITIES } from '../../datasets/es/operations.ts'
```

Then add, immediately after the `queryAdvice` function (after its closing `}` near line 47):

```ts
// Parameters recognized by the dataset data endpoints (/lines, /*_agg). Mirrors the query
// params declared in api/contract/dataset-api-docs.ts and consumed in es/commons.js and
// es/*-agg.js. Anything else is silently ignored by the API — surfaced via ignoredParamsAdvice.
// Keep in sync with those sources (the drift-guard unit test enumerates the documented set).
const RECOGNIZED_PARAMS = new Set([
  // pagination / output shaping
  'size', 'page', 'after', 'count', 'select', 'sort', 'truncate', 'thumbnail', 'html', 'format', 'hint', 'draft',
  // full-text search
  'q', 'q_fields', 'q_mode', 'qs', 'highlight',
  // ownership / account scoping
  'owner', 'account',
  // geo / temporal (+ their _c_ concept forms)
  'bbox', 'geo_distance', 'date_match', 'xyz', 'wkt',
  '_c_q', '_c_bbox', '_c_geo_distance', '_c_date_match',
  // aggregations
  'agg_size', 'field', 'metric', 'metric_field', 'metrics', 'extra_metrics',
  'percents', 'precision_threshold', 'interval', 'calendar', 'missing', 'analysis', 'sampling'
])

/**
 * Advisory for parameters the API silently ignored: a `_c_` concept prefix misapplied to a
 * column filter, an inert `_c_` filter that matched no concept, or an unrecognized/misspelled
 * parameter. Returns '' when nothing applies. Pure — reads only req.query + req.dataset.schema.
 *
 * Unlike queryAdvice (a *performance* advisory gated on slow queries), this is a *correctness*
 * signal: attachQueryHint emits it regardless of query duration, still suppressed by hint=false.
 */
export const ignoredParamsAdvice = (req: Request & { dataset?: { schema?: any[] } }): string => {
  const q: Record<string, any> = req.query || {}
  const schema = req.dataset?.schema
  const columnKeys = new Set((schema ?? []).map(p => p.key))
  const conceptIds = new Set((schema ?? []).filter(p => p['x-concept']?.primary).map(p => p['x-concept'].id))
  const suffixes = Object.keys(FILTER_CAPABILITIES)
  const items: string[] = []

  for (const key of Object.keys(q)) {
    if (RECOGNIZED_PARAMS.has(key)) continue
    const suffix = suffixes.find(s => key.endsWith(s))
    // a bare column filter (<columnKey><suffix> for a real column) is recognized
    if (suffix && !key.startsWith('_c_') && columnKeys.has(key.slice(0, key.length - suffix.length))) continue

    if (key.startsWith('_c_')) {
      const inner = key.slice(3, suffix ? key.length - suffix.length : key.length)
      if (conceptIds.has(inner)) continue // legit concept filter that resolved
      if (suffix && columnKeys.has(inner)) {
        items.push(req.__('errors.queryAdviceConceptUseColumn', key, inner + suffix)) // Tier 1: typo
      } else {
        items.push(req.__('errors.queryAdviceConceptUnknown', key)) // Tier 2: inert
      }
    } else {
      items.push(req.__('errors.queryAdviceUnknownParam', key))
    }
  }

  if (!items.length) return ''
  return ' ' + req.__('errors.queryAdviceIgnoredIntro') + ' : ' + items.join(' ; ') + '.'
}
```

Note: `req.__` is the `i18n` translate function; it does sprintf substitution for the `%s` placeholders. In the unit test `fakeReq.__` echoes the key and ignores extra args — assertions match on key names, which is the established pattern.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts -g ignoredParamsAdvice`
Expected: PASS (all ignoredParamsAdvice cases).

- [ ] **Step 5: Run the full query-advice spec to confirm no regression**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts`
Expected: PASS (existing `queryAdvice`/`shouldEmitHint`/`attachQueryHint` tests still green).

- [ ] **Step 6: Commit**

```bash
git add api/src/misc/utils/query-advice.ts tests/features/infra/query-advice.unit.spec.ts
git commit -m "feat(query-advice): detect silently-ignored params (_c_ misuse + unknown params)"
```

---

## Task 3: Emit the correctness advice from `attachQueryHint` (always-on except hint=false)

**Files:**
- Modify: `api/src/misc/utils/query-advice.ts:73-91`
- Test: `tests/features/infra/query-advice.unit.spec.ts`

- [ ] **Step 1: Write failing tests**

Append to the existing `test.describe('attachQueryHint', ...)` block in `tests/features/infra/query-advice.unit.spec.ts`:

```ts
  test('emits the correctness hint on a fast auto query (duration-independent)', () => {
    const ds = { schema: [{ key: 'ville', type: 'string' }] }
    const req = fakeReq('/abc/lines', { _c_ville_eq: 'Paris' }, ds) // hint defaults to auto
    const out = attachQueryHint(req, 0, { total: 5 })
    assert.match(out.hint as string, /errors\.queryAdviceConceptUseColumn/)
  })
  test('hint=false suppresses the correctness hint too', () => {
    const ds = { schema: [{ key: 'ville', type: 'string' }] }
    const req = fakeReq('/abc/lines', { hint: 'false', _c_ville_eq: 'Paris' }, ds)
    assert.equal('hint' in attachQueryHint(req, 0, { total: 5 }), false)
  })
  test('combines correctness advice (first) with perf advice on a slow wide query', () => {
    const ds = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })).concat([{ key: 'ville' } as any]) }
    const req = fakeReq('/abc/lines', { _c_ville_eq: 'Paris' }, ds)
    const out = attachQueryHint(req, 1500, { total: 5 })
    const hint = out.hint as string
    assert.match(hint, /errors\.queryAdviceConceptUseColumn/)
    assert.match(hint, /errors\.queryAdviceSelect/)
    assert.ok(hint.indexOf('errors.queryAdviceIgnoredIntro') < hint.indexOf('errors.queryAdviceIntro'))
  })
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts -g attachQueryHint`
Expected: FAIL — the new cases fail (current `attachQueryHint` returns no hint on a fast query / does not call `ignoredParamsAdvice`).

- [ ] **Step 3: Update `attachQueryHint`**

Replace the body of `attachQueryHint` (currently `query-advice.ts:78-90`) with:

```ts
  const mode = parseHintMode(req.query?.hint)
  if (mode === 'false') return result
  const adviceReq = req.publicOperation
    ? {
        path: req.path,
        query: req.query,
        dataset: req.dataset,
        __: (key: string, ...args: any[]) => i18n.__({ phrase: key, locale: 'en' }, ...args)
      } as any
    : req
  // correctness advice (misused/ignored params) is duration-independent — always on unless hint=false
  const ignored = ignoredParamsAdvice(adviceReq).trim()
  // performance advice keeps its slow-auto / explicit-true gate
  const perf = shouldEmitHint(mode, esStepDurationMs) ? queryAdvice(adviceReq).trim() : ''
  const advice = [ignored, perf].filter(Boolean).join(' ')
  if (!advice) return result
  return { hint: advice, ...result }
```

Note: the only change to the public-operation `__` shim is adding `...args` so the `%s` placeholders in the new messages interpolate for cached/public responses.

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts`
Expected: PASS (new attachQueryHint cases + all pre-existing cases).

- [ ] **Step 5: Commit**

```bash
git add api/src/misc/utils/query-advice.ts tests/features/infra/query-advice.unit.spec.ts
git commit -m "feat(query-advice): emit ignored-param advice always (except hint=false)"
```

---

## Task 4: Wire `attachQueryHint` into the `/metric_agg` route

**Files:**
- Modify: `api/src/datasets/router.js:1166-1176`

Rationale: `calculate_metric` (Task 6) calls `/metric_agg`, which currently never attaches a hint. The correctness advice is duration-independent, so pass `0` for the ES duration (perf advice will not fire here, which is fine for a single-value metric).

- [ ] **Step 1: Update the handler**

In the `/metric_agg` handler (`router.js:1170-1175`), replace:

```js
  try {
    result = await esUtils.metricAgg(req.app.get('es'), req.dataset, req.query, esAbortContext)
  } catch (err) {
    await manageESError(req, err)
  }
  res.status(200).send(result)
```

with:

```js
  try {
    result = await esUtils.metricAgg(req.app.get('es'), req.dataset, req.query, esAbortContext)
  } catch (err) {
    await manageESError(req, err)
  }
  // correctness hint only (metric_agg does not time the ES step); perf advice stays off at duration 0
  result = attachQueryHint(req, 0, result)
  res.status(200).send(result)
```

- [ ] **Step 2: Verify the route still type-checks / lints**

Run: `npx eslint api/src/datasets/router.js`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add api/src/datasets/router.js
git commit -m "feat(api): attach query hint on /metric_agg for correctness advice"
```

---

## Task 5: Remove the agent-prompt ambiguity (Part A)

**Files:**
- Modify: `agent-tools/_utils.ts:42`
- Modify: `agent-tools/dataset-data-subagent.ts:23-25`
- Modify: `ui/src/composables/agent/navigation-tools.ts:80,126`

- [ ] **Step 1: Update `filtersDescription`**

In `agent-tools/_utils.ts`, the paragraph at line 42 currently ends with the error-driven-correction guidance. Append this sentence to that same paragraph (before the blank line and the `Example:` line):

```
 Never prefix a column filter with _c_ (e.g. _c_ville_eq is wrong): the _c_ prefix is reserved for concept filters (full-text/geo/date) handled by separate params, and a _c_-prefixed column filter is silently ignored, not applied — use the bare column_key + suffix (ville_eq).
```

- [ ] **Step 2: Update the subagent filtering instructions**

In `agent-tools/dataset-data-subagent.ts`, in the `Filtering:` list (lines 23-25), add a fourth bullet after the existing three:

```
- Never put a _c_ prefix on a column filter (use ville_eq, not _c_ville_eq). _c_ is reserved for concept filters and a _c_-prefixed column filter is silently ignored.
```

- [ ] **Step 3: Update the navigation tool descriptions**

In `ui/src/composables/agent/navigation-tools.ts`, line 80, the sentence currently reads:
`The \`_c_\` prefix on q/bbox/geo_distance/date_match is required for URL sync.`
Change it to:
`The \`_c_\` prefix on q/bbox/geo_distance/date_match is required for URL sync — never put \`_c_\` on column filters (use nom_search, not _c_nom_search).`

On line 126, the example description ends with `Example: "nom_search=Jean&age_lte=30&_c_q=Paris"`. Append:
` (note: column filters like nom_search have no _c_ prefix; only q/bbox/geo_distance/date_match do).`

- [ ] **Step 4: Lint the changed files**

Run: `npx eslint agent-tools/_utils.ts agent-tools/dataset-data-subagent.ts && npm -w ui run lint`
Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
git add agent-tools/_utils.ts agent-tools/dataset-data-subagent.ts ui/src/composables/agent/navigation-tools.ts
git commit -m "docs(agent): forbid _c_ prefix on column filters in filter prompts"
```

---

## Task 6: Surface the response `hint` in the agent data tools (Part C)

**Files:**
- Modify: `agent-tools/search-data.ts:78-88`
- Modify: `agent-tools/aggregate-data.ts` (the `lines.push` block ~108-112)
- Modify: `agent-tools/calculate-metric.ts` (the `lines.push` block ~ filter-query section)
- Test: `tests/features/agent-tools/data-tools.unit.spec.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/features/agent-tools/data-tools.unit.spec.ts`. First confirm the existing imports include the three `formatResult` functions; if a `formatResult` is not yet imported, add it (the file already imports from these tool modules — match its existing import style). Then add:

```ts
test.describe('formatResult surfaces the API hint', () => {
  test('search_data includes the hint line when present', () => {
    const { text } = searchData.formatResult({ total: 1, results: [{ a: 1 }], hint: 'Some parameters were ignored : _c_x' }, { datasetId: 'd' } as any)
    assert.match(text, /Some parameters were ignored/)
  })
  test('search_data omits the hint line when absent', () => {
    const { text } = searchData.formatResult({ total: 1, results: [{ a: 1 }] }, { datasetId: 'd' } as any)
    assert.doesNotMatch(text, /Hint:/)
  })
  test('aggregate_data includes the hint line when present', () => {
    const { text } = aggregateData.formatResult({ total: 1, total_values: 1, total_other: 0, aggs: [], hint: 'ignored param X' }, { datasetId: 'd' } as any)
    assert.match(text, /ignored param X/)
  })
  test('calculate_metric includes the hint line when present', () => {
    const { text } = calculateMetric.formatResult({ total: 1, metric: 5, hint: 'ignored param Y' }, { datasetId: 'd', metric: 'avg', fieldKey: 'age' } as any)
    assert.match(text, /ignored param Y/)
  })
})
```

Match the import aliases (`searchData`, `aggregateData`, `calculateMetric`) to however the existing spec imports these modules; adjust names if the file already imports them differently.

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx playwright test tests/features/agent-tools/data-tools.unit.spec.ts -g "surfaces the API hint"`
Expected: FAIL — hint text not present in output.

- [ ] **Step 3: Add the hint line in `search-data.ts`**

In `agent-tools/search-data.ts`, inside `formatResult`, after the `if (filterQueryString) { ... }` block (after line 88) and before `const structuredContent`, add:

```ts
  if (data.hint) {
    lines.push('', `> Hint: ${data.hint}`)
  }
```

- [ ] **Step 4: Add the hint line in `aggregate-data.ts`**

In `agent-tools/aggregate-data.ts` `formatResult`, after the `if (filterQueryString) { lines.push(...) }` block and before `const text = lines.join('\n')`, add:

```ts
  if (data.hint) {
    lines.push('', `> Hint: ${data.hint}`)
  }
```

- [ ] **Step 5: Add the hint line in `calculate-metric.ts`**

In `agent-tools/calculate-metric.ts` `formatResult`, after the `if (filterQueryString) { lines.push(...) }` block and before the `return {` statement, add:

```ts
  if (data.hint) {
    lines.push('', `> Hint: ${data.hint}`)
  }
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx playwright test tests/features/agent-tools/data-tools.unit.spec.ts -g "surfaces the API hint"`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add agent-tools/search-data.ts agent-tools/aggregate-data.ts agent-tools/calculate-metric.ts tests/features/agent-tools/data-tools.unit.spec.ts
git commit -m "feat(agent-tools): surface the API hint in data tool results"
```

---

## Task 7: Validate `q_fields` columns (Part D #1 — 400)

**Files:**
- Modify: `api/src/datasets/es/commons.js:152`
- Test: `tests/features/datasets/schema/capabilities.api.spec.ts`

Behavior: when `q_fields` is provided, each listed column must (a) exist in the schema and (b) have at least one search-relevant capability (`text`, `textStandard`, `index`, or `wildcard` not all disabled). Otherwise the field is silently dropped from the search today.

- [ ] **Step 1: Write a failing API test**

Add to `tests/features/datasets/schema/capabilities.api.spec.ts` inside the `test.describe('Properties capabilities', ...)` block:

```ts
  test('q_fields with an unknown column errors instead of silently searching nothing', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-qfields', {
      isRest: true,
      title: 'rest-qfields',
      schema: [{ key: 'nom', type: 'string' }]
    })
    await ax.post('/api/v1/datasets/rest-qfields/_bulk_lines', [{ nom: 'Jean' }, { nom: 'Paul' }])
    await waitForFinalize(ax, 'rest-qfields')
    // valid column still works
    let res = await ax.get('/api/v1/datasets/rest-qfields/lines', { params: { q: 'Jean', q_fields: 'nom' } })
    assert.equal(res.data.total, 1)
    // unknown column → 400
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-qfields/lines', { params: { q: 'Jean', q_fields: 'nom,unknownCol' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('unknownCol'))
        return true
      }
    )
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts -g "q_fields with an unknown column"`
Expected: FAIL — request currently returns 200 (the unknown column is silently ignored).

- [ ] **Step 3: Add validation in `prepareQuery`**

In `api/src/datasets/es/commons.js`, the line at 152 resolves `qFields`:

```js
  qFields = qFields || (query.q_fields && query.q_fields.split(','))
```

Replace it with:

```js
  qFields = qFields || (query.q_fields && query.q_fields.split(','))
  if (qFields) {
    for (const qField of qFields) {
      const prop = dataset.schema.find(p => p.key === qField)
      if (!prop) throw httpError(400, `Impossible de rechercher sur le champ ${qField}, il n'existe pas dans le jeu de données.`)
      const caps = prop['x-capabilities'] || {}
      const searchable = caps.text !== false || caps.textStandard !== false || caps.index !== false || caps.wildcard === true
      if (!searchable) throw httpError(400, `Impossible de rechercher sur le champ ${qField}. Aucune fonctionnalité de recherche n'est activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
    }
  }
```

`httpError` and `columnOperationsHint` are already imported in this file (used at lines 169 and 78 respectively).

- [ ] **Step 4: Run the test to verify it passes, plus the search specs for regressions**

`prepareQuery` is shared by every data/agg endpoint, so confirm existing `q`/`q_fields` paths still pass:

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts -g "q_fields with an unknown column" tests/features/datasets/query/search-basic.api.spec.ts tests/features/datasets/query/search-advanced.api.spec.ts`
Expected: PASS (new case + no regression in existing search behavior).

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/commons.js tests/features/datasets/schema/capabilities.api.spec.ts
git commit -m "fix(es): reject q_fields referencing unknown or unsearchable columns"
```

---

## Task 8: Require text capability for `highlight` (Part D #2 — 400)

**Files:**
- Modify: `api/src/datasets/es/commons.js:227-233`
- Test: `tests/features/datasets/schema/capabilities.api.spec.ts`

Behavior: `highlight` currently checks only that the column exists (`commons.js:230`); a column with `text` and `textStandard` both disabled yields an empty highlight with no error. Require at least one of those capabilities, matching `_search` (`commons.js:366`).

- [ ] **Step 1: Write a failing API test**

Add to `tests/features/datasets/schema/capabilities.api.spec.ts`:

```ts
  test('highlight on a non-text-capable column errors instead of returning empty highlights', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-highlight', {
      isRest: true,
      title: 'rest-highlight',
      schema: [{ key: 'code', type: 'string', 'x-capabilities': { text: false, textStandard: false } }]
    })
    await ax.post('/api/v1/datasets/rest-highlight/_bulk_lines', [{ code: 'ABC' }])
    await waitForFinalize(ax, 'rest-highlight')
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-highlight/lines', { params: { q: 'ABC', highlight: 'code' } }),
      (err: any) => {
        assert.equal(err.status, 400)
        assert.ok(err.data.includes('code'))
        assert.ok(err.data.includes('Opérations disponibles sur ce champ'))
        return true
      }
    )
  })
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts -g "highlight on a non-text-capable"`
Expected: FAIL — request currently returns 200 with empty highlights.

- [ ] **Step 3: Add the capability check**

In `api/src/datasets/es/commons.js`, the highlight loop (lines 229-233) currently is:

```js
    for (const key of query.highlight.split(',')) {
      if (!fields.includes(key)) throw httpError(400, `Impossible de demander un "highlight" sur le champ ${key}, il n'existe pas dans le jeu de données.`)
      esQuery.highlight.fields[key + '.text'] = {}
      esQuery.highlight.fields[key + '.text_standard'] = {}
    }
```

Replace with:

```js
    for (const key of query.highlight.split(',')) {
      if (!fields.includes(key)) throw httpError(400, `Impossible de demander un "highlight" sur le champ ${key}, il n'existe pas dans le jeu de données.`)
      const prop = dataset.schema.find(p => p.key === key)
      const caps = (prop && prop['x-capabilities']) || {}
      if (caps.text === false && caps.textStandard === false) {
        throw httpError(400, `Impossible de demander un "highlight" sur le champ ${key}. La fonctionnalité de recherche plein texte n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(prop)}`)
      }
      esQuery.highlight.fields[key + '.text'] = {}
      esQuery.highlight.fields[key + '.text_standard'] = {}
    }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts -g "highlight on a non-text-capable"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/commons.js tests/features/datasets/schema/capabilities.api.spec.ts
git commit -m "fix(es): require text capability for highlight fields"
```

---

## Task 9: Validate `/geo_agg` metric params (Part D #3 — 400)

**Files:**
- Modify: `api/src/datasets/es/geo-agg.js:1-6,34-38`
- Test: `tests/features/datasets/schema/capabilities.api.spec.ts` (or an existing geo agg spec)

Behavior: `/geo_agg` passes `metric`/`metric_field` raw to ES (`geo-agg.js:34-37`). `/values_agg` and `/metric_agg` validate field existence, the `values` capability, and metric/type compatibility via `assertMetricAccepted`. Apply the same validation.

- [ ] **Step 1: Write a failing API test**

Add to `tests/features/datasets/schema/capabilities.api.spec.ts` (geo datasets need a geo point column; model it on existing geo fixtures — a `latlon` column with concept `http://www.w3.org/2003/01/geo/wgs84_pos#lat_long` is the standard way data-fair geolocalizes). If a geo fixture helper already exists in the suite, reuse it; otherwise:

```ts
  test('geo_agg metric_field referencing an unknown column errors', async () => {
    const ax = testUser1
    await ax.post('/api/v1/datasets/rest-geoagg', {
      isRest: true,
      title: 'rest-geoagg',
      schema: [
        { key: 'latlon', type: 'string', 'x-refersTo': 'http://www.w3.org/2003/01/geo/wgs84_pos#lat_long' },
        { key: 'val', type: 'number' }
      ]
    })
    await ax.post('/api/v1/datasets/rest-geoagg/_bulk_lines', [{ latlon: '48.85,2.35', val: 3 }, { latlon: '45.75,4.85', val: 7 }])
    await waitForFinalize(ax, 'rest-geoagg')
    // valid metric still works
    let res = await ax.get('/api/v1/datasets/rest-geoagg/geo_agg', { params: { metric: 'avg', metric_field: 'val' } })
    assert.equal(res.status, 200)
    // unknown metric_field → 400
    await assert.rejects(
      ax.get('/api/v1/datasets/rest-geoagg/geo_agg', { params: { metric: 'avg', metric_field: 'nope' } }),
      (err: any) => { assert.equal(err.status, 400); assert.ok(err.data.includes('nope')); return true }
    )
  })
```

If the geolocalization setup differs in this suite, copy the dataset shape from an existing `geo_agg` test fixture rather than inventing one.

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts -g "geo_agg metric_field"`
Expected: FAIL — unknown `metric_field` currently does not 400 (ES returns a null metric, status 200).

- [ ] **Step 3: Add imports and validation in `geo-agg.js`**

In `api/src/datasets/es/geo-agg.js`, add to the imports (after line 5):

```js
import capabilities from '../../../contract/capabilities.js'
import { columnOperationsHint } from './operations.ts'
import { assertMetricAccepted } from './metric-agg.js'
```

Then replace the metric block (lines 34-38):

```js
  if (query.metric && query.metric_field) {
    esQuery.aggs.geo.aggs.metric = {
      [query.metric]: { field: query.metric_field }
    }
  }
```

with:

```js
  if (query.metric && query.metric_field) {
    const metricField = dataset.schema.find(f => f.key === query.metric_field)
    if (!metricField) throw httpError(400, `Impossible de calculer une métrique sur le champ ${query.metric_field}, il n'existe pas dans le jeu de données.`)
    if (metricField['x-capabilities'] && metricField['x-capabilities'].values === false) {
      throw httpError(400, `Impossible de calculer une métrique sur le champ ${query.metric_field}. La fonctionnalité "${capabilities.properties.values.title}" n'est pas activée dans la configuration technique du champ. ${columnOperationsHint(metricField)}`)
    }
    assertMetricAccepted(metricField, query.metric)
    esQuery.aggs.geo.aggs.metric = {
      [query.metric]: { field: query.metric_field }
    }
  }
```

This mirrors the validation in `metric-agg.js:67-71`. `httpError` is already imported in `geo-agg.js` (line 2).

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts -g "geo_agg metric_field"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add api/src/datasets/es/geo-agg.js tests/features/datasets/schema/capabilities.api.spec.ts
git commit -m "fix(es): validate geo_agg metric/metric_field like values_agg and metric_agg"
```

---

## Task 10: Update architecture docs

**Files:**
- Modify: `docs/architecture/agent-integration-architecture.md`

- [ ] **Step 1: Document the changes**

In the filter section of `docs/architecture/agent-integration-architecture.md`, add a short subsection covering:
- The `_c_` prefix is reserved for concept filters; column filters must never use it. A `_c_`-prefixed column filter is silently dropped server-side.
- The API now returns an always-on (except `hint=false`) `hint` in the response body for silently-ignored parameters (misused `_c_` filters and unrecognized params), surfaced via `ignoredParamsAdvice` in `api/src/misc/utils/query-advice.ts`. The agent data tools (`search_data`, `aggregate_data`, `calculate_metric`) print this hint so the model can self-correct.
- `q_fields` (unknown / unsearchable column), `highlight` (non-text column), and `/geo_agg` `metric_field` (unknown / non-`values` / incompatible metric) now return 400 with `columnOperationsHint`, consistent with the rest of the data API.

Match the existing document's heading style and length conventions.

- [ ] **Step 2: Commit**

```bash
git add docs/architecture/agent-integration-architecture.md
git commit -m "docs(agent): document _c_ disambiguation, ignored-param hint, and new 400s"
```

---

## Final verification

- [ ] **Run all touched unit specs**

Run: `npx playwright test tests/features/infra/query-advice.unit.spec.ts tests/features/agent-tools/data-tools.unit.spec.ts`
Expected: PASS.

- [ ] **Run the capability API spec**

Run: `npx playwright test tests/features/datasets/schema/capabilities.api.spec.ts`
Expected: PASS.

- [ ] **Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **(Optional) end-to-end hint sanity in `search-hint.api.spec.ts`**

If desired, add one case to `tests/features/datasets/query/search-hint.api.spec.ts` asserting that a `/lines` request with `_c_<column>_eq` returns a `hint` field even without `hint=true` (auto mode, fast query), and that `hint=false` suppresses it. Run:
`npx playwright test tests/features/datasets/query/search-hint.api.spec.ts`
Expected: PASS.
