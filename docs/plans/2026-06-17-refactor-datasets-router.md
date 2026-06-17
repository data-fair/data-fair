# Phase 6d — datasets/router.js → routes/*.ts thin adapters

> **For agentic workers:** main-session execution (subagents can't run ratchet/eslint/tests/git per the
> 6b lesson). Steps use checkbox (`- [ ]`) syntax. Expands the **6d** slice of the Phase 6 brief in the
> [master plan](2026-06-10-code-quality-refactor.md §8.6). Follows [code-conventions.md](../architecture/code-conventions.md).

**Goal:** Convert `api/src/datasets/router.js` (1569 LOC, **342 tsc errors**, 12 `@ts-ignore`) to
TypeScript, split into per-sub-resource `datasets/routes/*.ts` thin adapters composed by a small
`datasets/router.ts`, migrate every remaining dataset request-context **read** to the symbol accessors
(the setters already migrated in 6c), and drop the suppressions — **zero behavior change**, API/e2e
contract untouched, ratchet drops hard (most of the master-plan's remaining −330 toward 0).

**Branch:** `refactor-typescript9` (this worktree), even with master @ `9deeabf30` (6c merged, baseline
**891**). Per user: **many commits, one PR they manage** — do NOT open the PR.

## Strategy: extract-in-place, always bootable

`router.js` stays a bootable `.js` and **shrinks** commit by commit as contiguous route groups move
into `routes/<group>.ts` (clean TS, accessors, no suppressions). `.js`-importing-`.ts` already works
throughout this repo (router.js already imports dozens of `.ts`). The `app.js` mount
(`import('./datasets/router.js')`) and the `ods` import stay valid until the **final** commit renames
the rump `router.js` → `router.ts`. Each extraction commit runs `tsc`/ratchet + an api spec to confirm
boot (6a/6b lesson: a rename/extraction that breaks a specifier crashes the boot even when tsc is green).

**Mount-order invariant (load-management depends on it — §3 conventions):** route groups are already
contiguous and in this order in the file; each `routes/<group>.ts` exports `register<Group>(router)` and
`router.ts` calls them in the **same original order**. Verified: all cross-group paths are
segment-distinct (Express 5 exact-segment matching), so matching is order-independent across groups; the
only intra-order constraints are (a) the global `req.resourceType` `.use` stays first, and (b) the
`/:datasetId/own/:owner` `.use` guard stays immediately before the own-lines routes — both kept by
moving each group's `.use`+routes together verbatim.

## Accessor migration (reads; setters done in 6c / earlier phases)

| legacy read | count | accessor | home |
|---|---|---|---|
| `req.dataset` | ~120 | `reqDataset` / `reqDatasetOptional` | `datasets/middlewares.ts` (6c) |
| `req.datasetFull` | 4 | `reqDatasetFull` | `datasets/middlewares.ts` (6c) |
| `req.resource` | 1 | `reqResource` | `permissions.ts` |
| `req.resourceType =` (setter, l.82) | 1 | `setReqResourceType` | `req-context.ts` |
| `req.publicBaseUrl` | 13 | `reqPublicBaseUrl` | `public-base-url.ts` |
| `req.publicationSite` | 4 | `reqPublicationSite` | `publication-sites.ts` |
| `req.mainPublicationSite` | 2 | `reqMainPublicationSite` | `publication-sites.ts` |
| `req.esAbortContext` | 3 | `reqEsAbortContext` | `datasets/es/abort.ts` |
| `req.linesOwner` (set l.626; read 6× here + rest.ts) | new | `setReqLinesOwner`/`reqLinesOwner` (legacyProp `'linesOwner'`) | `datasets/middlewares.ts` |
| `req._draft` (set l.470; read upload.ts) | new | `setReqDraft`/`reqDraftOptional` (legacyProp `'_draft'`) | `datasets/middlewares.ts` |

`req.url`, `req.query`, `req.params`, `req.body`, `req.app.get('es')`, `req.get(...)`, `req.__()`,
`req.getLocale()`, `req.originalUrl` are **standard Express** — stay. Once router.js is fully migrated,
**drop the `legacyProp`** on `dataset`/`datasetFull`/`resource`/`resourceType`/`esAbortContext`
(grep-verify no raw reader left repo-wide; `linesOwner` legacyProp stays until rest.ts readers migrate —
do that here if cheap; `_draft` legacyProp stays until upload.ts reader migrates — likewise).

## Decoupling depth (§5 guardrails)

Mechanical. Handlers become `(req,res,...)` adapters that parse `req` (accessors + query/params/body),
call a service/operations function with explicit params, and `res.send`. **Bodies move verbatim**;
the only signature change is `req`→explicit params. Intrinsic **response-shaping** stays in the router
(streaming, `content-disposition`, `res.setHeader`, vector-tile/CSV/XLSX/geojson output assembly,
`LinkHeader`/pagination links) — same call as Phase 4 kept proxy DOM assembly in `proxy.ts`. New service
functions land in `datasets/service.ts` (or `service/<sub>.ts` if it crosses ~500 LOC) and pure helpers
in `operations.ts` with unit specs (additions only). Resist drive-by cleanups → parking lot.

## Routes files & groups (file order = mount order)

| File | Routes (orig lines) | Local helpers moved in |
|---|---|---|
| `routes/_common.ts` | — | `apiKeyMiddlewareRead/Write/Admin`, `isRest`, `readWritableDataset` (shared by lines/own/read/master-data) |
| `routes/metadata.ts` | list `''`; `/permissions` use; GET `/:id`,`/schema`,`/safe-schema`; PATCH `/:id`; PUT `/owner`; DELETE `/:id` (89–457) | `sendSchema`, `descriptionHasBreakingChanges`, `permissions*` consts |
| `routes/write.ts` | POST `''`; POST/PUT `/:id`; POST/DELETE `/draft` (458–606) | `createDatasetRoute`, `updateDatasetRoute`, `debugCreateDataset` |
| `routes/lines.ts` | `/lines/*`, `/_bulk_lines`, `/revisions`, `/_sync_attachments_lines` (608–617) | — |
| `routes/own-lines.ts` | `/own/:owner` use + routes (620–647) | (sets `linesOwner`) |
| `routes/master-data.ts` | single-searchs, bulk-searchs (650–699) | — |
| `routes/read.ts` | GET `/lines`, `/own/.../lines`, geo/values/metric/words/max/min aggs (1008–1237) | `readLines`, `manageESError`, `countWithCache`, `esQueryErrorCounter` |
| `routes/files.ts` | attachments, data-files, metadata-attachments, raw, convert, full, diagnostics (1238–1402) | — |
| `routes/misc.ts` | metadata-settings, api-docs, journal, task-progress, user-notifications, thumbnail, read-api-key, `_simulate-extension`, `_diagnose`, `_reindex`, `_refinalize`, `_lock` (1404–1568) | `validateUserNotification`, `sendUserNotification*` perms |

`router.ts` (final) keeps: imports, `express.Router()`, the global `req.resourceType` `.use`, and the
ordered `register*(router)` calls; re-exports `apiKeyMiddlewareRead` (ods consumer) — or ods imports it
from `_common.ts` (specifier change, allowed). `default export router`.

## Commit sequence (each: tsc/ratchet ≤ baseline, lint, ≥1 api spec to confirm boot, commit)

- [ ] **C1 scaffold:** `routes/_common.ts` (apiKey mws + `isRest` + `readWritableDataset`); router.js imports them; point `ods` import of `apiKeyMiddlewareRead` at `_common.ts`. Boot: ods + datasets spec.
- [ ] **C2 master-data.ts** (smallest, self-contained). Boot: master-data spec.
- [ ] **C3 read.ts** (aggs + read lines + ES error/count helpers). Boot: lines/search + aggs specs.
- [ ] **C4 lines.ts** (REST write lines). Boot: rest spec.
- [ ] **C5 own-lines.ts** (+ `linesOwner` accessor). Boot: own-lines/rest spec.
- [ ] **C6 files.ts**. Boot: attachments/data-files specs.
- [ ] **C7 metadata.ts** (CRUD + schema). Boot: datasets spec.
- [ ] **C8 write.ts** (create/update/draft + `_draft` accessor). Boot: upload + draft specs.
- [ ] **C9 misc.ts** (docs/journal/admin). Boot: api-docs/journal specs.
- [ ] **C10 rename + finalize:** rump `router.js` → `router.ts`; global `.use` → `setReqResourceType`;
  drop now-dead `legacyProp`s (grep-verified); fix app.js mount specifier. Boot: broad datasets suite.
- [ ] **C11 close-out:** full targeted datasets specs; read-only review subagent; update conventions §2
  table + master-plan 6d execution record; parking lot. (No PR — user opens it.)

## Definition of done (master plan §10)

API/e2e specs untouched + green; ratchet improved + baseline committed each commit; 0 suppressions added
(12 dropped, target 0 in module); express only in `routes/*`/`router.ts`; no `req` mutation (accessors,
except standard Express `req.url`); `router.js` gone (all `.ts`); mount/middleware order preserved;
parking lot updated with any preserved-bit-for-bit suspected bugs.
