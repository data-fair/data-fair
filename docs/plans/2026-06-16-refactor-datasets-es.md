# Phase 6a — datasets/es (js→ts, mechanical conversion)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Expands the **6a** slice of the Phase 6 brief in the [master plan](2026-06-10-code-quality-refactor.md §8.5).
> Follows [code-conventions.md](../architecture/code-conventions.md). Phase 6 (datasets) is the bulk of
> the refactor, sliced 6a→6d, **one PR each**; this doc covers **6a only**.

**Goal:** Convert every remaining `.js` file in `api/src/datasets/es/` to TypeScript with **zero
behavior change**, removing the directory's single `@ts-ignore`, with the API/e2e test contract
untouched and the type-error ratchet dropping.

**Architecture:** This slice is a **mechanical js→ts conversion**, modelled on Phase 5b: function
bodies move **verbatim**, only type annotations are added and implicit-any / missing-property errors
cleared. No functions are relocated between files (the commons.js → operations.ts "consolidation" the
brief mentions is held to a conservative review — see Task 5 — because the deeper commons query-builder
redesign is already parked at master-plan §9.4). The one genuine decoupling is the `esAbortContext`
request property, which gets a module-local symbol accessor in `abort.ts` (legacyProp dual-write,
dropped in 6d).

**Tech Stack:** Node 24, Express 5, TypeScript strict + checkJs, `@data-fair/lib-*`, df-build-types,
Playwright (unit + api). Ratchet: `npm run check-types-ratchet` (baseline currently **1342**).

**Size estimate:** L. Master-plan expected tsc delta ≈ **−274** (concentrated in `commons.js` 73,
`values-agg.js` 69, `geo-agg.js`, `metric-agg.js`, `manage-indices.js`, `index-stream.js`). One
worktree (current branch `refactor-typescript5`), one PR, ~4 commits. Branch is even with master.

---

## 0. Scope & inventory

`api/src/datasets/es/` is **19 files** today: 6 already `.ts`
(`operations.ts`, `diagnose-warnings.ts`, `index-name.ts`, `iter-hits.ts`, `search.ts`, `index.ts`
barrel) and **13 `.js` to convert**:

| File | LOC | es-internal imports | Notes |
|---|---|---|---|
| `abort.js` | 83 | — | sets `req.esAbortContext` (the 1 `@ts-ignore`, line 56); exports `createEsRequestOptions`, `timedEsCall` |
| `index-stream.js` | 166 | — | `IndexStream` Transform class; imported directly by `rest.ts`, `index-lines.ts` |
| `commons.js` | 649 | `operations.ts` | **core** query build / result serialize; re-exports from operations.ts |
| `count.js` | 10 | `commons`, `abort` | |
| `multi-search.js` | 16 | `commons`, `abort` | |
| `values.js` | 54 | `commons`, `abort` | |
| `small-aggs.js` | 45 | `commons`, `abort` | exports `max`, `min` |
| `bbox-agg.js` | 30 | `commons`, `abort` | |
| `words-agg.js` | 104 | `commons`, `abort`, `operations` | |
| `metric-agg.js` | 154 | `commons`, `abort`, `operations` | exports `acceptedMetricAggs`, `assertMetricAccepted`, `agg`, `simpleMetricsAgg` |
| `geo-agg.js` | 76 | `commons`, `abort`, `operations`, `metric-agg` | |
| `values-agg.js` | 281 | `commons`, `abort`, `operations`, `metric-agg` | |
| `manage-indices.js` | 303 | `commons`, `operations`, `diagnose-warnings` | imported directly by `service.js`, `rest.ts` |

**No circular imports.** Conversion proceeds leaf→root in three batches (A/B/C).

### Import-specifier ripple

When a file `X.js` is renamed to `X.ts`, every import specifier referencing it must change
`'…/X.js'` → `'…/X.ts'`. Specifiers live in:
- the barrel `es/index.ts` (`export … from './X.js'`),
- sibling `es/*` files (still `.js` mid-conversion — a `.js` file importing a `.ts` file is fine),
- **direct cross-module importers** (grep-verified, these are the only ones bypassing the barrel):
  - `api/src/datasets/service.js:11` → `./es/manage-indices.js`
  - `api/src/datasets/utils/rest.ts:30-32` → `../es/commons.js`, `../es/index-stream.js`, `../es/manage-indices.js`
  - `api/src/workers/batch-processor/index-lines.ts:8` → `../../datasets/es/index-stream.js`

The barrel itself is imported as `'../es/index.ts'` everywhere already (router.js, ods, storage,
master-data, index-lines, rest) — **the barrel path does not change**, so no churn beyond the three
direct importers above.

### Conversion rules (apply to every file)

1. **Bodies verbatim.** Only add type annotations. No logic, ordering, or control-flow change.
2. **No new suppressions.** Zero new `@ts-ignore`/`@ts-expect-error`/`as any`. The existing `abort.js`
   `@ts-ignore` is *removed* (Task 1), not preserved.
3. **JSDoc `@typedef`/`@param`/`@returns` → TS.** Convert `@typedef {Object} Foo` blocks to
   `interface`/`type`; drop now-redundant `@param`/`@returns` JSDoc (a converted-file cosmetic that 5b
   deferred — here, drop them as you annotate to keep files clean). Keep narrative JSDoc comments.
4. **Types from `#types` / schema, never casts.** TS2339 "missing property" on a `Dataset`/schema type
   is fixed by enriching the schema (`api/types/*` via df-build-types) or importing the right type —
   **not** by `as any`. If a genuine schema gap appears, record it in master-plan §9 and use the
   narrowest honest type; do not invent a suppression.
5. **ES client typing.** Untyped `client.search(...)` responses may be typed `any` *through the
   existing pattern already in `search.ts`/`operations.ts`* (look at how those files type
   transport/responses and mirror it). Prefer `@elastic/elasticsearch` types where they apply cleanly;
   do not fight the client's generics — a local response `type` mirroring the fields actually read is
   acceptable and is **not** a suppression.
6. **Run the ratchet after every batch** — it may only decrease.

---

## Task 1 — `abort.js` → `abort.ts` + `esAbortContext` accessor (Batch A, part 1)

**Files:**
- Rename: `api/src/datasets/es/abort.js` → `abort.ts`
- Modify: `api/src/datasets/es/index.ts` (barrel specifier)
- Modify: `api/src/misc/utils/rate-limiting.ts:218` (migrate the one reader)

`esAbortContext` is a request-context property (master-plan §2 legacy table). It is set in `abort.js`
and read in two places: `rate-limiting.ts:218` and `datasets/router.js` (lines 734/741). Give it a
**module-local accessor** (conventions §2 — accessors sit next to the middleware/factory that sets
them; `abort.ts` is config-coupled but `rate-limiting.ts`, its only non-router reader, is not
pure/unit-tested, so a config-free home is not required). `legacyProp` dual-write keeps
`datasets/router.js`'s `req.esAbortContext` reads working until 6d drops the legacyProp.

- [ ] **Step 1: Rename and add the accessor.** Convert the `@typedef EsAbortContext` to an exported
  `interface`/`type`. Add, near the top:

```ts
import { defineReqContext } from '../../misc/utils/req-context.ts'

export interface EsAbortContext {
  /** pass it (with requestTimeout) as the options arg of an ES client call */
  signal: AbortSignal
  /** per-request client timeout; equals the ES search `timeout` parameter */
  requestTimeout: string | number
  /** cumulated wall-clock ms of the ES calls made for this request (compute-budget rate limiter) */
  esElapsedMs: number
}

const esAbortContext = defineReqContext<EsAbortContext>('esAbortContext', 'esAbortContext')
export const setReqEsAbortContext = esAbortContext.set
export const reqEsAbortContext = esAbortContext.get
export const reqEsAbortContextOptional = esAbortContext.getOptional
```

  In `createEsRequestOptions(req, res)`: keep the body verbatim **except** replace the
  `// @ts-ignore` + `req.esAbortContext = abortContext` (lines 56-57) with
  `setReqEsAbortContext(req, abortContext)`. Type the params
  `(req: ExpressRequest, res: ExpressResponse)` (`import type { Request as ExpressRequest, Response as ExpressResponse } from 'express'`).
  Type `timedEsCall<T>(abortContext: EsAbortContext | undefined, fn: () => Promise<T>): Promise<T>`.

- [ ] **Step 2: Update the barrel** — `es/index.ts:2`
  `export { createEsRequestOptions, type EsAbortContext } from './abort.js'` →
  `from './abort.ts'`. **Also export the accessors** the router will need in 6d (export now so the
  symbol home is stable):
  `export { createEsRequestOptions, setReqEsAbortContext, reqEsAbortContext, reqEsAbortContextOptional, type EsAbortContext } from './abort.ts'`.

- [ ] **Step 3: Migrate the `rate-limiting.ts` reader** — line 218
  `const esElapsedMs = req.esAbortContext?.esElapsedMs` →
  `const esElapsedMs = reqEsAbortContextOptional(req)?.esElapsedMs`, importing
  `import { reqEsAbortContextOptional } from '../../datasets/es/abort.ts'`. (Update the line-89 comment's
  `req.esAbortContext` reference to match if convenient.) `datasets/router.js`'s `req.esAbortContext`
  reads keep working via the legacyProp dual-write — leave them for 6d.

- [ ] **Step 4: Ratchet + lint** — `npm run check-types-ratchet` (not worse — should drop the abort
  `@ts-ignore` and the rate-limiting TS2339); `npx eslint api/src/datasets/es/abort.ts api/src/misc/utils/rate-limiting.ts` clean.
- [ ] **Step 5: Run the rate-limit unit spec if one exists** — `npx playwright test tests/features --grep -i "rate" ` (skip if none; the api specs in later steps cover the path).
- [ ] **Step 6: Commit** — `refactor(datasets/es): abort.js→ts with esAbortContext accessor`

---

## Task 2 — `index-stream.js` + `commons.js` → `.ts` (Batch A, part 2)

**Files:**
- Rename: `api/src/datasets/es/index-stream.js` → `index-stream.ts`
- Rename: `api/src/datasets/es/commons.js` → `commons.ts`
- Modify specifiers: `es/index.ts`; `datasets/utils/rest.ts:30-31`; `workers/batch-processor/index-lines.ts:8`

These two are leaves (commons imports only `operations.ts`; index-stream imports nothing internal) and
are imported directly across modules, so convert them together and fix all specifiers in one commit.

- [ ] **Step 1: Convert `index-stream.ts`** — bodies verbatim, type the `Transform` subclass and its
  `_transform`/`_flush` signatures (mirror any existing typed stream in the repo, e.g.
  `misc/utils/streams.ts` from Phase 5b). Type the default export (`getIndexStream`/`IndexStream`) and
  its params (`dataset: Dataset`, etc. — import from `#types`).

- [ ] **Step 2: Convert `commons.ts`** — bodies verbatim. Annotate the exported query-builders
  (`aliasName`, `parseSort`, `esProperty`, `prepareQuery`, `prepareResultItem`, `prepareResultContext`,
  `getQueryBBOX`) and keep the re-exports from `operations.ts`
  (`Q_SEARCH_FIELDS_THRESHOLD`, `hasCapability`, `requiredCapability`, `getColumnFilters`) — update the
  `from './operations.js'`/`.ts` specifier as needed (operations is already `.ts`). Where a request
  query object is read, type it `Record<string, string>` / the existing query type used in
  `operations.ts`; where a `Dataset` field is read, import `Dataset` from `#types`. **Do not** move any
  function out of commons in this task (consolidation is Task 5).

- [ ] **Step 3: Update specifiers**:
  - `es/index.ts:1` `export * from './commons.js'` → `'./commons.ts'`;
    line 12 / wherever `index-stream` is barrelled → `.ts`.
  - Every sibling `es/*.js` still importing `'./commons.js'` → `'./commons.ts'` (grep
    `grep -rn "commons.js" api/src/datasets/es`); they may still be `.js`, that's fine.
  - `datasets/utils/rest.ts:30` `'../es/commons.js'` → `'../es/commons.ts'`;
    `:31` `'../es/index-stream.js'` → `'../es/index-stream.ts'`.
  - `workers/batch-processor/index-lines.ts:8` `'../../datasets/es/index-stream.js'` → `.ts`.

- [ ] **Step 4: Ratchet + lint** — ratchet drops materially (commons ~73); eslint clean on both files
  + the touched importers.
- [ ] **Step 5: Run a representative datasets api spec** — `npx playwright test tests/features/datasets/query/search-basic.api.spec.ts tests/features/datasets/query/search-advanced.api.spec.ts` (exercise `prepareQuery`/`prepareResultItem`) → PASS. If dev infra is down locally, rely on husky at push and record that here.
- [ ] **Step 6: Commit** — `refactor(datasets/es): commons.js + index-stream.js → ts`

---

## Task 3 — mid-layer aggregators → `.ts` (Batch B)

**Files (rename each `.js`→`.ts`, update barrel specifiers):**
`count.js`, `multi-search.js`, `values.js`, `small-aggs.js`, `bbox-agg.js`, `words-agg.js`,
`metric-agg.js`.

All import `commons` (+ `abort`, and `words-agg`/`metric-agg` import `operations`). Bodies verbatim,
annotations only.

- [ ] **Step 1: Convert the seven files** — for each: rename, add type annotations to the default/named
  exports and their params (`dataset: Dataset`, `query: Record<string, string>`, the
  `abortContext?: EsAbortContext` param — import the type from `./abort.ts`), type the ES response
  shape locally where read. Keep `metric-agg`'s named exports
  (`acceptedMetricAggs`, `assertMetricAccepted`, `agg`, `simpleMetricsAgg`) and `small-aggs`'s
  `max`/`min` stable (the barrel + `geo-agg`/`values-agg` depend on them).

- [ ] **Step 2: Update specifiers** — in `es/index.ts` flip these seven from `.js`→`.ts`; in any
  sibling still importing them with `.js`, flip to `.ts`
  (`grep -rn -E "(count|multi-search|values|small-aggs|bbox-agg|words-agg|metric-agg)\.js" api/src`).

- [ ] **Step 3: Ratchet + lint** — ratchet drops; eslint clean on all seven.
- [ ] **Step 4: Run agg api specs** — `npx playwright test tests/features/datasets/query/values-agg.api.spec.ts tests/features/datasets/query/search-wide.api.spec.ts` → PASS. Record if infra down.
- [ ] **Step 5: Commit** — `refactor(datasets/es): mid-layer aggregators → ts`

---

## Task 4 — top-layer → `.ts` (Batch C)

**Files (rename `.js`→`.ts`, update specifiers):** `geo-agg.js`, `values-agg.js`, `manage-indices.js`.

`geo-agg`/`values-agg` import `metric-agg` (now `.ts` from Task 3); `manage-indices` imports
`commons`/`operations`/`diagnose-warnings` (all `.ts`). `manage-indices` is imported directly by
`service.js` and `rest.ts`.

- [ ] **Step 1: Convert the three files** — bodies verbatim, annotations only. `values-agg` (281 LOC,
  69 errors) is the heaviest: type the nested-aggregation builder's recursion params and the
  group/metric/extra_metric structures; keep the default export signature
  (`(dataset, query, …, abortContext)`) byte-identical to the current call sites in `router.js`/`ods`.
  `manage-indices`: type `indexDefinition`, `indexPrefix`, `initDatasetIndex`, `updateDatasetMapping`,
  `deleteIndex`, `switchAlias`, `validateDraftAlias`, `datasetInfos`, `datasetWarning` (these are the
  exports `service.js`/`rest.ts` consume — keep names stable).

- [ ] **Step 2: Update specifiers**:
  - `es/index.ts` — flip `geo-agg`, `values-agg` (and any `small-aggs`/`metric-agg` already done)
    barrel specifiers to `.ts`.
  - `datasets/service.js:11` `'./es/manage-indices.js'` → `'./es/manage-indices.ts'`.
  - `datasets/utils/rest.ts:32` `'../es/manage-indices.js'` → `'../es/manage-indices.ts'`.
  - any remaining sibling specifiers (`grep -rn -E "(geo-agg|values-agg|manage-indices)\.js" api/src`).

- [ ] **Step 3: Verify the directory is 100% TS** — `ls api/src/datasets/es/*.js` returns nothing;
  `grep -rn "es/.*\.js['\"]" api/src` returns no `datasets/es/*.js` specifiers.
- [ ] **Step 4: Ratchet + lint** — ratchet drops; `npx eslint api/src/datasets/es` clean.
- [ ] **Step 5: Run the index-lifecycle + geo/values api specs** — `npx playwright test tests/features/datasets/query tests/features/datasets/rest tests/features/datasets/diagnose-realtime.api.spec.ts` (rest + diagnose exercise `manage-indices`; query covers values/geo aggs) → PASS. Record if infra down.
- [ ] **Step 6: Commit** — `refactor(datasets/es): top-layer aggregators + manage-indices → ts`

---

## Task 5 — consolidation review (conservative) + close-out

**Files:**
- Possibly modify: `api/src/datasets/es/commons.ts` / `operations.ts` (only if a clean pure move exists)
- Modify: `dev/type-errors-baseline.txt` (auto-updated by ratchet)
- Modify: `docs/plans/2026-06-10-code-quality-refactor.md` (execution record + parking lot)
- Modify: this file (record actual size/effort)

- [ ] **Step 1: Consolidation review.** The brief mentions "consolidate pure query-building into
  `operations.ts`." Hold this to a **conservative** bar: move a helper from `commons.ts` to
  `operations.ts` **only if** it is genuinely pure (no `#config`, no ES client, no I/O), self-contained,
  and the move is verbatim. If any candidate is entangled with config or result-shaping, **leave it**
  and record it under master-plan §9.4 (the parked commons redesign) instead. The 4 unit specs import
  `operations.ts` by stable export names — if you move a function there, add it to the barrel-equivalent
  exports and **do not** rename existing exports. Most likely outcome: **no moves** (commons already
  delegates capability/mapping logic to operations.ts). Record the decision either way.

- [ ] **Step 2: Confirm unit specs green** — the 6 specs importing `es/operations.ts` /
  `es/index-name.ts` / `es/diagnose-warnings.ts` have **unchanged import paths** (those files were
  already `.ts`); run them:
  `npx playwright test tests/features/datasets/query/index-definition.unit.spec.ts tests/features/datasets/query/q-fields.unit.spec.ts tests/features/datasets/es/column-operations.unit.spec.ts tests/features/admin/parse-index-name.unit.spec.ts tests/features/datasets/diagnose-warnings.unit.spec.ts tests/features/infra/es-error.unit.spec.ts` → PASS.

- [ ] **Step 3: Full ratchet + lint sweep** — `npm run check-types-ratchet` (commit the updated
  `dev/type-errors-baseline.txt`); `npm run lint`. Confirm `grep -rn "@ts-ignore\|@ts-expect-error\|as any" api/src/datasets/es` returns **0**.

- [ ] **Step 4: Update the master plan** — append a "Phase 6a execution record" to
  `docs/plans/2026-06-10-code-quality-refactor.md` (commits, baseline delta, LOC, files converted, the
  consolidation decision). Add to §9 parking lot any suspected bug found while moving (preserved
  bit-for-bit, never fixed inline) and the `esAbortContext` legacyProp note (dropped in 6d). Record
  actual size/effort in this doc.

- [ ] **Step 5: Commit** — `refactor(datasets/es): phase 6a close-out`
- [ ] **Step 6: Push** (husky runs full `npm run quality`). Open the PR.

---

## Definition of done (per master plan §10)

- [ ] All 13 `datasets/es/*.js` converted to `.ts`; directory is **100% TypeScript** (`ls es/*.js`
      empty).
- [ ] API/e2e specs **untouched** and green; unit specs: **import paths unchanged** (the tested files
      were already `.ts`), assertions unchanged.
- [ ] `npm run check-types-ratchet` improved (target ≈ −274); `dev/type-errors-baseline.txt` committed.
- [ ] **0 suppressions** in `datasets/es/` (was 1 — the `abort.js` `@ts-ignore`); no new
      `as any`/`@ts-ignore`/`@ts-expect-error`.
- [ ] `esAbortContext` accessor (`setReqEsAbortContext`/`reqEsAbortContext`/`reqEsAbortContextOptional`)
      lives in `abort.ts` with `legacyProp` dual-write; the `rate-limiting.ts` reader migrated; the
      `router.js` readers left for 6d (legacyProp retained).
- [ ] Barrel `es/index.ts` exports unchanged in **shape** (only `.js`→`.ts` specifiers + the new
      accessor exports); every external importer (`router.js`, `ods`, `storage`, `master-data`,
      `index-lines`, `rest`, `service.js`) still resolves.
- [ ] Function bodies moved **verbatim** — no behavior change. Any suspected bug recorded in §9, not
      fixed.
- [ ] Master plan §8.5/§9 updated; this doc records actual size/effort.
