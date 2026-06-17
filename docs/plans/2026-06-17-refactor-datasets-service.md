# Phase 6c — datasets service + middlewares → TypeScript

Sub-plan of the [master plan](2026-06-10-code-quality-refactor.md) §8.5. Branch `refactor-typescript8`
(worktree `data-fair_refactor-typescript8`), off master @ `f03dfcc17` (6b merged, baseline **946**).

## Scope

Two files, both already small and (for `service.js`) already express-free:

| File | LOC | tsc errors today | After |
|---|---|---|---|
| `api/src/datasets/service.js` | 670 | ~40 | `service.ts`, ~0 |
| `api/src/datasets/middlewares.js` | 126 | ~9 | `middlewares.ts`, ~0, accessors |

Total 49 errors in these files today (root `tsc`, `checkJs:true`). Target ratchet **946 → ~900**.

**Not in scope:** `router.js` (6d), `datasets/utils/*` (done 6a/6b), the 213 `req.dataset` readers
(almost all in router.js — they keep reading the `legacyProp` until 6d).

## Conversion: `service.js` → `service.ts`

Mechanical js→ts. The file takes explicit params (no `req`), so no decoupling needed — only typing:
- Type the implicit-any params (TS7006): `findDatasets`/`getDataset`/`getDatasetFresh`/`createDataset`/
  `applyPatch`/`syncApplications`/`validateDraft` params from the existing JSDoc (already accurate).
- Type the ad-hoc local objects (TS7053/TS2339): `explain`, `options` (`{ catalogMode?: boolean }`),
  `response`, `sort`, `mongoPatch`, `unset`, `filePatch`, the `i18n` reduce accumulator
  (`Record<Locale, Record<string,string>>`), projection objects.
- The few TS2345 (`WithId<Document>` vs `VirtualDataset`, `{type:string}` vs `Event`) — minimal local
  casts/annotations consistent with how 6a/6b handled mongo `Document` → domain type at call edges.
  Prefer typing the variable over `as any`; **no new `as any`/@ts-ignore** (target 0 suppressions).
- Bodies move **verbatim** — no behavior change, no drive-by cleanups.

## Conversion: `middlewares.js` → `middlewares.ts` + accessors

Introduce two **module-local** accessors (config-coupled home is fine — no config-free/unit-tested
code imports them; query-advice & datasets/utils read the raw `legacyProp`, not the accessor):

```ts
import { defineReqContext } from '../misc/utils/req-context.ts'
import type { Dataset } from '#types'
const datasetCtx = defineReqContext<Dataset>('dataset', 'dataset')           // legacyProp dual-write
export const setReqDataset = datasetCtx.set
export const reqDataset = datasetCtx.get
export const reqDatasetOptional = datasetCtx.getOptional
const datasetFullCtx = defineReqContext<Dataset>('datasetFull', 'datasetFull')
export const setReqDatasetFull = datasetFullCtx.set
export const reqDatasetFull = datasetFullCtx.get
export const reqDatasetFullOptional = datasetFullCtx.getOptional
```

Reuse existing accessors (all already legacyProp dual-write):
- `setReqResource` / `reqResourceOptional` — `misc/utils/permissions.ts`
- `setReqNoCache` — `misc/utils/cache-headers.ts`
- `reqPublicationSite` / `reqMainPublicationSite` (optional getters) — `misc/utils/publication-sites.ts`

Setter migration in `readDataset` (drops the `@ts-ignore`s):
- `req.dataset = req.resource = dataset` → `setReqDataset(req, dataset); setReqResource(req, dataset)`
- `req.datasetFull = datasetFull` → `setReqDatasetFull(req, datasetFull)`
- `req.noCache = true` → `setReqNoCache(req, true)`
- `req.url = withQuery(...)` — **keep** (genuine Express prop, not context)

Reader migration:
- `checkStorage`: `req.resource` → `reqResourceOptional(req)`
- `lockDataset`: `req.dataset` → `reqDatasetOptional(req)`
- `readDataset`: `req.publicationSite`/`req.mainPublicationSite` → `reqPublicationSite(req)`/`reqMainPublicationSite(req)`

Express-5 param narrowing (blessed idiom, §2 conventions): guard `req.params.datasetId` once:
`if (typeof req.params.datasetId !== 'string') throw httpError(400, 'invalid path parameters')`.
Handler signatures keep the `(req, res, next)` adapter shape (`RequestHandler`); the curried factories
(`checkStorage`/`lockDataset`/`readDataset`) keep their option signatures verbatim.

## Importer specifier sweep (rename = update EVERY importer repo-wide — 6a/6b lesson)

`service.js` → `service.ts` importers: `applications/service.ts`, `catalog/router.ts`,
`datasets/router.js`, `identities/service.ts`, `misc/routers/test-env.ts`, and 9 `workers/**` files
(+ the dynamic `await import('../../datasets/service.js')` in `workers/short-processor/index.ts`).
`middlewares.js` → `middlewares.ts` importers: `api-compat/ods/index.ts`, `applications/router.ts`,
`datasets/router.js`. Internal: `middlewares` imports `./service.js` → `./service.ts`.
**Match by basename via grep — never post-filter on `datasets/service`** (a `../service.js` sibling
specifier won't contain it). Run `git grep -n "datasets/service\.js\|/service\.js'"` etc. to confirm zero left.

## Verification per the §10 checklist
- `npm run check-types-ratchet` improved; commit `dev/type-errors-baseline.txt`.
- Run targeted api specs to confirm **boot** + behaviour: dataset CRUD, rest lines, catalog (`findDatasets`
  cross-module importer), applications storage-check (`checkStorage` importer), ods (`readDataset` importer).
- Zero suppressions added. Express only in router/middlewares. Mount/chain order untouched.
- legacyProp on `dataset`/`datasetFull` **retained** (router.js + datasets/utils still raw-read) — drop in 6d.
  Same for `esAbortContext` (§9 item 9a). Update conventions §2 legacy-mutation table.

## Execution record (2026-06-17, branch `refactor-typescript8`, main-session execution)

Done. Ratchet **946 → 891 (−55)**; `dev/type-errors-baseline.txt` committed. Zero new suppressions
(`grep -nE 'as any|@ts-ignore|@ts-expect-error'` on the changed files = none); the old `@ts-ignore`s
in `middlewares.js` and the `/** @type {any} */` JSDoc casts in `service.js` were removed. Lint clean.
442 unit specs pass.

- **service.ts**: pure type annotations, bodies verbatim. Implicit-any params typed from JSDoc; ad-hoc
  locals typed (`explain: Record<string,number>|false|undefined`, `extraFilters: any[]`, `sort`/`response`/
  `draftPatch: Record<string,any>`, `mongoPatch: { $set?, $unset? }`, `filePatch: any`). `let dataset: any,
  datasetFull: any` in `getDataset` (kills the `WithId<Document>` vs `VirtualDataset` errors). The two
  rest-collection `$unset` docs typed `Record<string, ''>` (mongo `$unset` accepts `true|""|1`). Edge
  casts (named types, never `as any`): `virtualDataset as unknown as VirtualDataset`, `dataset.extras?.applications
  as { id: string }[]` (extras is `{[k]:unknown}`), `breakingChangesDesc as Record<Locale, Record<string,string>>`.
- **middlewares.ts**: new module-local `dataset`/`datasetFull` accessors (`defineReqContext`, `legacyProp`
  dual-write). Setters migrated (`setReqDataset`/`setReqResource`/`setReqDatasetFull`/`setReqNoCache`);
  readers migrated (`reqResourceOptional`, `reqDatasetOptional`, `reqPublicationSite`/`reqMainPublicationSite`).
  `req.params.datasetId` narrowed with the blessed `typeof !== 'string'` guard. `req.url = withQuery(...)`
  kept (genuine Express prop). `req.query.account` narrowed via `as string | undefined` (faithful: the
  malformed-array case still throws as before). `owner` cast `as Account` (Resource.owner/usersUtils.owner
  union vs lib-express `Account` — parking-lot 7a Account-typing gap).
- **webhooks.ts (dependency typing fix, no behavior change):** `trigger`'s `event` param was typed as the
  journal `Event` (requires `date`), but it only reads `type`/`href`/`data` and callers pass webhook-shaped
  `{type, body?}`; `sender` was untyped and is unused. Widened to `event: { type, href?, data?, body? }`,
  `sender?: any`. Fixes the `{type}`-vs-`Event` and "expected 4 got 3" errors at the true source; accepts
  all existing callers (`journals.ts` passes a full Event). Recorded as the correct fix, not a cast.
- **Rename sweep:** all `./service.js`/`./middlewares.js` + `datasets/service.js`/`datasets/middlewares.js`
  importers (incl. 9 workers, the dynamic `import()` in `short-processor`, cross-module `catalog`/`applications`/
  `ods`/`identities`/`test-env`, and a comment ref in `conforms-to.api.spec.ts`) rewritten to `.ts`. **Boot
  verified by runtime import-resolution** (Node `--experimental-strip-types`, no infra): `app.js`,
  `datasets/router.js`, and every cross-module importer resolve their full transitive graph (only config
  validation throws — **no `ERR_MODULE_NOT_FOUND`**). api/e2e specs not run here (worktree infra down,
  user-managed) — husky pre-push enforces the full suite.

**Note on accessor home:** `dataset`/`datasetFull` are module-local in `datasets/middlewares.ts` (config-coupled).
That's fine because the pure/unit-tested `query-advice.ts` and the `datasets/utils/*` readers read the raw
`legacyProp`, not the accessor — no config-free module imports `middlewares.ts`.

**6d carries over:** drop the `dataset`/`datasetFull` **and** `esAbortContext` legacyProps once `router.js`
migrates; migrate the ≈213 `req.dataset` router reads + `datasets/utils/*` reads to `reqDataset(...)`.
