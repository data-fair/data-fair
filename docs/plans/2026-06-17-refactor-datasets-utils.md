# Phase 6b — datasets/utils (js→ts) + rest.ts req-decoupling

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement
> this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Expands the **6b** slice of the Phase 6 brief in the [master plan](2026-06-10-code-quality-refactor.md §8.5).
> Follows [code-conventions.md](../architecture/code-conventions.md). Phase 6 (datasets) is the bulk of
> the refactor, sliced 6a→6d, **one PR each**; this doc covers **6b only**.

**Goal:** Convert every remaining `.js` file in `api/src/datasets/utils/` to TypeScript with **zero
behavior change**, and perform the one genuine decoupling the brief calls for: lift `rest.ts`'s
`req._rawBody` / `req._uploadedAttachmentPath` / `req._fixedFormBody` mutations out of `req` so the
attachment-handling helpers are express-free. The API/e2e test contract stays untouched and the
type-error ratchet drops.

**Architecture:** Like 6a/5b this is primarily a **mechanical js→ts conversion**: function bodies move
**verbatim**, only type annotations are added and implicit-any / missing-property errors cleared. No
functions are relocated between files. The exceptions are deliberate, minimal decouplings that remove
`req` coupling using **already-existing Phase-5 accessors** (no new context homes invented):

- `index.js` `clean(req, …)` — replace the 2 `@ts-ignore`'d `req.publicationSite` / `req.publicBaseUrl`
  reads with `reqPublicationSite` / `reqPublicBaseUrl` accessors; keep the `req` param (full decoupling
  of `clean` into a service belongs to 6c/6d when router/service migrate).
- `outputs.js` `results2csv` / `results2sheet` — keep the `req` param; type it and use
  `reqPublicBaseUrl` for the `publicBaseUrl` read. `req.originalUrl` / `req.__()` / `req.query` are
  standard Express and stay.
- `rest.ts` — `manageAttachment` and `rollbackUploadedAttachment` become express-free helpers taking
  explicit params; `_rawBody` / `_uploadedAttachmentPath` become locals/return values (the props are
  **eliminated**, not migrated via accessor); `_fixedFormBody` (set by the `fixFormBody` middleware,
  read by `manageAttachment`) gets a **module-local accessor** in `rest.ts` (no `legacyProp` — no other
  file touches it). The directly-mounted route handlers (`readLine`/`createOrUpdateLine`/… — see §1)
  **stay as `(req, res, next)` adapters**: they are Express handlers by construction; they read `req`
  at the boundary and pass explicit values into the express-free helpers. `linesOwner` is already
  passed explicitly into the express-free `applyTransactions` layer — left as a typed boundary read.

**Tech Stack:** Node 24, Express 5, TypeScript strict + checkJs, `@data-fair/lib-*`, df-build-types,
Playwright (unit + api). Ratchet: `npm run check-types-ratchet` (baseline currently **1106**).

**Size estimate:** L. Master-plan expected tsc delta ≈ **−283**. 10 `.js` files (1519 LOC) + `rest.ts`
decoupling. One worktree (current branch `refactor-typescript7`, even with master), one PR, ~5 commits.

**Actual (closed out 2026-06-17):** ratchet **1106 → 950 (−156)**, 5 commits
(`f952d3857`, `a4f0ed37e`, `c2c521a99`, `49c641e9c`, `559a9472f`), `datasets/utils` now **100% TS**,
**−2 suppressions** (index.js clean()), **0 new** `@ts-ignore`/`as any`. `rest.ts` `_rawBody`/
`_uploadedAttachmentPath` eliminated, `_fixedFormBody` → module-local accessor, `manageAttachment`/
`rollbackUploadedAttachment` express-free (per-call `ManageAttachmentContext` instead of a request-
scoped `RestLinesContext` — see master-plan 6b execution record). Boot confirmed per batch via api
specs (csv-output/master-data, upload suite 144✓, datasets-upload+markdown 28✓, rest suite 57✓). No
suspected bugs found. **Subagent-driven execution was abandoned mid-Task-1**: implementer subagents
cannot obtain `dangerouslyDisableSandbox`, so they cannot run the ratchet/eslint/tests/git the tasks
require — executed in the main session instead, with a final whole-branch review subagent (read-only).
**Key lesson (now in master plan):** the rename sweep must match the file **basename**, never
post-filter on the literal `datasets/utils` — `es/commons.ts`'s `'../utils/geo.js'` was missed and
broke the boot until the api-spec boot check caught it.

---

## 0. Scope & inventory

`api/src/datasets/utils/` is 27 files today: 17 already `.ts` and **10 `.js` to convert**. Dependency
order (leaf → root) determines the conversion batches; `.js`→`.ts` is fine to import from `.js` and
vice-versa mid-conversion as long as **every importer specifier is rewritten `'./X.js'`→`'./X.ts'`**.

| File | LOC | req-coupled? | suppr. | internal-utils deps | converts in batch |
|---|---|---|---|---|---|
| `types.js` | 34 | no | 0 | — | A |
| `read-api-key.js` | 32 | no | 0 | — | A |
| `merge-draft.js` | 10 | no | 0 | — | A |
| `fields-sniffer.js` | 11 | no | 0 | `operations.ts` ✓ | A |
| `master-data.js` | 137 | no | 0 | (es, already-ts) | A |
| `geo.js` | 332 | no | 0 | `geo-self-intersection.ts` ✓, `geo-simplify.ts` ✓ | A |
| `outputs.js` | 103 | **yes** (`results2csv`/`results2sheet`) | 0 | `csv-jit.ts` ✓ | A |
| `data-streams.js` | 407 | no | 0 | `types.js`→ts, `fields-sniffer.js`→ts | B |
| `index.js` | 249 | **yes** (`clean`) | 2 | `merge-draft.js`→ts, `read-api-key.js`→ts, `types.js`→ts | C |
| `patch.js` | 214 | no | 0 | `geo.js`→ts, `index.js`→ts | D |

**rest.ts** (1410 LOC, already `.ts`, 4 unrelated `@ts-ignore`) decouples in batch E.

### Import-specifier ripple (the 6a boot-break trap — verify by grep, never assume)

Every importer of a renamed file must flip its specifier. The known importers (grep-verified):

| Renamed file | Importers & specifier to flip |
|---|---|
| `types.js` | `data-streams.js:12` `'./types.js'`; `rest.ts:33` `'./types.js'`; `index.js:20` `export * from './types.js'` |
| `read-api-key.js` | `index.js:13` `'./read-api-key.js'` (+ `:47` re-export) |
| `merge-draft.js` | `index.js:14` `'./merge-draft.js'` (+ `:19` re-export) |
| `fields-sniffer.js` | `data-streams.js:13` `'./fields-sniffer.js'`; `rest.ts:26` `'./fields-sniffer.js'` |
| `master-data.js` | `router.js:41` `'./utils/master-data.js'` |
| `geo.js` | `router.js:31` `'./utils/geo.js'`; `patch.js:8` `'./geo.js'` |
| `outputs.js` | `router.js:35` `'./utils/outputs.js'` |
| `data-streams.js` | `rest.ts:27` `'./data-streams.js'` |
| `index.js` | `router.js:25` `'./utils/index.js'`; `service.js:9` `'./utils/index.js'`; `patch.js:9` `'./index.js'` |
| `patch.js` | `router.js:52` `'./utils/patch.js'` |

**Before each commit re-run the repo-wide sweep** for the files that batch renamed (catches benchmark/
tests/contract/types/JSDoc `import()` specifiers the table may miss):

```bash
# NOTE: do NOT post-filter on the literal "datasets/utils" — sibling importers use
# relative paths like '../utils/geo.js' (es/commons.ts) that don't contain that string.
# Task 1 lesson: that filter hid es/commons.ts and broke the boot. Match the basename.
grep -rnE "utils/(types|read-api-key|merge-draft|fields-sniffer|master-data|geo|outputs|data-streams|index|patch)\.js['\"]" \
  api benchmark contract --include='*.ts' --include='*.js'
# plus same-dir './X.js' specifiers inside datasets/utils itself:
grep -rnE "'\./(types|read-api-key|merge-draft|fields-sniffer|master-data|geo|outputs|data-streams|index|patch)\.js'" api/src/datasets/utils
```

`router.js` and `service.js` stay `.js` (they convert in 6c/6d) — only their **specifier strings**
change to `.ts`; Node 24 `--experimental-strip-types` resolves a `.js` file importing `'./x.ts'`
fine, but a stale `'./x.js'` pointing at a renamed file crashes the boot with `ERR_MODULE_NOT_FOUND`.
**Run an api spec after every rename batch to confirm boot — `tsc`/ratchet alone won't catch it.**

### Conversion rules (apply to every file — identical to 6a)

1. **Bodies verbatim.** Only add type annotations. No logic/ordering/control-flow change.
2. **No new suppressions.** Zero new `@ts-ignore`/`@ts-expect-error`/`as any`. The 2 existing
   `index.js` `@ts-ignore`s are **removed** via the accessor swap (Task C), not preserved.
3. **JSDoc `@typedef`/`@param`/`@returns` → TS.** Convert typedef blocks to `interface`/`type`; drop
   now-redundant `@param`/`@returns`. Keep narrative JSDoc.
4. **Types from `#types` / schema, never casts.** TS2339 on a `Dataset`/schema type is fixed by
   enriching the schema (`api/types/*` via df-build-types) or importing the right type — record a
   genuine schema gap in master-plan §9, use the narrowest honest type, never a suppression.
5. **Run the ratchet after every batch** — it may only decrease.
6. **Suspected bugs found while converting** → preserved bit-for-bit, recorded in master-plan §9,
   never fixed inline.

---

## Task 1 — pure leaves → `.ts` (Batch A)

**Files (rename each `.js`→`.ts`):** `types.js`, `read-api-key.js`, `merge-draft.js`,
`fields-sniffer.js`, `master-data.js`, `geo.js`, `outputs.js`.

All are leaves (no deps on other to-convert `.js`; their util deps are already `.ts`). Convert
together; fix every importer specifier (table above) in the same commit.

- [ ] **Step 1: Convert the 7 files** — bodies verbatim, annotations only. For each:
  - `types.js`: typed `Set<string>` exports — trivial.
  - `read-api-key.js`: type `create`/`renew` params (`dataset`/`key` from `#types`), dayjs already typed.
  - `merge-draft.js`: type the single `mergeDraft(dataset)` (mutates & returns dataset).
  - `fields-sniffer.js`: re-exports `operations.ts` sniff/format with config injection — type params.
  - `master-data.js`: type `bulkSearchStreams` params (`dataset`, search config); ES stream types
    mirror the pattern already in the es/*.ts files.
  - `geo.js`: type `result2geojson`/`result2wkt`/`aggs2geojson`/projection helpers; `Dataset`/schema
    types from `#types`; geojson helpers from existing geo-*.ts typing.
  - `outputs.js`: type `results2csv(req, results)` / `results2sheet(req, results, bookType)`. **Keep
    the `req` param** but type it (`RequestWithDataset` or a minimal structural type) and replace the
    `req.publicBaseUrl` read with `reqPublicBaseUrl(req)` (import from
    `../../misc/utils/public-base-url.ts`). `req.dataset`/`req.query`/`req.originalUrl`/`req.__()` stay.
- [ ] **Step 2: Flip importer specifiers** — `data-streams.js:12,13`; `rest.ts:26,33`; `index.js:13,14,20,47`;
  `router.js:31,35,41`; `patch.js:8`. Then run the repo-wide sweep (§0) — must return only the
  not-yet-converted `index.js`/`patch.js`/`data-streams.js` self-references.
- [ ] **Step 3: Ratchet + lint** — `npm run check-types-ratchet` (drops); `npx eslint` clean on the 7
  files + touched importers.
- [ ] **Step 4: Boot + api spec** — `npx playwright test tests/features/datasets/query` (exercises
  geo/outputs via results serialization) and one master-data spec → PASS (confirms boot). Record if
  infra down (husky runs full suite at push).
- [ ] **Step 5: Commit** — `refactor(datasets/utils): leaf utils (types/geo/outputs/…) → ts`

---

## Task 2 — `data-streams.js` → `.ts` (Batch B)

`data-streams.js` (407 LOC) imports `types.js` + `fields-sniffer.js` (now `.ts` from Task A) and is
imported by `rest.ts:27` (`transformFileStreams`, `formatLine`).

- [ ] **Step 1: Convert** — rename, bodies verbatim. Type `transformFileStreams` (the CSV/JSON/GeoJSON
  Transform pipeline) and `formatLine(line, schema)`. Stream Transform typing: mirror
  `misc/utils/streams.ts` / the es/index-stream.ts pattern. `dataset`/`schema`/`DatasetLine` from `#types`.
- [ ] **Step 2: Flip specifiers** — `rest.ts:27` `'./data-streams.js'`→`'.ts'`; sweep (§0).
- [ ] **Step 3: Ratchet + lint** — drops; eslint clean.
- [ ] **Step 4: Api spec** — `npx playwright test tests/features/datasets/rest` (bulk lines exercise
  `transformFileStreams`/`formatLine`) → PASS.
- [ ] **Step 5: Commit** — `refactor(datasets/utils): data-streams.js → ts`

---

## Task 3 — `index.js` → `.ts` + `clean()` accessor swap (Batch C)

`index.js` (249 LOC) imports `merge-draft.js`/`read-api-key.js`/`types.js` (now `.ts`). Imported by
`router.js:25`, `service.js:9`, `patch.js:9` (as `datasetUtils`). Hosts `clean(req, dataset, draft)`
with the 2 `@ts-ignore`s.

- [ ] **Step 1: Convert** — rename, bodies verbatim. Type the id/slug/schema/path/permission helpers
  (`Dataset`/`SchemaProperty`/`AccountKeys`/`SessionState` from `#types`/lib-express).
- [ ] **Step 2: De-suppress `clean`** — replace `// @ts-ignore; const publicationSite = req.publicationSite`
  with `const publicationSite = reqPublicationSite(req)` (import from
  `../../misc/utils/publication-sites.ts`; this accessor is already `getOptional` → `any | undefined`)
  and `// @ts-ignore; const publicUrl = req.publicBaseUrl` with `reqPublicBaseUrl(req)`. Keep `req.query`
  and `req.bypassPermissions` as-is for now (bypassPermissions has the `reqBypassPermissions` accessor —
  use it if it types cleanly, else leave typed-as-is; do **not** add a suppression). Net: −2 suppressions.
- [ ] **Step 3: Flip specifiers** — `router.js:25`, `service.js:9`, `patch.js:9` `'…/index.js'`→`'.ts'`;
  the `export * from './types.js'` and re-exports inside index already flipped in Task A — re-verify.
  Sweep (§0).
- [ ] **Step 4: Ratchet + lint** — drops (incl. the 2 `@ts-ignore`); eslint clean.
- [ ] **Step 5: Boot + api spec** — `npx playwright test tests/features/datasets/datasets-crud.api.spec.ts`
  (or the closest metadata-read spec — `clean` runs on every dataset GET) → PASS.
- [ ] **Step 6: Commit** — `refactor(datasets/utils): index.js → ts, clean() via accessors`

---

## Task 4 — `patch.js` → `.ts` (Batch D)

`patch.js` (214 LOC) imports `geo.js`/`index.js` (now `.ts`). Imported by `router.js:52`
(`preparePatch`). Already express-free (takes explicit `app`/`patch`/`dataset`/`sessionState`/… params).

- [ ] **Step 1: Convert** — rename, bodies verbatim, annotations only. Type `preparePatch` params and
  the schema/extension diff helpers from `#types`.
- [ ] **Step 2: Flip specifier** — `router.js:52` `'./utils/patch.js'`→`'.ts'`; sweep (§0).
- [ ] **Step 3: Verify 100% TS** — `ls api/src/datasets/utils/*.js` returns nothing.
- [ ] **Step 4: Ratchet + lint** — drops; `npx eslint api/src/datasets/utils` clean.
- [ ] **Step 5: Api spec** — `npx playwright test tests/features/datasets/datasets-patch.api.spec.ts`
  (or closest patch/schema-change spec) → PASS.
- [ ] **Step 6: Commit** — `refactor(datasets/utils): patch.js → ts (utils now 100% TS)`

---

## Task 5 — `rest.ts` attachment-handling decoupling (Batch E)

The directly-mounted route handlers (`router.js:608-647`: `readLine`, `createOrUpdateLine`, `patchLine`,
`deleteLine`, `deleteAllLines`, `bulkLines`, `readRevisions`, `syncAttachmentsLines`, + multer
middlewares `uploadAttachment`/`fixFormBody`/`uploadBulk`) **stay as `(req, res, next)` adapters**. Only
the internal attachment helpers lose their `req` coupling.

- [ ] **Step 1: `_fixedFormBody` → module-local accessor.** At the top of `rest.ts` add
  `const fixedFormBody = defineReqContext<boolean>('restFixedFormBody')` (no `legacyProp` — nothing
  outside `rest.ts` touches it) with `setReqFixedFormBody`/`reqFixedFormBodyOptional`. In `fixFormBody`
  replace `req._fixedFormBody = true` with `setReqFixedFormBody(req, true)`. (Import `defineReqContext`
  from `../../misc/utils/req-context.ts`.)
- [ ] **Step 2: `manageAttachment` → express-free.** Change signature from
  `manageAttachment(req, keepExisting)` to
  `manageAttachment(ctx: { dataset: RestDataset, body: Record<string, any>, file?: ReqFile, isMultipart: boolean, fixedFormBody: boolean, lineId?: string }, keepExisting): Promise<{ rawBody?: Record<string, any>, uploadedAttachmentPath?: string }>`.
  Body verbatim except: read from `ctx.*` instead of `req.*`; the `req._rawBody = {...req.body}` becomes
  a local `rawBody` in the returned object; `req._uploadedAttachmentPath = …` becomes the returned
  `uploadedAttachmentPath`. `checkMatchingAttachment` already takes `{ body }` — pass `ctx.body`.
  `req.is('multipart/form-data')` is resolved by the caller into `ctx.isMultipart`.
- [ ] **Step 3: `rollbackUploadedAttachment` → param.** `rollbackUploadedAttachment(uploadedAttachmentPath?: string)`
  — body verbatim minus the `delete req._uploadedAttachmentPath` (the local just goes out of scope).
- [ ] **Step 4: Update the 3 caller handlers** (`createOrUpdateLine`, `patchLine`; `manageAttachment`
  is called in both). In each: assemble the ctx from `req` (`body: req.body`, `file: req.file`,
  `isMultipart: req.is('multipart/form-data')`, `fixedFormBody: !!reqFixedFormBodyOptional(req)`,
  `lineId: req.params.lineId`, `dataset: req.dataset`), call `manageAttachment(ctx, …)`, keep
  `rawBody`/`uploadedAttachmentPath` as locals, pass `uploadedAttachmentPath` to
  `rollbackUploadedAttachment`, and use `rawBody ?? req.body` for `getLineFromOperation`. Behavior
  byte-identical.
- [ ] **Step 5: Confirm props eliminated** —
  `grep -nE "req\._rawBody|req\._uploadedAttachmentPath|req\._fixedFormBody" api/src/datasets/utils/rest.ts`
  returns **nothing** (all three gone from `rest.ts`); a repo-wide grep confirms no other reader exists
  (they don't — only `rest.ts` touched them).
- [ ] **Step 6: Ratchet + lint** — drops (the 3 untyped props were baseline errors); eslint clean. Try
  to also clear the 4 pre-existing `rest.ts` `@ts-ignore`s if cheap; if not, leave them (don't add new).
- [ ] **Step 7: Api spec** — `npx playwright test tests/features/datasets/rest` (the full rest-lines +
  attachment suite — this is the behavior contract for the decoupling) → PASS.
- [ ] **Step 8: Commit** — `refactor(datasets): decouple rest.ts attachment handling from req`

---

## Task 6 — close-out

- [ ] **Step 1: Full ratchet + lint sweep** — ratchet at new low (record delta from 1106);
  `npm run lint` clean repo-wide; `grep -rcE "@ts-ignore|@ts-expect-error|as any" api/src/datasets/utils`
  shows the suppression count dropped (−2 from `index.js`, ideally more).
- [ ] **Step 2: Confirm `utils/` is 100% TS** — `ls api/src/datasets/utils/*.js` empty.
- [ ] **Step 3: Unit specs** — run any `datasets` unit spec whose import path touched a renamed file
  (update import paths in the same PR — additions/path-fixes only, assertions unchanged).
- [ ] **Step 4: Update docs** — append a "Phase 6b execution record" to master plan
  `docs/plans/2026-06-10-code-quality-refactor.md` (commits, baseline delta, LOC, suppressions, any
  preserved bug); update the §2 legacy-mutation table in `code-conventions.md`
  (drop `_rawBody`/`_uploadedAttachmentPath` rows from `rest.ts`; note `_fixedFormBody` now an
  accessor); record actuals in this doc.
- [ ] **Step 5: Commit** — `refactor(datasets/utils): phase 6b close-out`
- [ ] **Step 6: Push** (husky runs full `npm run quality`). Open the PR.

---

## Definition of done (per master plan §10)

- [ ] All 10 `datasets/utils/*.js` converted to `.ts`; `utils/` is **100% TypeScript** (`ls *.js` empty).
- [ ] API/e2e specs **untouched** and green; unit specs: import paths updated where a tested file moved,
      assertions unchanged.
- [ ] `npm run check-types-ratchet` improved; `dev/type-errors-baseline.txt` committed.
- [ ] Suppressions in `datasets/utils/` net **down** (≥ −2 from `index.js`); no new
      `as any`/`@ts-ignore`/`@ts-expect-error`.
- [ ] `rest.ts` `req._rawBody` / `req._uploadedAttachmentPath` **eliminated**; `req._fixedFormBody` is a
      module-local accessor; `manageAttachment`/`rollbackUploadedAttachment` are express-free.
- [ ] Every renamed file's importers (incl. `router.js`/`service.js` `.js` specifiers, benchmark, tests,
      contract, types, JSDoc) resolve — **boot confirmed by an api spec per batch**, not just tsc.
- [ ] Function bodies moved **verbatim** — no behavior change. Any suspected bug recorded in §9.
- [ ] Master plan §8.5/§9 + `code-conventions.md` §2 updated; this doc records actual size/effort.
