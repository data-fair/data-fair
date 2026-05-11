# Query-shape advice in overload errors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When data-fair rejects an expensive dataset read with `429 errors.exceedComputeBudget`, `504` ("requête trop longue"), or a `429` ES `circuit_breaking_exception`, append a short localized hint — derived from the failing request's own query parameters — about how to make the query cheaper (e.g. `count=false`).

**Architecture:** A new pure helper `queryAdvice(req): string` in `api/src/misc/utils/query-advice.ts` inspects `req.query` / `req.path` / `req.dataset?.schema` and returns either `''` or a ready-to-append ` <intro> : <item> ; <item>.` string built from i18n keys. Three call sites concatenate it onto the existing error message: the compute-budget `429` in `rateLimiting.middleware()` (GET only), `manageESError()` in the datasets router (status `504`/`429`), and the three ES-error catch blocks in the ODS-compat router (status `504`/`429`). No query behaviour, status codes, or content types change.

**Tech Stack:** Node.js / TypeScript, Express, the `i18n` library (`req.__()`), Playwright test runner (`unit` project for the pure helper, API project for the integration assertion). Lint = ESLint, types = `tsc` via `npm run check-types`.

---

## File structure

| File | Responsibility | Action |
| --- | --- | --- |
| `api/src/misc/utils/query-advice.ts` | the `queryAdvice(req)` helper + its rules | **create** |
| `api/i18n/messages/en.json` | EN strings: `queryAdviceIntro` + 5 advice keys under `errors` | modify |
| `api/i18n/messages/fr.json` | FR strings (same keys) | modify |
| `api/src/misc/utils/rate-limiting.ts` | append advice to the `exceedComputeBudget` 429 body (GET only) | modify |
| `api/src/datasets/router.js` | `manageESError`: append advice to `504`/`429` messages | modify |
| `api/src/api-compat/ods/index.ts` | append advice to `504`/`429` messages at the 3 `extractError` catch sites | modify |
| `tests/features/infra/query-advice.unit.spec.ts` | unit tests for the pure helper | **create** |
| `tests/features/infra/compute-budget.api.spec.ts` | extra assertions: 429 body carries/omits the count advice | modify |
| `docs/architecture/load-management.md` | note in §4 and §6 that overload errors carry query-shape advice | modify |

Notes carried into the tasks:
- The helper is shaped for the **native** dataset API (`count`, `after`, `from`, `size`, `agg_size`, `field`, `select`). ODS-compat requests use different param names (`limit`, `offset`, `group_by`, …) so most rules simply won't fire for them — acceptable for v1; the `count` rule still recognises the ODS `…/records` path.
- `req.__()` is provided by the app-wide i18n middleware and is already used right next to the compute-budget 429 (`req.__('errors.exceedComputeBudget')`), so it's safe to call inside the helper.
- `req.dataset` is **not** loaded yet when `rateLimiting.middleware()` runs (the limiter is mounted above the `:datasetId` param middleware), so the `select` rule never fires for the compute-budget 429 — only rules 1–4 do. It does fire in `manageESError` and the ODS `records` catch site, where `req.dataset` is set.

---

## Task 1: i18n keys

**Files:**
- Modify: `api/i18n/messages/en.json` (the `errors` object, near `exceedComputeBudget`)
- Modify: `api/i18n/messages/fr.json` (the `errors` object, near `exceedComputeBudget`)

- [ ] **Step 1: Add the keys to `api/i18n/messages/en.json`**

In the `"errors"` object, immediately after the `"exceedComputeBudget": ...` line, add:

```json
		"queryAdviceIntro": "Advice to optimize your queries",
		"queryAdviceCount": "set count=false (or count=estimate) to skip the exact total-row count",
		"queryAdviceDeepPagination": "use keyset pagination with the after parameter instead of large from offsets",
		"queryAdviceAggSize": "reduce agg_size and/or the number of grouped fields",
		"queryAdviceSize": "request fewer results per page (lower size)",
		"queryAdviceSelect": "use the select parameter to return only the columns you need",
```

(Mind the trailing comma on the `exceedComputeBudget` line and on the last new line — the next existing key is `exceedAnonymousRateLimiting`.)

- [ ] **Step 2: Add the keys to `api/i18n/messages/fr.json`**

In the `"errors"` object, immediately after the `"exceedComputeBudget": ...` line, add:

```json
		"queryAdviceIntro": "Conseil pour optimiser vos requêtes",
		"queryAdviceCount": "passez count=false (ou count=estimate) pour éviter le comptage exact du nombre total de lignes",
		"queryAdviceDeepPagination": "utilisez la pagination par clé via le paramètre after plutôt que de grandes valeurs de from",
		"queryAdviceAggSize": "réduisez agg_size et/ou le nombre de champs de regroupement",
		"queryAdviceSize": "demandez moins de résultats par page (réduisez size)",
		"queryAdviceSelect": "utilisez le paramètre select pour ne récupérer que les colonnes nécessaires",
```

- [ ] **Step 3: Verify the JSON still parses**

Run: `node -e "JSON.parse(require('fs').readFileSync('api/i18n/messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('api/i18n/messages/fr.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add api/i18n/messages/en.json api/i18n/messages/fr.json
git commit -m "i18n: add query-advice strings for overload errors"
```

---

## Task 2: the `queryAdvice` helper + unit tests

**Files:**
- Create: `api/src/misc/utils/query-advice.ts`
- Create (test): `tests/features/infra/query-advice.unit.spec.ts`

This task is TDD: write the failing test first.

- [ ] **Step 1: Write the failing unit test**

Create `tests/features/infra/query-advice.unit.spec.ts`:

```typescript
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { queryAdvice } from '../../../api/src/misc/utils/query-advice.ts'

// minimal fake of the bits of an express Request the helper reads.
// `__` echoes the key so assertions can match on key names instead of translated text.
const fakeReq = (path: string, query: Record<string, any> = {}, dataset?: any) => ({
  path,
  query,
  dataset,
  __: (key: string) => key
} as any)

test.describe('queryAdvice', () => {
  test('empty string when no rule applies', () => {
    assert.equal(queryAdvice(fakeReq('/abc/lines', { count: 'false' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/lines', { after: '["x"]' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/lines', { count: 'estimate' })), '')
    assert.equal(queryAdvice(fakeReq('/abc/safe-schema')), '')
  })

  test('count rule: fires on a /lines request that asks for an exact count', () => {
    const out = queryAdvice(fakeReq('/abc/lines', {}))
    assert.match(out, /errors\.queryAdviceIntro/)
    assert.match(out, /errors\.queryAdviceCount/)
  })

  test('count rule: also fires on the ODS records path', () => {
    assert.match(queryAdvice(fakeReq('/v2.1/catalog/datasets/abc/records', {})), /errors\.queryAdviceCount/)
  })

  test('count rule: does not fire outside /lines or /records', () => {
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/values_agg', { field: 'a' })), /errors\.queryAdviceCount/)
  })

  test('deepPagination rule: from >= 1000 fires, 999 does not', () => {
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', from: '1000' })), /errors\.queryAdviceDeepPagination/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', from: '999' })), /errors\.queryAdviceDeepPagination/)
  })

  test('aggSize rule: agg_size >= 100 fires', () => {
    assert.match(queryAdvice(fakeReq('/abc/values_agg', { field: 'a', agg_size: '100' })), /errors\.queryAdviceAggSize/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/values_agg', { field: 'a', agg_size: '50' })), /errors\.queryAdviceAggSize/)
  })

  test('aggSize rule: a multi-level field grouping fires even with a small agg_size', () => {
    assert.match(queryAdvice(fakeReq('/abc/values_agg', { field: 'a;b', agg_size: '10' })), /errors\.queryAdviceAggSize/)
  })

  test('size rule: size >= 1000 fires', () => {
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false', size: '1000' })), /errors\.queryAdviceSize/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', size: '999' })), /errors\.queryAdviceSize/)
  })

  test('select rule: fires only when the dataset is known, wide, and no select param', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const narrow = { schema: Array.from({ length: 5 }, (_, i) => ({ key: 'f' + i })) }
    assert.match(queryAdvice(fakeReq('/abc/lines', { count: 'false' }, wide)), /errors\.queryAdviceSelect/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false', select: 'f1,f2' }, wide)), /errors\.queryAdviceSelect/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false' }, narrow)), /errors\.queryAdviceSelect/)
    assert.doesNotMatch(queryAdvice(fakeReq('/abc/lines', { count: 'false' })), /errors\.queryAdviceSelect/)
  })

  test('multiple rules combine, count first', () => {
    const wide = { schema: Array.from({ length: 25 }, (_, i) => ({ key: 'f' + i })) }
    const out = queryAdvice(fakeReq('/abc/lines', { from: '5000', size: '2000' }, wide))
    assert.match(out, /errors\.queryAdviceCount/)
    assert.match(out, /errors\.queryAdviceDeepPagination/)
    assert.match(out, /errors\.queryAdviceSize/)
    assert.match(out, /errors\.queryAdviceSelect/)
    assert.ok(out.indexOf('errors.queryAdviceCount') < out.indexOf('errors.queryAdviceDeepPagination'))
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx playwright test --project=unit query-advice.unit.spec.ts`
Expected: FAIL — `Cannot find module '.../api/src/misc/utils/query-advice.ts'` (or similar).

- [ ] **Step 3: Implement the helper**

Create `api/src/misc/utils/query-advice.ts`:

```typescript
import { type Request } from 'express'

// Builds a short, localized, advisory sentence appended to overload errors (429 compute-budget,
// 504 "request too long", 429 ES circuit_breaking_exception). It only ever *advises* — it never
// changes the query. Shaped for the native dataset API query params; ODS-compat requests use
// different param names so most rules just don't fire for them (the `count` rule still recognises
// the `.../records` path). See docs/superpowers/specs/2026-05-11-query-shape-advice-in-overload-errors-design.md
// and docs/architecture/load-management.md.

const num = (v: any): number => {
  const n = parseInt(String(v ?? ''), 10)
  return Number.isFinite(n) ? n : NaN
}

// the native /values_agg `field` (and `agg_size`) params separate nested levels with ; or ,
const nbLevels = (v: any): number => v ? String(v).split(/[;,]/).filter(Boolean).length : 0

const isLinesOrRecords = (path: string): boolean => /\/(lines|records)\/?$/.test(path)

/**
 * Returns either '' or ' <intro> : <item> ; <item>.' assembled from i18n keys (via `req.__`).
 * Safe to concatenate onto any error message — '' when nothing useful applies.
 */
export const queryAdvice = (req: Request & { dataset?: { schema?: any[] } }): string => {
  const q: Record<string, any> = req.query || {}
  const keys: string[] = []

  // 1. exact total-hits count on a list endpoint
  if (isLinesOrRecords(req.path) && q.count !== 'false' && q.count !== 'estimate' && !q.after) {
    keys.push('errors.queryAdviceCount')
  }
  // 2. deep offset pagination
  if (num(q.from) >= 1000) keys.push('errors.queryAdviceDeepPagination')
  // 3. large aggregation fan-out
  if (num(q.agg_size) >= 100 || nbLevels(q.field) > 1) keys.push('errors.queryAdviceAggSize')
  // 4. large page size
  if (num(q.size) >= 1000) keys.push('errors.queryAdviceSize')
  // 5. wide dataset fetched without a select (only when the dataset is loaded on the request)
  if ((req.dataset?.schema?.length ?? 0) > 20 && !q.select) keys.push('errors.queryAdviceSelect')

  if (keys.length === 0) return ''
  return ' ' + req.__('errors.queryAdviceIntro') + ' : ' + keys.map(k => req.__(k)).join(' ; ') + '.'
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx playwright test --project=unit query-advice.unit.spec.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Type-check**

Run: `npm run check-types`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add api/src/misc/utils/query-advice.ts tests/features/infra/query-advice.unit.spec.ts
git commit -m "feat: queryAdvice helper for overload error messages"
```

---

## Task 3: append advice to the compute-budget 429 (rate-limiting middleware)

**Files:**
- Modify: `api/src/misc/utils/rate-limiting.ts` (the `exceedComputeBudget` branch in `middleware()`)
- Modify (test): `tests/features/infra/compute-budget.api.spec.ts`

TDD: extend the existing API spec first.

- [ ] **Step 1: Add the failing assertions to `tests/features/infra/compute-budget.api.spec.ts`**

In `test('an Elasticsearch query exhausts the budget and the next request is rejected with 429', ...)`, replace the final block (from `// second /lines call:` onward) with:

```typescript
    // second call hits a /lines endpoint asking for an exact count -> 429 + the count advice
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines`, { validateStatus: () => true })
    assert.equal(res.status, 429)
    assert.match(String(res.data), /traitement|processing/) // the base exceedComputeBudget message
    assert.match(String(res.data), /count=false|count=estimate/) // the appended query advice
```

Then add a new test right after it, inside the same `describe`:

```typescript
  test('the appended advice reflects the request: no count advice when count=false is already set', async () => {
    const ax = testUser1
    const dataset = await sendDataset('datasets/dataset1.csv', ax)
    await clearRateLimiting()

    let res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?count=false`)
    assert.equal(res.status, 200)
    await sleep(300)

    // budget spent -> still 429, still the base message, but no "count=false" advice this time
    res = await ax.get(`/api/v1/datasets/${dataset.id}/lines?count=false`, { validateStatus: () => true })
    assert.equal(res.status, 429)
    assert.match(String(res.data), /traitement|processing/)
    assert.doesNotMatch(String(res.data), /count=false|count=estimate/)
  })
```

- [ ] **Step 2: Run the spec to verify the new assertions fail**

Run: `npx playwright test compute-budget.api.spec.ts`
Expected: the count-advice assertions FAIL (the 429 body is currently just the base message). The pre-existing assertions still pass.

- [ ] **Step 3: Wire `queryAdvice` into the middleware**

In `api/src/misc/utils/rate-limiting.ts`:

Add the import near the top, next to the existing `import { ComputeBucket } from './compute-budget.ts'`:

```typescript
import { queryAdvice } from './query-advice.ts'
```

Then change the `exceedComputeBudget` branch in `middleware()` from:

```typescript
  if (!ignoreRateLimiting && !hasComputeBudget(req, limitType)) {
    debugLimits('exceedComputeBudget', limitType, user, requestIp.getClientIp(req))
    computeBudgetExceededCounter.labels(limitType).inc()
    return res.status(429).type('text/plain').send(req.__('errors.exceedComputeBudget'))
  }
```

to:

```typescript
  if (!ignoreRateLimiting && !hasComputeBudget(req, limitType)) {
    debugLimits('exceedComputeBudget', limitType, user, requestIp.getClientIp(req))
    computeBudgetExceededCounter.labels(limitType).inc()
    // GET only: the compute bucket can also block a write request from a client that previously did
    // heavy reads, where query-shape advice would be off-context. req.dataset isn't loaded at this
    // mount point, so the select rule never fires here — rules 1–4 work off req.query/req.path.
    const advice = req.method === 'GET' ? queryAdvice(req) : ''
    return res.status(429).type('text/plain').send(req.__('errors.exceedComputeBudget') + advice)
  }
```

- [ ] **Step 4: Run the spec to verify it passes**

Run: `npx playwright test compute-budget.api.spec.ts`
Expected: PASS (all tests, old and new).

- [ ] **Step 5: Lint + type-check**

Run: `npm run lint && npm run check-types`
Expected: clean.

- [ ] **Step 6: Commit**

```bash
git add api/src/misc/utils/rate-limiting.ts tests/features/infra/compute-budget.api.spec.ts
git commit -m "feat: append query advice to the compute-budget 429 response"
```

---

## Task 4: append advice to ES-error 504 / circuit-breaker 429 responses

**Files:**
- Modify: `api/src/datasets/router.js` (`manageESError`)
- Modify: `api/src/api-compat/ods/index.ts` (the 3 `esUtils.extractError(err)` catch blocks)

No new automated test — a real `504`/circuit-break is impractical to trigger reliably in the suite; the `queryAdvice` behaviour is covered by Task 2's unit tests and Task 3's integration assertions, and this task only changes the string that's already being thrown. Verify by reading the diff.

- [ ] **Step 1: Import the helper in `api/src/datasets/router.js`**

Find the existing `esUtils` import (e.g. `import * as esUtils from './es/index.ts'` or similar near the top) and add, alongside the other `misc/utils` imports in that file:

```javascript
import { queryAdvice } from '../misc/utils/query-advice.ts'
```

(Match the import style already used in the file — if it uses `require`, use `require('../misc/utils/query-advice.ts')`. Check the surrounding imports first.)

- [ ] **Step 2: Append advice in `manageESError`**

In `api/src/datasets/router.js`, change the end of `manageESError(req, err)` from:

```javascript
  throw httpError(status, message)
}
```

to:

```javascript
  // on overload-symptom statuses, hint at how to make the query cheaper (no-op when no rule applies)
  const finalMessage = (status === 504 || status === 429) ? message + queryAdvice(req) : message
  throw httpError(status, finalMessage)
}
```

- [ ] **Step 3: Import the helper in `api/src/api-compat/ods/index.ts`**

Add, alongside the existing `esUtils` import in that file:

```typescript
import { queryAdvice } from '../../misc/utils/query-advice.ts'
```

(Adjust the relative path if the file's location differs; `api/src/api-compat/ods/index.ts` → `../../misc/utils/query-advice.ts`. Match the file's import style.)

- [ ] **Step 4: Append advice at the 3 catch sites in `api/src/api-compat/ods/index.ts`**

There are three `catch (err) { const { message, status } = esUtils.extractError(err); ... throw httpError(status, message) }` blocks (the `records` handler, the `exports` xlsx branch, the `exports` stream branch). In each, change the final throw from:

```typescript
    throw httpError(status, message)
```

to:

```typescript
    throw httpError(status, (status === 504 || status === 429) ? message + queryAdvice(req) : message)
```

Leave the `logCompatODSError(...)` / `status !== 499` lines in each block unchanged.

- [ ] **Step 5: Lint + type-check**

Run: `npm run lint && npm run check-types`
Expected: clean.

- [ ] **Step 6: Sanity-check the existing ES-error unit spec still passes**

Run: `npx playwright test es-error.unit.spec.ts`
Expected: PASS (this task doesn't touch `extractError`, but confirm nothing regressed).

- [ ] **Step 7: Commit**

```bash
git add api/src/datasets/router.js api/src/api-compat/ods/index.ts
git commit -m "feat: append query advice to 504 / circuit-breaker ES error responses"
```

---

## Task 5: documentation

**Files:**
- Modify: `docs/architecture/load-management.md`

- [ ] **Step 1: Note it in §4 (compute budget)**

At the end of the "Time-weighted ('compute budget') limiting" subsection in `docs/architecture/load-management.md`, add a sentence:

```markdown
The `429 errors.exceedComputeBudget` body (for `GET` requests) carries an appended, localized
*query-shape advice* sentence derived from the request's own parameters (`queryAdvice`,
`api/src/misc/utils/query-advice.ts`) — e.g. "set `count=false`/`count=estimate`", "use keyset
pagination via `after`", "reduce `agg_size`", "lower `size`" — so a throttled client is told what to
change, not just that it was throttled.
```

- [ ] **Step 2: Note it in §6 (error handling)**

In the "Error handling (`es/operations.ts`)" subsection, after the sentence describing the `504` /
`circuit_breaking_exception` mappings, add:

```markdown
For status `504` and `429`, `manageESError` (and the equivalent ODS-compat catch blocks) append the
same `queryAdvice(req)` hint (see §4) to the message before it is returned.
```

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/load-management.md
git commit -m "docs: note query-shape advice in load-management.md"
```

---

## Task 6: final verification

- [ ] **Step 1: Run the touched specs together**

Run: `npx playwright test --project=unit query-advice.unit.spec.ts && npx playwright test compute-budget.api.spec.ts es-error.unit.spec.ts`
Expected: all PASS.

- [ ] **Step 2: Lint + type-check the whole repo**

Run: `npm run lint && npm run check-types`
Expected: clean.

- [ ] **Step 3: Report**

Summarise what changed (the helper, the three call sites, i18n keys, tests, docs) and note the known limitation (helper is native-API-shaped; ODS-compat requests only get the `count` rule). The full test suite runs on push via the husky hook.

---

## Self-review notes

- **Spec coverage:** helper + rules → Task 2; i18n keys → Task 1; compute-budget 429 wiring (+GET guard) → Task 3; `manageESError` 504/429 wiring → Task 4 (router.js); ODS-compat 3 catch sites → Task 4 (ods/index.ts); unit spec → Task 2; compute-budget api spec assertions → Task 3; load-management.md §4 & §6 → Task 5. All spec sections mapped.
- **Placeholders:** none — every code step shows the code; the only "check the surrounding import style" notes are genuine (the two JS/TS files may use `import` or `require`) and don't hide logic.
- **Type/name consistency:** the helper is `queryAdvice` everywhere; i18n keys `errors.queryAdviceIntro` / `errors.queryAdviceCount` / `…DeepPagination` / `…AggSize` / `…Size` / `…Select` match between Task 1 (json), Task 2 (helper + test regexes), and Task 3 (test regexes match the *translated* text `count=false`/`count=estimate`, which the EN/FR strings in Task 1 both contain).
