# Phase 7 — api-compat/ods + full `dataset` legacyProp drop

Sub-plan for the final phase of the express-decoupling refactor series
([master plan](2026-06-10-code-quality-refactor.md) §8.6, conventions in
[code-conventions.md](../architecture/code-conventions.md)).

Branch: `typescript-refactor10` (off master, even with the 6d merge `1b0a359f6`). One PR.
Baseline at start: `dev/type-errors-baseline.txt` = **541**.

## Context / starting facts

- `api/src/api-compat/ods/index.ts` (710 LOC) is **already TypeScript** — this is NOT a js→ts
  conversion. The 6 generated `*.peg.js` parsers + `build-parsers` pipeline are untouched.
- The existing unit spec `tests/features/datasets/compat/compat-ods.unit.spec.ts` covers only the
  **PEG parsers**, not the orchestration functions in index.ts. Those are the extraction + test target.
- Two raw `req` mutations remain in api-compat: `req.resourceType = 'datasets'` (×2, lines 49/54) and
  `req.noModifiedCache = true` (line 641, `cacheNowMiddleware`). `setReqResourceType` and
  `setReqNoModifiedCache` accessors already exist.
- `resourceType` legacyProp is raw-**set only** by api-compat → cleanly droppable once migrated.
- `dataset` legacyProp is raw-**read** in: `misc/utils/query-advice.ts` (config-free, unit-tested),
  `api-compat/ods/index.ts`, `datasets/utils/upload.ts`, `datasets/utils/outputs.ts`,
  `datasets/utils/rest.ts` (~40 reads, REST write path).
- `RequestWithRestDataset = ExpressRequest & { dataset: RestDataset, linesOwner?: Account }`
  (`api/types/dataset/index.ts:61`). rest.ts handlers read `req.dataset` typed as `RestDataset` and
  feed it into `RestDataset`-typed helpers (`collection`, `req.dataset.rest.history`, …).

User decision (2026-06-18): **full drop of the `dataset` legacyProp in this phase** (not deferred).

## Key architectural move

Moving the `dataset` accessor from `datasets/middlewares.ts` (config-coupled: imports `#config`/`#mongo`)
to the **config-free** `misc/utils/req-context.ts` solves both blockers at once:
1. config-free `query-advice.ts` can import `reqDatasetOptional` without transitively loading `#config`
   (the rule that bit `query-advice` in the post-5 fix — code-conventions §2);
2. `datasets/utils/rest.ts` can import the accessor without the require cycle that
   `datasets/middlewares.ts` would create (the same cycle that keeps `linesOwner`'s legacyProp alive).

`datasets/middlewares.ts` re-exports `setReqDataset`/`reqDataset`/`reqDatasetOptional` as a **facade**
(mirrors `permissions.ts`), so the 8 `routes/*.ts` importers stay unchanged.

rest.ts needs `RestDataset`, not `Dataset`. Add a sibling accessor `reqRestDataset` in `req-context.ts`
that returns `RestDataset` via a **single contained cast** (`datasetCtx.get(req) as RestDataset`) — casts
in accessor modules are convention-allowed. rest.ts/lines.ts/own-lines.ts use `reqRestDataset` →
zero call-site casts.

## Out of scope (documented follow-ups)

- `linesOwner` legacyProp (rest.ts raw-reads `req.linesOwner` 3×) — keep; separate cleanup.
- `_draft` legacyProp (upload.ts raw-reads `req._draft`) — keep; separate cleanup.
- The parking-lot suspected bugs (§9 items 9, 10, 11, 12, 13, etc.) — preserved bit-for-bit, not fixed here.

---

## Part A — extract `ods/operations.ts` + unit tests

Create `api/src/api-compat/ods/operations.ts`. Move **verbatim** (bodies unchanged):

- types `Aliases`, `TransformType`, `Transforms`
- `compatReqCounter` (prom-client Counter — single registration; index.ts imports it for its
  routing-level `.inc()` calls)
- `logCompatODSError`
- `completeSort`, `parseFilters`, `isoWithOffset`, `prepareResult`, `transforms`, `applyAliases`,
  `sortBuckets`, `prepareBucketResult`, `prepareEsQuery`

These import the 6 PEG parsers + `esUtils.getFilterableFields` + `httpError` + `dayjs`. (`compatReqCounter`
and `console.warn` are in-process metrics/log, not DB/ES/req I/O — acceptable in operations.ts; happy-path
unit tests don't trigger the warn.) index.ts keeps: `getCompatODS` (mongo memoize), `getRecords`,
`exports`, `iterHits`, `cacheNowMiddleware`, the router, the two resourceType `.use` middlewares, and the
route mounts — and imports the moved symbols from `./operations.ts`.

Add `tests/features/datasets/compat/compat-ods-operations.unit.spec.ts` (additions only — no edits to the
existing parser spec). Cover, with hand-built dataset/query fixtures:
- `prepareEsQuery`: plain select, `select=*`, aggregation select, `group_by` (composite + size=0 +
  deletes from/_source/sort), `order_by`, `where`/`refine` wiring into the bool query, limit/offset
  defaults (`size` default 10, `-1`→100, `rows` alias, `offset`→from).
- `applyAliases` (numberInterval / numberRanges / dateInterval / rename+delete / select transforms).
- `sortBuckets`, `prepareBucketResult` (composite vs keyed, date ranges, agg value extraction).
- `completeSort` (score / _updatedAt+_i / _i / virtual _rand tie-breakers).
- `prepareResult` (date-time formatting + agg result merge), `isoWithOffset`, `transforms.date_part`.

## Part B — api-compat accessors + drop `resourceType` legacyProp

In `api-compat/ods/index.ts`:
- `req.resourceType = 'datasets'` (×2) → `setReqResourceType(req, 'datasets')` (import from permissions
  facade or req-context). Remove the two `// @ts-ignore`.
- `cacheNowMiddleware`: `req.noModifiedCache = true` → `setReqNoModifiedCache(req, true)`.
- `(req as any).dataset` (332), `(req as any).dataset` (443), `req.dataset.schema` (462) → `reqDataset(req)`
  into a local (note line 443 wants `DatasetInternal` — see Part C typing note).

In `misc/utils/req-context.ts`: `defineReqContext<ResourceType>('resourceType')` — drop the `'resourceType'`
legacyProp arg. In `api/types/index.ts`: remove the `resourceType` member from `RequestWithResource`.

Verify empty:
```
grep -rnE "req\.resourceType *= [^=]" api/src
grep -rnE "\breq\.resourceType\b" api/src
grep -rn "(req as any)" api/src | grep resourceType
```

## Part C — drop `dataset` legacyProp

1. In `misc/utils/req-context.ts` add (config-free; `import type { Dataset, RestDataset } from '#types'`):
   ```ts
   const datasetCtx = defineReqContext<Dataset>('dataset')   // no legacyProp once readers migrated
   export const setReqDataset = datasetCtx.set
   export const reqDataset = datasetCtx.get
   export const reqDatasetOptional = datasetCtx.getOptional
   export const reqRestDataset = (req: IncomingMessage) => datasetCtx.get(req) as RestDataset
   ```
   (During development keep `legacyProp: 'dataset'` until every reader is migrated, then drop it and
   grep-verify — same-PR so the final state has no legacyProp.)
2. In `datasets/middlewares.ts`: delete the local `datasetCtx` def; re-export the facade
   `export { setReqDataset, reqDataset, reqDatasetOptional } from '../misc/utils/req-context.ts'`
   (keep `setReqDatasetFull`/`reqDatasetFull` local — datasetFull legacyProp already dropped in 6d).
3. Migrate raw readers (import the accessor from `req-context.ts` directly in datasets/utils/* to avoid
   the middlewares cycle; api-compat uses the middlewares facade it already imports from):
   - `misc/utils/query-advice.ts` → `reqDatasetOptional` (lines 42/44/83/146; keep `?.` chains).
   - `datasets/utils/upload.ts` → `reqDatasetOptional` (32/33/68, `if (req.dataset)` → `const ds = reqDatasetOptional(req); if (ds)`).
   - `datasets/utils/outputs.ts` → `reqDataset` (51/94/95). **Local var `reqDataset` at line 94 collides
     with the import** — rename the local (e.g. `reqDs`) or alias the import.
   - `datasets/utils/rest.ts` → `reqRestDataset` (~40 reads). Top-of-handler `const dataset = reqRestDataset(req)`
     then replace `req.dataset` → `dataset` within each handler. Watch the `.then()` closures that read
     `req.dataset.owner`.
   - `api-compat/ods/index.ts` → `reqDataset` (done in Part B). Line 443 wants `DatasetInternal`: assign
     `const dataset = reqDataset(req)` and cast at the few `DatasetInternal`-specific use sites, or type the
     local `as DatasetInternal` (subtype assertion, not `as any`).
4. Drop the `dataset` legacyProp (step 1). Consider removing the now-unused `dataset`/`linesOwner` members
   from `RequestWithRestDataset` — but `linesOwner` is still raw-read, so **keep the type as-is** (only the
   legacyProp dual-write goes away; the type member is harmless and still describes the contract). Decide
   during impl whether to slim it.
5. Verify empty (the three-grep gate, code-conventions §2):
   ```
   grep -rnE "req\.dataset *= [^=]" api/src
   grep -rnE "\breq\.dataset\b" api/src          # only comments may remain
   grep -rn "(req as any)" api/src | grep "\.dataset\b"
   ```

---

## Verification (Task 5)

Per the 6b/6c lessons, **execute in the main session** (subagents lack `dangerouslyDisableSandbox` for
ratchet/lint/git); a read-only review subagent is fine.

- `npm run check-types-ratchet` — must drop below 541; commit the updated `dev/type-errors-baseline.txt`.
- `npm run lint` (api workspace) — clean, zero new suppressions.
- Unit: `npx playwright test tests/features/datasets/compat/compat-ods*.unit.spec.ts` and the
  query-advice unit spec (config-free import sanity).
- API/boot (rename + cycle safety — the 6a/6b boot lesson): `npx playwright test
  tests/features/datasets/compat/compat-ods.api.spec.ts` plus one REST-lines api spec (rest.ts migration).
  These confirm the app boots with no `ERR_MODULE_NOT_FOUND` / require cycle.
- Update `docs/architecture/code-conventions.md` §2 (dataset accessor now config-free in req-context.ts +
  facade; resourceType/dataset legacyProps dropped; reqRestDataset added) and the §2 legacy-mutation table.
- Add the Phase 7 execution record to the master plan; move any newly-found suspected bugs to §9.

## DoD checklist (master plan §10)

- [ ] api-compat/ods split into index.ts (routing/shaping) + operations.ts (pure); operations unit-tested.
- [ ] api-compat req mutations gone; `resourceType` + `dataset` legacyProps dropped; three-grep gate empty for both.
- [ ] ratchet decreased; baseline file committed; lint clean; no new suppressions.
- [ ] unit + targeted api specs green (boot confirmed).
- [ ] conventions doc + master plan updated; memory updated.
