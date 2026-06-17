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

## Execution record (2026-06-18, branch `refactor-typescript9`, main-session execution)

**Done.** Ratchet **891 → 541 (−350)**; `dev/type-errors-baseline.txt` committed at each commit. 11 commits
(`029a8bf1d` plan + `5da87882f`,`6bed32670`,`0412c0b6b`,`b159dc977`,`ed9041958`,`f3b3aa23b`,`414e79d8a`,
`48e88ece4`,`90073b4aa`,`f2029c8d6`). `api/src/datasets/` is now **100% TypeScript** (`router.js` gone);
`router.ts` is a **33-line composition root**. The 1569-line router split into 9 `routes/*.ts` files plus
2 shared helpers (`_common.ts`, `_es-error.ts`). All **12 `@ts-ignore`s** in the original router are gone;
no new `@ts-ignore`/`@ts-expect-error`; the few `as any` introduced are documented preserved-bug or
dynamic-payload boundary casts (see below). Each commit ran ≥1 api spec to confirm boot; the final sweep
ran the whole `tests/features/datasets` tree.

**Mount order preserved** exactly: `router.ts` registers metadata → write → lines → own-lines → master-data
→ read → files → misc, after the global `setReqResourceType` `.use`. (The original interleaved write
between metadata and lines; preserved.)

**New accessors:** `reqDataset`/`reqDatasetFull` (6c, module-local); **6d added** `setReqLinesOwner`/
`reqLinesOwnerOptional` and `setReqDraft`/`reqDraftOptional` (module-local in `middlewares.ts`, legacyProp —
rest.ts/upload.ts still raw-read), and `setReqOperation`/`reqOperation` (`permissions.ts`, no legacyProp —
atomic: permissions.middleware sets, files metadata-attachments GET reads). **Dropped now-dead legacyProps:**
`resource`, `datasetFull`, `esAbortContext` (grep-verified no raw readers repo-wide). **Kept legacyProps:**
`dataset` (query-advice/upload/rest/outputs raw-read), `resourceType` (ods raw-sets), `linesOwner`, `_draft`.

**Systemic source-typing fixes** (the recurring `router.<verb>` overload friction came from middlewares typed
with a custom `req`; all fixed at the source, each verified accessor-only in body): `permissions.middleware`
+ `permissions.canDoForOwnerMiddleware` + `application-key` default export → `req: Request`;
`permissions.middleware` `trackingCategory` widened to `string | null` (writeData routes pass `null`);
`clamav.middleware` now imports `Response` from express (was the global DOM `Response` — parking-lot item,
now resolved); `res.throttle`/`throttleEnd`/`_originalEnd` declared on global `Express.Response` in
`rate-limiting.ts`; `tiles.geojson2pbf` `vtPrepared` optional; `outputs.results2sheet` `bookType` defaults
`'xlsx'`; `outputs.ReqWithDataset` exported; `preparePatch` `draftValidationMode` made optional;
config `cache` schema gains optional `disabled`. The `RequestWithRestDataset` REST line handlers are aliased
`as RequestHandler` at mount (contravariance; cf. `permissions.router`).

**Suspected bugs found while moving (preserved bit-for-bit — parking lot, master plan §9):**
- **6d-1** (`routes/write.ts` cancelDraft, ex `router.js` draft DELETE): the call passed a stray 5th arg
  `sessionState` to the 4-param `journals.log` — silently ignored at runtime; dropped the arg as a
  behavior-preserving no-op. Verify whether draft-cancelled journal should carry session context.
- **6d-2** (`routes/write.ts` validateDraft): `localizedParams` is mis-shaped `{cause:{fr,en}}` instead of
  the `{fr:{cause},en:{cause}}` used everywhere else (e.g. `workers/batch-processor/process-file.ts`) — the
  localized cause is malformed. Preserved via cast.
- **6d-3** (`routes/misc.ts` user-notification): `notifications.send(notif, true, sessionState)` against the
  2-param `send(event, sessionState?)` — passes `true` in the `sessionState` position (the real sessionState
  was always the ignored 3rd arg). Preserved as `send(notif, true as any)`.
- **6d-4** (`routes/metadata.ts` PATCH, ex `router.js` patch): `preparePatch(...)` is called with 5 args,
  omitting `draftValidationMode` (6th) — so metadata PATCH always uses the default/undefined draft validation
  mode. Made the param optional to compile; verify intent.

**Process note:** the import-specifier sweep + per-commit api-spec boot check (6a/6b lesson) held — no
`ERR_MODULE_NOT_FOUND`. The `.js`-importing-`.ts` pattern worked throughout while `router.js` shrank, so the
`app.js`/`ods` specifier flip to `.ts` was deferred to the final commit (C10).
