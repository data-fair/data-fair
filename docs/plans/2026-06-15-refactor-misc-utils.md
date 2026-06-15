# Phase 5 — misc/utils triage & cross-cutting accessors — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> This is the Phase 5 sub-plan of the master plan `docs/plans/2026-06-10-code-quality-refactor.md` (§8.4). Read `docs/architecture/code-conventions.md` first. All §3 conventions and §4 guardrails of the master plan apply: **mechanical moves only, function bodies move verbatim, suspected bugs go to the parking lot (never fixed inline), API/e2e specs are never modified, mount/middleware order is preserved exactly.**

**Goal:** Finish the cross-cutting request-context migration (replace the last `req.*` mutated properties read/written outside `datasets`/`api-compat`) and dissolve the `misc/utils` junk drawer by converting its remaining `.js` files to `.ts`, with no behavior change.

**Architecture:** Two sub-PRs off `master`. **5a** does the semantic core — define the remaining cross-cutting symbol accessors in their topical homes (`permissions.ts`, `cache-headers.ts`, a new `public-base-url.ts`; `publication-sites.ts` already done), switch all Phase-5-reachable setters and readers to them, and drop the one legacyProp that becomes fully migrated (`publicWsBaseUrl`). **5b** is mechanical: convert the remaining generic `.js` utils to `.ts` (no req coupling), update the two unit-spec import lines that point at moved `dcat` files, and write the junk-drawer classification note. 5a and 5b must NOT run concurrently with any Phase 6 work (both touch permission/cache call-sites).

**Tech Stack:** Node 24, Express 5, TypeScript strict + checkJs, `@data-fair/lib-express` / `lib-node`, Playwright runner, `dev/check-types-ratchet.sh` (baseline currently **1550**).

---

## A. Current-state findings (surveyed 2026-06-15 at branch point)

### A.1 misc/utils errors: 244 total. The bulk is generic, uncoupled utils.

```
53 icalendar.js   22 thumbnails.js*  12 markdown.js   11 cache-headers.js*  10 csv-sniffer.js
10 batch-stream.js 10 assert-immutable.js 8 cache.js   7 decode-stream.js   6 metadata-attachments.ts*
6 heap.js  6 geohash.js  6 exec.js  5 promisify-middleware.js  5 expect-type.js  5 api-key.ts*
4 webhooks.ts  4 dcat/normalize.js  3 visibility.js  3 licenses.js  3 find.js  2 service-workers.js
2 permissions.ts*  2 notifications.ts  2 dcat/validate.js  2 bytes.js  1 journals.ts  1 application-key.ts*
```
(`*` = req-context-coupled, handled in 5a. The rest are pure conversions in 5b.)

### A.2 Cross-cutting req-property map (setter → reader → which phase each site lives in)

| Prop | Setter(s) — phase | Readers — phase | Topical accessor home | legacyProp droppable in Phase 5? |
|---|---|---|---|---|
| `resource` | `datasets/middlewares.js:121` — **P6** | permissions, capture, cache-headers, metadata-attachments, application-key, api-key (**P5**); datasets/* (**P6**) | `permissions.ts` (exists) | **No** — setter + datasets readers are P6 |
| `resourceType` | `api-compat/ods/index.ts:48,53` — **P7**; `datasets/router.js:84` — **P6** | permissions, metadata-attachments (**P5**) | `permissions.ts` (exists) | **No** — setters are P6/P7 |
| `bypassPermissions` | `api-key.ts:15`, `application-key.ts:154` — **P5** | permissions, application-key (**P5**); `datasets/utils/index.js:159` (**P6**) | `permissions.ts` (add) | **No** — datasets reader is P6 |
| `publicOperation` | `permissions.ts:81` — **P5** | cache-headers, thumbnails, query-advice (**P5**); `datasets/router.js` ×3 (**P6**) | `permissions.ts` (add) | **No** — datasets readers are P6 |
| `noCache` | `datasets/middlewares.js:117` — **P6** | cache-headers (**P5**) | `cache-headers.ts` (add) | **No** — setter is P6 |
| `publicBaseUrl` | `app.js:109` — **P5** | thumbnails, capture, root.ts, applications, admin, catalog, base-applications (**P5**); datasets/* (**P6**); remote-services router.js (parked) | new `public-base-url.ts` | **No** — datasets readers are P6 |
| `publicWsBaseUrl` | `app.js:110` — **P5** | `applications/proxy.ts:104` — **P5** | new `public-base-url.ts` | **YES** ✅ only prop fully inside P5 |
| `publicationSite` | `app.js:129,132` — **P5** | datasets/* (**P6**) | `publication-sites.ts` (exists) | **No** — datasets readers are P6 |
| `mainPublicationSite` | `app.js:126` — **P5** | datasets/* (**P6**) | `publication-sites.ts` (exists) | **No** — datasets readers are P6 |

**Honest correction to the §8.4 brief:** the brief expected several legacy fallbacks droppable after Phase 5. In reality only **`publicWsBaseUrl`** has both its setter and its sole reader inside Phase-5 scope. Every other prop keeps its `legacyProp` until its remaining datasets (P6) / api-compat (P7) sites migrate. Phase 5 still converts every Phase-5-reachable site to accessors — the legacyProp dual-write keeps the un-migrated datasets/api-compat sites working untouched.

### A.3 Relevant type augmentation — `api/types/index.ts`

```ts
export type Request = ExpressRequest & { query: Record<string, string> } & { publicBaseUrl: string, publicWsBaseUrl: string }   // line 18
export type RequestWithResource = Request & {        // line 27
  resourceType: ResourceType,                        // 28
  resource: Resource,                                // 29
  bypassPermissions?: BypassPermissions,             // 30
  publicOperation?: boolean                          // 31
}
```
- `noCache` / `publicationSite` / `mainPublicationSite` / `noModifiedCache` are **not** typed here (read today only from `.js` files). Do not add them — the accessors are the typed surface.
- Only safe **type** removal in Phase 5: drop `publicWsBaseUrl` from line 18 (Task A6). Leave every other member — datasets (P6) / api-compat (P7) still rely on them via legacyProp; their final removal is gated on a repo-wide grep that won't be empty until P6/P7.

### A.4 Existing accessors (already defined — reuse, do not redefine)

- `permissions.ts`: `setReqResource` / `reqResource` / `reqResourceOptional` / `setReqResourceType` / `reqResourceType` (Phase 2).
- `publication-sites.ts`: `setReqPublicationSite` / `reqPublicationSite` (getOptional) / `setReqMainPublicationSite` / `reqMainPublicationSite` (getOptional) (Phase 2).
- `req-context.ts`: only `defineReqContext` + `reqEventLogContext` (post-pilot revision).

---

## B. Sub-PR 5a — cross-cutting accessors & coupled readers (med risk)

Branch: this worktree (off `master`). Convert the coupled `.js` files it touches (`cache-headers.js`, `thumbnails.js`) to `.ts` here. Each task ends with `npx eslint <files>` clean + `npm run check-types-ratchet` not increased, plus the named specs.

### Task A1: new `public-base-url.ts` accessor module + migrate `app.js` URL setters

**Files:**
- Create: `api/src/misc/utils/public-base-url.ts`
- Modify: `api/src/app.js:109-110` (publicBaseUrl/publicWsBaseUrl), `:126,129,132` (publication sites)

- [ ] **Step 1: Create the accessor module.** Both keep a legacyProp **for now** so every commit stays green: `publicBaseUrl` because datasets (P6) still reads it; `publicWsBaseUrl` because its reader `applications/proxy.ts:104` is not migrated until Task A6 of this same sub-PR. A6 migrates that reader and *then* drops the `publicWsBaseUrl` legacyProp. (Earlier draft defined `publicWsBaseUrl` without a legacyProp — that regressed `application.wsUrl` to `undefined` between A1 and A6; corrected here.)

```ts
// api/src/misc/utils/public-base-url.ts
// Topical home for the publicBaseUrl / publicWsBaseUrl request context
// (the per-domain public URL of data-fair, set once in app.js). See code-conventions.md §2.
import { defineReqContext } from './req-context.ts'

// publicBaseUrl keeps its legacyProp: datasets (Phase 6) still reads req.publicBaseUrl directly.
const publicBaseUrlCtx = defineReqContext<string>('publicBaseUrl', 'publicBaseUrl')
export const setReqPublicBaseUrl = publicBaseUrlCtx.set
export const reqPublicBaseUrl = publicBaseUrlCtx.get

// publicWsBaseUrl keeps its legacyProp until Task A6: applications/proxy.ts still reads
// req.publicWsBaseUrl directly. A6 migrates that reader, then drops this legacyProp.
const publicWsBaseUrlCtx = defineReqContext<string>('publicWsBaseUrl', 'publicWsBaseUrl')
export const setReqPublicWsBaseUrl = publicWsBaseUrlCtx.set
export const reqPublicWsBaseUrl = publicWsBaseUrlCtx.get
```

- [ ] **Step 2: Wire `app.js`.** Add at the top of the file with the other imports (`app.js` is ESM):

```js
const { setReqPublicBaseUrl, setReqPublicWsBaseUrl } = await import('./misc/utils/public-base-url.ts')
const { setReqPublicationSite, setReqMainPublicationSite } = await import('./misc/utils/publication-sites.ts')
```
(If `app.js` already imports `publication-sites.ts`, extend that import instead of duplicating.)

  Then in the `app.use('/', …)` block, replace the four mutations **verbatim except the LHS**:
  - `app.js:109` `req.publicBaseUrl = …` → keep the RHS, wrap: `const publicBaseUrl = mainDomain ? config.publicUrl : (reqSiteUrl(req) + '/data-fair'); setReqPublicBaseUrl(req, publicBaseUrl)`
  - `app.js:110` `req.publicWsBaseUrl = req.publicBaseUrl.replace(...)` → `setReqPublicWsBaseUrl(req, publicBaseUrl.replace('http:', 'ws:').replace('https:', 'wss:') + '/')`
  - `app.js:111` `debugDomain('req.publicBaseUrl', req.publicBaseUrl)` → `debugDomain('req.publicBaseUrl', publicBaseUrl)`
  - `app.js:126` `req.mainPublicationSite = publicationSite` → `setReqMainPublicationSite(req, publicationSite)`
  - `app.js:129` `req.publicationSite = publicationSite` → `setReqPublicationSite(req, publicationSite)`
  - `app.js:132` `req.publicationSite = publicationSite` → `setReqPublicationSite(req, publicationSite)`

  Because `setReqPublicBaseUrl` dual-writes the legacy `publicBaseUrl` prop, every un-migrated datasets/remote-services reader keeps working unchanged. `publicationSite`/`mainPublicationSite` accessors also dual-write (Phase 2 config).

- [ ] **Step 3: Verify.** `npx eslint api/src/misc/utils/public-base-url.ts api/src/app.js` → clean. `npm run check-types-ratchet` → ≤ 1550. Run `npx playwright test tests/features/applications/applications.api.spec.ts tests/features/applications/publication-sites.api.spec.ts tests/features/catalog` (publicBaseUrl + publication-site consumers) → PASS.
- [ ] **Step 4: Commit** — `git commit -am "refactor(misc): public-base-url accessor module + app.js url/site setters"`

### Task A2: `cache-headers.js` → `.ts` + host `noCache` accessor

**Files:**
- Rename + modify: `api/src/misc/utils/cache-headers.js` → `cache-headers.ts`

- [ ] **Step 1: Rename** the file to `.ts` (`git mv api/src/misc/utils/cache-headers.js api/src/misc/utils/cache-headers.ts`).
**Survey correction (found during A2):** cache-headers also reads `req.noModifiedCache` (set in `api-compat/ods/index.ts:640`, a Phase-7 file). Give it an accessor here too (cache-headers is its topical home), legacyProp `'noModifiedCache'` keeps the Phase-7 setter alive: `const noModifiedCacheCtx = defineReqContext<boolean>('noModifiedCache', 'noModifiedCache'); export const setReqNoModifiedCache = noModifiedCacheCtx.set; export const reqNoModifiedCache = noModifiedCacheCtx.getOptional`. Replace both `req.noModifiedCache` reads with `reqNoModifiedCache(req)`. Also enrich the `Resource` type (`api/types/index.ts`) by adding `'finalizedAt'` to its `Pick<Dataset, …>` (finalizedAt is on Dataset; `dateKey` is only ever `'finalizedAt'` or `'updatedAt'`) and type the `resourceBased` `dateKey` param as `'updatedAt' | 'finalizedAt'` — this lets `resource[dateKey]` / `resource.finalizedAt` type cleanly with NO cast (conventions §3.4: enrich the type, don't cast).

- [ ] **Step 2: Add the `noCache` accessor at the top** (cache-headers is its topical home per conventions §2). Import the cross-cutting readers it needs:

```ts
import config from '#config'
import { httpError } from '@data-fair/lib-utils/http-errors.js'
import type { RequestHandler } from 'express'
import debugLib from 'debug'
import { defineReqContext } from './req-context.ts'
import { reqResource, reqPublicOperation } from './permissions.ts'

const debug = debugLib('cache-headers')

// noCache request context lives here (cache-headers' topical home). The setter
// stays in datasets/middlewares (Phase 6) via the legacyProp until that phase.
const noCacheCtx = defineReqContext<boolean>('noCache', 'noCache')
export const setReqNoCache = noCacheCtx.set
export const reqNoCache = noCacheCtx.getOptional
```
  (Note: `reqResource`/`reqPublicOperation` are imported from `permissions.ts` — its topical home. `permissions.ts` does not import `cache-headers.ts`, so no cycle. `reqPublicOperation` is added to `permissions.ts` in Task A3; do A3 before A2 if executing strictly in order, or land A2 in the same review batch.)

- [ ] **Step 3: Convert the bodies, replacing only the req-context reads** (`resourceBased` and `noCache` are RequestHandlers — type them `RequestHandler`):
  - `req.noCache` (line 19) → `reqNoCache(req)`
  - `req.resource[dateKey] || req.resource.updatedAt` (line 24) → `const resource = reqResource(req); const dateStr = resource[dateKey as keyof typeof resource] ?? resource.updatedAt` (keep the `||`→`??` only if tsc requires the index signature; otherwise keep `||` and cast the key). **Preserve the exact runtime semantics** — `dateKey` defaults to `'updatedAt'`.
  - `req.publicOperation` (line 27) → `reqPublicOperation(req)`
  - `req.resource.finalizedAt`/`.updatedAt` (line 53 warn) → use the `resource` const.
  - `setNoCache(req, res)` keeps its `(req, res)` signature; `req` is unused there today — leave the param to avoid signature churn (or prefix `_req`). Pick whichever keeps eslint clean with zero behavior change.
  - `listBased` reads only `req.query` — leave as-is, just type it `RequestHandler`.
- [ ] **Step 4: Update importers if the extension is referenced.** `grep -rn "cache-headers" api/src` — fix any `cache-headers.js` import specifiers to `cache-headers.ts`.
- [ ] **Step 5: Verify.** `npx eslint api/src/misc/utils/cache-headers.ts` clean; ratchet ≤ 1550 (expect −11). `npx playwright test tests/features/datasets/query/cache-headers.api.spec.ts tests/features/applications/applications.api.spec.ts` → PASS.
- [ ] **Step 6: Commit** — `refactor(misc): cache-headers to ts, noCache accessor, accessor reads`

### Task A3: `permissions.ts` — add `bypassPermissions` + `publicOperation` accessors, convert internal reads/writes

**Files:**
- Modify: `api/src/misc/utils/permissions.ts`

- [ ] **Step 1: Add the two accessor groups** next to the existing resource/resourceType ones (after line ~25), per the conventions placement table (permissions owns resource, resourceType, bypassPermissions, publicOperation):

```ts
const bypassPermissionsCtx = defineReqContext<BypassPermissions>('bypassPermissions', 'bypassPermissions')
export const setReqBypassPermissions = bypassPermissionsCtx.set
export const reqBypassPermissions = bypassPermissionsCtx.getOptional

const publicOperationCtx = defineReqContext<boolean>('publicOperation', 'publicOperation')
export const setReqPublicOperation = publicOperationCtx.set
export const reqPublicOperation = publicOperationCtx.getOptional
```
  (`BypassPermissions` is already imported at line 3.)

- [ ] **Step 2: Convert the in-file reads/writes** (verbatim except the access). Use `reqResourceOptional` where the code already guards `req.resource` for absence (the `acceptMissing` / `if (req.resource)` paths), and `reqResource` where it is unconditionally dereferenced:
  - line 43 `if ((acceptMissing && !req.resource))` → `if (acceptMissing && !reqResourceOptional(req))`
  - line 47 `can(req.resourceType, req.resource, …, req.bypassPermissions)` → `can(reqResourceType(req), reqResourceOptional(req), …, reqBypassPermissions(req))`
  - line 51 `resourceTypesLabels[req.resourceType]` → `resourceTypesLabels[reqResourceType(req)]`
  - line 61 same shape as line 47
  - lines 63-69 `req.resource?.owner` / `req.resource.title` → bind `const resource = reqResourceOptional(req)` once at the top of that branch and use it
  - line 81 `req.publicOperation = can(req.resourceType, req.resource, …)` → `setReqPublicOperation(req, can(reqResourceType(req), reqResourceOptional(req), …))`
  - lines 84-89 `if (req.resource)` block → bind `const resource = reqResourceOptional(req)`; the `res.setHeader('x-resource', …)` and `x-owner` payloads move verbatim onto `resource`
  - line 102 `canDoForOwnerMiddleware`: `req.resource.owner` → `reqResource(req).owner` (unconditional deref today)
  - line 103 `req.resourceType` → `reqResourceType(req)`
  - line 347 `req.resource.permissions` → `reqResource(req).permissions`
  - line 363 `const resource = await req.resource` → `const resource = reqResource(req)` (the `await` on a non-promise is a no-op; **preserve it bit-for-bit** to avoid behavior change — keep `await reqResource(req)`)
  - Keep `;(req as any).operation = operation` untouched (out of scope; `operation` is not a tracked prop).
- [ ] **Step 3: Verify.** `npx eslint api/src/misc/utils/permissions.ts` clean; ratchet ≤ 1550. `npx playwright test tests/features/applications/applications.api.spec.ts tests/features/applications/publication-sites.api.spec.ts tests/features/auth/api-keys.api.spec.ts` → PASS. The datasets `req.publicOperation`/`req.resource` reads stay green via legacyProp.
- [ ] **Step 4: Commit** — `refactor(permissions): bypassPermissions/publicOperation accessors + accessor reads`

### Task A4: `api-key.ts` + `application-key.ts` — `bypassPermissions` setter & `resource` reads via accessors

**Files:**
- Modify: `api/src/misc/utils/api-key.ts:14-15`, `api/src/misc/utils/application-key.ts:18,34,154-155`

- [ ] **Step 1: `api-key.ts`.** Import `import { reqResourceOptional, setReqBypassPermissions } from './permissions.ts'`.
  - line 14 `if (req?.resource?._readApiKey && …)` → bind `const resource = req && reqResourceOptional(req)` then `if (resource?._readApiKey && (resource._readApiKey.current === rawApiKey || resource._readApiKey.previous === rawApiKey))` — preserves the `req?` optional-chaining semantics (`readApiKey`'s `req` param is optional).
  - line 15 `req.bypassPermissions = { classes: ['read'] }` → `setReqBypassPermissions(req, { classes: ['read'] })` (inside the block `req` is defined).
  - `_readApiKey` is read off `Resource` — if it is not on the `Resource` type, this is a pre-existing untyped read; keep the existing access pattern/cast verbatim (do not add new suppressions; if one is unavoidable, record it and prefer enriching the `Resource`/dataset schema — but **only if cheap**; otherwise park it).
- [ ] **Step 2: `application-key.ts`.** Import `import { reqResource, setReqBypassPermissions } from './permissions.ts'` and `import { reqPublicBaseUrl } from './public-base-url.ts'`.
  - line 18 `new URL((req as Request & { publicBaseUrl: string }).publicBaseUrl)` → `new URL(reqPublicBaseUrl(req))` (drops the inline cast).
  - line 34 `const dataset = req.resource` → `const dataset = reqResource(req)`
  - line 154 `req.bypassPermissions = matchingApplicationDataset.applicationKeyPermissions || { classes: ['read'] }` → `const bypassPermissions = matchingApplicationDataset.applicationKeyPermissions || { classes: ['read'] }; setReqBypassPermissions(req, bypassPermissions)`
  - line 155 `debug('apply bypass permissions', req.bypassPermissions)` → `debug('apply bypass permissions', bypassPermissions)`
  - `matchingHost` (line 16) takes a plain `Request`; `reqPublicBaseUrl` accepts `IncomingMessage`, so the signature is fine.
- [ ] **Step 3: Verify.** `npx eslint api/src/misc/utils/api-key.ts api/src/misc/utils/application-key.ts` clean; ratchet ≤ 1550. `npx playwright test tests/features/auth/api-keys.api.spec.ts tests/features/applications/applications.api.spec.ts tests/features/datasets/rest/rest-datasets-attachments.api.spec.ts` (the rest-attachments spec exercises the anonymous application-key crowd-sourcing write path) → PASS.
- [ ] **Step 4: Commit** — `refactor(misc): api-key/application-key use bypassPermissions + resource accessors`

### Task A5: convert the remaining coupled readers — `capture.ts`, `metadata-attachments.ts`, `query-advice.ts`, `thumbnails.js`→`.ts`

**Files:**
- Modify: `api/src/misc/utils/capture.ts`, `api/src/misc/utils/metadata-attachments.ts`, `api/src/misc/utils/query-advice.ts`
- Rename + modify: `api/src/misc/utils/thumbnails.js` → `thumbnails.ts`

- [ ] **Step 1: `capture.ts`.** Import `import { reqResource } from './permissions.ts'` and `import { reqPublicBaseUrl } from './public-base-url.ts'`.
  - All `req.resource.*` reads (lines 22, 38, 45, 61, 71, 75, 116, 125) → bind `const resource = reqResource(req)` once at the top of each function (`screenshotRequestOpts`, `printRequestOpts`, `screenshot`) and use `resource.*` verbatim.
  - line 45/75 `permissionsUtils.isPublic('applications', req.resource)` → `permissionsUtils.isPublic('applications', resource)`
  - line 153 `req.publicBaseUrl` → `reqPublicBaseUrl(req)`
  - Keep param types `RequestWithResource` (the accessors accept it).
- [ ] **Step 2: `metadata-attachments.ts`.** Import `import { reqResource, reqResourceType } from './permissions.ts'`.
  - line 20 `req.resourceType === 'applications' ? applicationAttachmentsDir(req.resource) : datasetAttachmentsDir(req.resource)` → `reqResourceType(req) === 'applications' ? applicationAttachmentsDir(reqResource(req)) : datasetAttachmentsDir(reqResource(req))`
  - lines 65-69 `req.resource.owner` / `req.resource.attachments` → bind `const resource = reqResource(req)` and use it.
- [ ] **Step 3: `query-advice.ts`.** Import `import { reqPublicOperation } from './permissions.ts'`.
  - line 141 `const adviceReq = req.publicOperation` → `const adviceReq = reqPublicOperation(req)` (preserve exact truthiness — `getOptional` returns `boolean | undefined`, same as the legacy read).
  - **Guardrail:** `query-advice.ts` exports are unit-tested (§4.2). Do not change tested signatures; this is an internal read only.
- [ ] **Step 4: `thumbnails.js` → `.ts`.** `git mv` to `.ts`. Convert the body (22 tsc errors — annotate params/locals as needed). Migrate:
  - line 105 `req.publicBaseUrl + url` → `reqPublicBaseUrl(req) + url` (import from `./public-base-url.ts`)
  - line 140 `if (req.publicOperation)` → `if (reqPublicOperation(req))` (import from `./permissions.ts`)
  - Fix the extension in importers: `grep -rn "utils/thumbnails" api/src` → repoint `.js`→`.ts`.
- [ ] **Step 5: Verify.** `npx eslint` on all four files clean; ratchet ≤ 1550 (expect a solid drop — thumbnails alone is −22). `npx playwright test tests/features/applications/applications.api.spec.ts tests/features/datasets/rest/rest-datasets-attachments.api.spec.ts tests/features/infra/query-advice.unit.spec.ts` → PASS.
- [ ] **Step 6: Commit** — `refactor(misc): capture/metadata-attachments/query-advice/thumbnails use accessors`

### Task A6: cross-module `publicBaseUrl`/`publicWsBaseUrl` readers + drop `publicWsBaseUrl` legacyProp

**Files:**
- Modify (publicBaseUrl readers, all `.ts`): `api/src/misc/routers/root.ts:20`, `api/src/applications/middlewares.ts:88`, `api/src/applications/utils.ts:64`, `api/src/admin/router.ts:69`, `api/src/catalog/router.ts:34,48,55`, `api/src/base-applications/router.ts:87`
- Modify (publicWsBaseUrl reader): `api/src/applications/proxy.ts:104`
- Modify: `api/types/index.ts:18`

- [ ] **Step 1: publicBaseUrl readers.** In each file above, `import { reqPublicBaseUrl } from '<relative>/misc/utils/public-base-url.ts'` and replace `req.publicBaseUrl` with `reqPublicBaseUrl(req)`. These are all simple argument substitutions in URL/doc builders — no logic change.
  - **Leave `datasets/*` untouched** (Phase 6; legacyProp keeps them green).
  - **Leave `remote-services/router.js` untouched** — parked deprecation-bound `.js`; its 4 `req.publicBaseUrl` reads ride the legacyProp (which is NOT dropped). Record this in the close-out.
  - **Leave `api-compat/ods/index.ts:559`** — the only occurrence is a commented-out line; skip.
- [ ] **Step 2: publicWsBaseUrl reader.** `api/src/applications/proxy.ts:104` `application.wsUrl = (req as Request).publicWsBaseUrl` → `application.wsUrl = reqPublicWsBaseUrl(req)` (import from `../misc/utils/public-base-url.ts`). This was the sole reader.
- [ ] **Step 3: Drop the `publicWsBaseUrl` legacyProp now that its sole reader is migrated.**
  - In `public-base-url.ts`, change `defineReqContext<string>('publicWsBaseUrl', 'publicWsBaseUrl')` → `defineReqContext<string>('publicWsBaseUrl')` (remove the legacyProp arg) and update the comment to say the legacyProp is dropped (setter app.js + reader proxy.ts both go through the accessor now).
  - In `api/types/index.ts:18`, drop `publicWsBaseUrl` from the `Request` type: `export type Request = ExpressRequest & { query: Record<string, string> } & { publicBaseUrl: string }`.
- [ ] **Step 4: Grep-verify.** `grep -rnE "req\.publicWsBaseUrl|\.publicWsBaseUrl" api/src` → only the accessor module and `app.js` setter remain (both via the accessor). `grep -rn "publicWsBaseUrl" api/types` → empty.
- [ ] **Step 5: Verify.** `npx eslint` on all touched files clean; ratchet ≤ 1550. `npx playwright test tests/features/applications tests/features/catalog tests/features/admin` → PASS (no dedicated `base-applications` feature dir — its `clean()` output is covered via the applications/embed specs).
- [ ] **Step 6: Commit** — `refactor(misc): publicBaseUrl readers to accessor; drop publicWsBaseUrl legacy`

### Task A7: 5a close-out

- [ ] **Step 1: Grep audit — what migrated, what is intentionally still legacy.** Record the output in this doc's execution record:

```bash
# setters still on legacy (expected: only datasets P6 + api-compat P7)
grep -rnE "req\.(resource|resourceType|bypassPermissions|publicOperation|noCache|publicBaseUrl|publicationSite|mainPublicationSite) *=[^=]" api/src
# coupled misc readers should be gone (expected: empty)
grep -rnE "req\.(resource|resourceType|bypassPermissions|publicOperation|noCache|publicBaseUrl) *[).;\[]" api/src/misc
```
  Expected remaining setters: `datasets/middlewares.js` (resource, noCache), `datasets/router.js:84` (resourceType), `api-compat/ods` (resourceType), `app.js` (the accessor-wrapped ones now read as `setReq*`, not raw assignment). No raw `req.<prop> =` should remain in any `.ts` file under `misc`, `applications`, `catalog`, `admin`, `base-applications`.
- [ ] **Step 2:** `npm run lint && npm run check-types-ratchet` → clean; commit the improved `dev/type-errors-baseline.txt`.
- [ ] **Step 3:** Definition-of-done checklist (master plan §10). Push (husky runs full `npm run quality`). Open PR. Record actual LOC/effort + the final ratchet number in the execution record below.

---

## C. Sub-PR 5b — bulk generic `.js` → `.ts` conversions + junk-drawer classification (low risk)

Branch off `master` **after 5a merges** (avoids churn collisions on shared imports). Each conversion is a pure `.js`→`.ts` rename + minimal type annotations to clear that file's tsc errors; **no logic changes**. Group several trivial files per commit; keep each commit's `npx eslint` clean and ratchet non-increasing. None of these read/write req context.

### Task B1: high-error pure utils

**Files (rename `.js`→`.ts`, annotate to clear errors):** `icalendar.js` (53), `markdown.js` (12), `csv-sniffer.js` (10), `batch-stream.js` (10), `assert-immutable.js` (10), `cache.js` (8), `decode-stream.js` (7).

- [ ] **Step 1:** For each file: `git mv …js …ts`; run `npx tsc 2>&1 | grep '<file>.ts'` and add the minimal annotations to clear each reported error (typical: TS7006 param types, TS7034 implicit-any locals, missing return types). Do **not** restructure code; bodies stay verbatim.
- [ ] **Step 2:** Fix importer extensions: after each rename, `grep -rn "utils/<name>" api/src` and repoint `.js`→`.ts` specifiers.
- [ ] **Step 3:** `npx eslint` the converted files clean; `npm run check-types-ratchet` strictly decreasing after each commit.
- [ ] **Step 4: Commit** in 2-3 logical groups (e.g. `refactor(misc): icalendar/markdown to ts`, `refactor(misc): stream utils (batch/decode/csv-sniffer) to ts`, `refactor(misc): cache/assert-immutable to ts`).

### Task B2: low-error pure utils

**Files:** `heap.js` (6), `geohash.js` (6), `exec.js` (6), `promisify-middleware.js` (5), `expect-type.js` (5), `visibility.js` (3), `licenses.js` (3), `find.js` (3), `service-workers.js` (2), `bytes.js` (2), plus any remaining 0-error `.js` worth finishing (`axios.js`, `http-agents.js`, `bom.js`, `nanoid.js`) **only if** their conversion is trivial and clears importer-side `.js` specifiers cleanly.

- [ ] **Step 1:** Same mechanical process as B1. **`find.js` guardrail:** it is imported widely (and `find.js:567` has a stale `req[resourceType] = req.resource =` *comment* — leave the comment verbatim; it documents legacy mutation, no code). `find.js` is a pure query builder — convert types only.
- [ ] **Step 2:** Importer-extension fixes after each rename (`grep -rn "utils/<name>"`).
- [ ] **Step 3:** eslint clean; ratchet strictly decreasing.
- [ ] **Step 4: Commit** in logical groups.

### Task B3: `dcat/normalize.js` + `dcat/validate.js` → `.ts` (unit-test-imported — update spec imports same PR)

**Files:**
- Rename + modify: `api/src/misc/utils/dcat/normalize.js` → `.ts`, `api/src/misc/utils/dcat/validate.js` → `.ts`
- Modify (importers): `api/src/misc/routers/test-env.ts:298`, `tests/features/infra/dcat.unit.spec.ts:5-6`

- [ ] **Step 1:** `git mv` both files to `.ts`; annotate to clear their 4 + 2 errors. Keep `export default` shape (both are `import … default`).
- [ ] **Step 2: Update the import specifiers in the same commit** (allowed superficial change per §4.1):
  - `tests/features/infra/dcat.unit.spec.ts:5` `'…/dcat/normalize.js'` → `'…/dcat/normalize.ts'`
  - `tests/features/infra/dcat.unit.spec.ts:6` `'…/dcat/validate.js'` → `'…/dcat/validate.ts'`
  - `api/src/misc/routers/test-env.ts:298` `import('../utils/dcat/validate.js')` → `import('../utils/dcat/validate.ts')`
- [ ] **Step 3:** `npx playwright test tests/features/infra/dcat.unit.spec.ts` → PASS (assertions unchanged). `npx eslint` clean; ratchet decreasing.
- [ ] **Step 4: Commit** — `refactor(misc): dcat normalize/validate to ts (+ spec import paths)`

### Task B4: junk-drawer classification note

**Files:**
- Modify: `docs/architecture/code-conventions.md` (append a short "misc/utils classification" subsection)

- [ ] **Step 1:** Add a table classifying each remaining `misc/utils` member as **generic (stays)** vs **domain-in-disguise (target module recorded, move deferred)**. From the survey, domain-in-disguise candidates to record (do **not** move — bulk relocation is a later, optional phase): `publication-sites.ts` (→ a publication-sites module), `journals.ts` (→ journals/events), `notifications.ts` (→ notifications), `webhooks.ts` (→ webhooks), `topics.ts`, `licenses.ts`, `metrics*.ts`. Generic (stay): `find.js`→ts, `ajv.ts`, `bytes`, `nanoid`, `axios`, `http-agents`, `pipe`, `heap`, `geohash`, `batch-stream`, `decode-stream`, `bom`, `markdown`, `icalendar`, `csv-sniffer`, `xlsx`, `exec`, `cache`, `assert-immutable`, `expect-type`, `promisify-middleware`, `compute-budget`, `query-advice`, `service-workers`, `unzip`, `visibility`, `dcat/*`.
- [ ] **Step 2: Commit** — `docs: classify misc/utils generic vs domain-in-disguise`

### Task B5: 5b close-out

- [ ] **Step 1:** `find api/src/misc/utils -name '*.js'` — confirm only intentionally-deferred files remain (record the list). The target is a near-empty `.js` set in `misc/utils`.
- [ ] **Step 2:** `npm run lint && npm run check-types-ratchet` → clean; commit improved baseline. Push (husky `npm run quality`). PR. Record final ratchet + remaining `.js` list below.

---

## D. Definition of done (per sub-PR — master plan §10)

- [ ] API/e2e specs untouched and green; unit specs: only `dcat` import-path edits (Task B3)
- [ ] `npm run check-types-ratchet` improved; `dev/type-errors-baseline.txt` updated and committed
- [ ] Zero suppressions added; module suppression count reduced where touched (target 0)
- [ ] In touched modules: express imports only in router/middlewares; no raw `req` mutation in any `.ts` under misc/applications/catalog/admin/base-applications (accessors only); no cross-module import of any `router.ts`/`middlewares.ts`
- [ ] Touched `.js` files converted to `.ts`; importer extensions repointed
- [ ] Mount order and middleware chain order in `app.js` preserved exactly
- [ ] Parking lot updated with anything suspicious found (never fixed inline)
- [ ] `npm run quality` passes locally (husky enforces on push)
- [ ] Execution record below updated with actual size/effort + final ratchet (calibrates Phase 6)

## E. Parking lot candidates to watch for during execution

- Any `req.resource` read that is unconditional today but should tolerate absence (or vice-versa) — preserve the exact `reqResource` vs `reqResourceOptional` choice that matches current runtime behavior; if the current behavior looks buggy, **park it**, do not switch.
- `permissions.ts:363` `await req.resource` on a non-promise — preserved as `await reqResource(req)` (no-op await). If confirmed pointless, park a cleanup.
- `api-key.ts` `_readApiKey` typing gap — ALREADY RESOLVED: `Resource` carries `& { _readApiKey?: { current, previous } }` in `api/types/index.ts`. No action needed in A4.
- **(parked, found in A5)** `query-advice.ts` now imports `permissions.ts` (for `reqPublicOperation`), which eagerly validates `#config`/`#mongo` at module load. Its unit test (`query-advice.unit.spec.ts`) still passes under the standard `NODE_CONFIG_DIR` harness, but the module can no longer load in a bare Node context. Do NOT "fix" by relocating accessors out of their topical home (`permissions.ts`) — that violates the placement-table convention. The convention-respecting fix, if ever pursued, is to make `permissions.ts` config validation lazy (not at import time). Low priority; the test passes. Related: [[feedback_unit_tests_pure_functions]].
- **(parked, found in A2)** `cache-headers.ts:39` `new Date(resource[dateKey] || resource.updatedAt)` is `string | undefined` because `Dataset.updatedAt`/`finalizedAt` are optional in the generated types — `new Date(undefined)` has no overload (TS2769). Runtime is fine (datasets always have updatedAt). Not suppressible without a `!`/cast (forbidden). Park: fix by making `updatedAt` required in the dataset schema, or guard. Also parked: the 4 `req.query` ParsedQs reads in cache-headers handlers (lines 65/84/86) — directly-mounted middleware MUST keep express `RequestHandler` typing (the sibling `permissions.ts` project-`Request` typing only works because its call sites cast `as RequestHandler`, which is Phase-6 router scope here). Revisit when the cache-headers handlers can be re-exported through a `RequestHandler`-cast factory during Phase 6.

---

## Execution record

*(fill in after each sub-PR: commits, files, +/− LOC, ratchet before→after, specs run, anything parked)*
</content>
</invoke>
