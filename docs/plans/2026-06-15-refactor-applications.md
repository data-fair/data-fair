# Phase 4 — applications (router.js + proxy.js + service.js → ts, express-decoupled)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan
> task-by-task (chosen by the user on 2026-06-15). Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Expands the Phase 4 brief of the [master plan](2026-06-10-code-quality-refactor.md §8.3). Follows
> [code-conventions.md](../architecture/code-conventions.md). Read
> [application-keys.md](../architecture/application-keys.md) first — `proxy.js` is one of the two
> application-key enforcement points; its `setResource` matching logic and the proxy gate are
> security-load-bearing and must move **verbatim**.

**Goal:** Convert the `applications` module to the house pattern — `router.ts`/`proxy.ts` as thin
adapters, a new `middlewares.ts` (symbol-keyed request context), an expanded express-free
`service.ts`, and a new pure `operations.ts` — with **zero behavior change** and the API/e2e test
contract untouched.

**Architecture:** `router → middlewares → service → operations`. The five req-mutation props this
module sets (`application`, `baseApp`, `isNewApplication`, `matchingApplicationKey`, plus the
cross-cutting `resource`/`resourceType`) become symbol accessors. I/O orchestration (mongo / files /
events / journals / HTML fetch) moves into `service.ts` with explicit typed params. The parse5 DOM
assembly in the proxy stays in `proxy.ts` (intrinsic response shaping); only its genuinely pure,
self-contained pieces (manifest object, login HTML) move to `operations.ts`.

**Tech Stack:** Node 24, Express 5, TypeScript strict + checkJs, `@data-fair/lib-express` /
`lib-node` / `lib-utils`, df-build-types, Playwright (unit + api + e2e). Ratchet:
`npm run check-types-ratchet` (baseline currently **1748**).

**Size estimate:** L. Master-plan expected tsc delta ≈ **−216** (router.js 122 + proxy.js 79 +
utils.ts 16 errors, minus residual `publicBaseUrl`/`publicWsBaseUrl` TS2339 that stay until Phase 5).
21 suppressions to remove (router.js 14, proxy.js 7). One worktree, one PR, multiple commits.

---

## 0. Module target structure

```
applications/
  router.ts        # was router.js — thin adapters, mounts at /api/v1/applications
  proxy.ts         # was proxy.js — thin adapters + parse5 response shaping, mounts at /app
  middlewares.ts   # NEW — accessors + readApplication / readBaseApp / setResource / attemptInsert
  service.ts       # was service.js — find + all CRUD/config/keys/error/owner I/O + proxy I/O helpers
  operations.ts    # NEW — pure: setUniqueRefs, buildManifest, buildLoginHtml
  utils.ts         # UNCHANGED (clean, refreshConfigDatasetsRefs, dir, attachment*, updateStorage)
  resources/login.html  # UNCHANGED
```

`utils.ts` stays as-is: `attachmentsDir` is imported by `misc/utils/metadata-attachments.ts:8`
(keep the export). `refreshConfigDatasetsRefs(req, …)` still takes `req` — it reads
`req.publicBaseUrl` and `reqSession(req)`; decoupling it is **out of scope** (it belongs with the
publicBaseUrl/dataset-context phases). Routers keep calling it with `req`.

### Accessors created in this phase (`applications/middlewares.ts`)

Per conventions §2, module-local accessors sit next to the middleware that sets them. All four are
applications-internal (no reader outside `applications/`), so they use `legacyProp` dual-write while
the router and proxy migrate across separate tasks, and the `legacyProp` argument is **dropped in the
close-out task** (Task 7) once the greps are empty.

| Accessor | Type | get/opt | legacyProp |
|---|---|---|---|
| `setReqApplication` / `reqApplication` | `Application` | `get` (throws) | `'application'` |
| `setReqBaseApp` / `reqBaseApp` | `BaseApp` | `get` (throws) | `'baseApp'` |
| `setReqIsNewApplication` / `reqIsNewApplication` | `boolean` | `getOptional` | `'isNewApplication'` |
| `setReqMatchingApplicationKey` / `reqMatchingApplicationKey` | `string` | `getOptional` | `'matchingApplicationKey'` |

Reused from their existing topical homes (do **not** redefine): `setReqResource` /
`setReqResourceType` from `misc/utils/permissions.ts`; `reqPublicationSite` /
`reqMainPublicationSite` from `misc/utils/publication-sites.ts` (both `getOptional`). Their
`legacyProp` stays (datasets still mutates `resource`/`resourceType`).

**`setReqApplication` does not chain other setters.** Where the legacy code did
`req.resource = req.application = application` (router `readApplication`, proxy `setResource`), the
migrated middleware calls all three setters explicitly:
`setReqResourceType(req, 'applications'); setReqResource(req, application); setReqApplication(req, application)`.

### publicBaseUrl / publicWsBaseUrl

Read **directly** as `req.publicBaseUrl` / `req.publicWsBaseUrl`, exactly as `catalog/router.ts` and
`remote-services/router.js` do today. `Request` (`api/types/index.ts:18`) already types
`publicBaseUrl: string`. `publicWsBaseUrl` is read once (proxy `req.application.wsUrl = req.publicWsBaseUrl`)
and is **not** on `Request` — add `& { publicWsBaseUrl: string }` to the `Request` type in Task 6
(type enrichment, not a suppression; removed when the accessor lands in Phase 5, same trajectory as
`publicBaseUrl`). The residual `publicBaseUrl` TS2339 reads remain baseline errors until Phase 5 — do
**not** try to fix them here.

### Typed request in handlers

Express types handler `req` as `express.Request`. To read `req.publicBaseUrl`/`req.query` as
`Record<string,string>` the converted modules cast the handler req to `#types` `Request` at the point
of use, mirroring `catalog/router.ts` (which accesses `req.publicBaseUrl` and accepts the residual
TS2339). Prefer the accessor functions for everything they cover; only `publicBaseUrl`/`query`/
`publicWsBaseUrl`/`getLocale()` are read off `req` directly.

---

## Task 1 — `applications/operations.ts` (pure) + unit spec

**Files:**
- Create: `api/src/applications/operations.ts`
- Create: `tests/features/applications/applications-operations.unit.spec.ts`
- Modify: none yet (extraction wired in later tasks)

Move bodies **verbatim** from the source files (substitutions listed); these are pure (no I/O, no `req`).

- [ ] **Step 1: Create `operations.ts` with three pure functions**

  - `setUniqueRefs(application)` — from `router.js:49-54`, body verbatim. Typed
    `(application: Application) => void`.
  - `buildManifest(application, baseApp, publicBaseUrl)` — the manifest object literal from
    `proxy.js:89-110`. Signature `(application: Application, baseApp: { id: string }, publicBaseUrl: string) => Record<string, any>`.
    Body is the object passed to `res.send({...})`; the `iconUrl` construction (`proxy.js:100-108`)
    moves verbatim. The `res.setHeader('Content-Type', …)` and the `baseApp` lookup stay in the proxy
    handler.
  - `buildLoginHtml(loginHtml, { siteUrl, application, applicationId, error })` — from `proxy.js:118-129`.
    `loginHtml` (the template string) is passed in (the `fs.readFileSync` stays a module const in
    `proxy.ts`). Returns the assembled HTML string. The `authUrl`/`logoUrl` `new URL(...)` building
    and the three `.replace(...)` calls move verbatim; `escapeHtml` is imported here.

  Imports: `import type { Application, BaseApp } from '#types'`, `import escapeHtml from 'escape-html'`.

- [ ] **Step 2: Write the unit spec** (style: `@playwright/test` + `node:assert/strict`, as in
  `tests/features/settings/settings-operations.unit.spec.ts`):

```ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { setUniqueRefs, buildManifest, buildLoginHtml } from '../../../api/src/applications/operations.ts'

test.describe('applications operations', () => {
  test('setUniqueRefs: id only when slug === id', () => {
    const app: any = { id: 'a', slug: 'a' }
    setUniqueRefs(app)
    assert.deepEqual(app._uniqueRefs, ['a'])
  })
  test('setUniqueRefs: id + slug when they differ', () => {
    const app: any = { id: 'a', slug: 'my-app' }
    setUniqueRefs(app)
    assert.deepEqual(app._uniqueRefs, ['a', 'my-app'])
  })
  test('setUniqueRefs: no refs without slug', () => {
    const app: any = { id: 'a' }
    setUniqueRefs(app)
    assert.equal(app._uniqueRefs, undefined)
  })
  test('buildManifest: standalone names + scope from exposedUrl', () => {
    const app: any = { title: 'T', description: 'D', exposedUrl: 'https://h/data-fair/app/a' }
    const m = buildManifest(app, { id: 'base' }, 'https://h/data-fair')
    assert.equal(m.name, 'T')
    assert.equal(m.short_name, 'T')
    assert.equal(m.display, 'standalone')
    assert.equal(m.start_url, '/data-fair/app/a/')
    assert.equal(m.scope, '/data-fair/app/a/')
    assert.equal(m.icons.length, 7)
    assert.ok(m.icons[0].src.includes('/api/v1/base-applications/base/icon'))
  })
  test('buildLoginHtml: substitutes auth route, logo and empty error', () => {
    const tpl = '<a href="{AUTH_ROUTE}"><img src="{LOGO}">{ERROR}</a>'
    const html = buildLoginHtml(tpl, {
      siteUrl: 'https://h', application: { owner: { type: 'organization', id: 'o' } } as any,
      applicationId: 'a', error: undefined
    })
    assert.ok(html.includes('/simple-directory/api/auth/password'))
    assert.ok(html.includes('redirect=https%3A%2F%2Fh%2Fdata-fair%2Fapp%2Fa'))
    assert.ok(html.includes('org=o'))
    assert.ok(html.includes('/avatars/organization/o/avatar.png'))
    assert.ok(!html.includes('{ERROR}'))
  })
  test('buildLoginHtml: renders error paragraph when error present', () => {
    const tpl = '{ERROR}'
    const html = buildLoginHtml(tpl, {
      siteUrl: 'https://h', application: { owner: { type: 'user', id: 'u' } } as any,
      applicationId: 'a', error: 'bad'
    })
    assert.ok(html.includes('color:red'))
    assert.ok(html.includes('bad'))
  })
})
```

  Note while moving `buildManifest`/`buildLoginHtml`: confirm the assertion expectations against the
  real source — they encode the moved behavior, so if a detail differs (e.g. exact query-param
  encoding), **fix the test to match the verbatim source**, never the source to match the test.

- [ ] **Step 3: Run** — `npx playwright test tests/features/applications/applications-operations.unit.spec.ts` → PASS.
- [ ] **Step 4: Lint** — `npx eslint api/src/applications/operations.ts tests/features/applications/applications-operations.unit.spec.ts` → clean.
- [ ] **Step 5: Commit** — `refactor(applications): extract pure operations module`

---

## Task 2 — `applications/middlewares.ts` (accessors + context middlewares)

**Files:**
- Create: `api/src/applications/middlewares.ts`
- Modify: none yet (consumed in Tasks 4/5)

- [ ] **Step 1: Create the accessors** (the four in the table above):

```ts
import { type RequestHandler } from 'express'
import mongo from '#mongo'
import * as findUtils from '../misc/utils/find.js'
import { clean as cleanBaseApp } from '../base-applications/operations.ts'
import { setReqResource, setReqResourceType } from '../misc/utils/permissions.ts'
import { reqPublicationSite, reqMainPublicationSite } from '../misc/utils/publication-sites.ts'
import { defineReqContext } from '../misc/utils/req-context.ts'
import type { Application, BaseApp, Request } from '#types'

const application = defineReqContext<Application>('application', 'application')
export const setReqApplication = application.set
export const reqApplication = application.get

const baseApp = defineReqContext<BaseApp>('baseApp', 'baseApp')
export const setReqBaseApp = baseApp.set
export const reqBaseApp = baseApp.get

const isNewApplication = defineReqContext<boolean>('isNewApplication', 'isNewApplication')
export const setReqIsNewApplication = isNewApplication.set
export const reqIsNewApplication = isNewApplication.getOptional

const matchingApplicationKey = defineReqContext<string>('matchingApplicationKey', 'matchingApplicationKey')
export const setReqMatchingApplicationKey = matchingApplicationKey.set
export const reqMatchingApplicationKey = matchingApplicationKey.getOptional
```

- [ ] **Step 2: Move `readApplication` and `readBaseApp` middlewares** from `router.js:171-192`, bodies
  verbatim except the req-mutation → accessor substitutions:

  - `readApplication`: `const publicationSite = req.publicationSite` → `const publicationSite = reqPublicationSite(req)`;
    `const mainPublicationSite = req.mainPublicationSite` → `reqMainPublicationSite(req)`; the trailing
    `req.resourceType = 'applications'` + `req.resource = req.application = application` block →
    `setReqResourceType(req, 'applications'); setReqResource(req, application); setReqApplication(req, application)`.
    The `findUtils.getByUniqueRef(...)` call and the 404 (`res.status(404).send(req.__('errors.missingApp'))`)
    stay verbatim. Type it `RequestHandler`.
  - `readBaseApp`: `req.baseApp = await mongo.db.collection('base-applications').findOne(...)` →
    `const baseApp = await mongo.baseApplications.findOne({ url: reqApplication(req).url }); … setReqBaseApp(req, baseApp)`.
    The 404 + `cleanBaseApp(req.publicBaseUrl, baseApp)` stay (read `req.publicBaseUrl` directly).
    `req.application.url` → `reqApplication(req).url`.

- [ ] **Step 3: Type-check the new file in isolation** — `npx tsc 2>&1 | grep 'applications/middlewares'`
  → only residual `publicBaseUrl` TS2339 acceptable; no other errors, no `@ts-ignore`.
- [ ] **Step 4: Lint** — `npx eslint api/src/applications/middlewares.ts` → clean.
- [ ] **Step 5: Commit** — `refactor(applications): typed request context + read middlewares`

  (Note: `router.js` still defines its own `readApplication`/`readBaseApp` at this point; they are
  swapped to imports in Task 4. The duplicate is transient within the branch and never shipped.)

---

## Task 3 — `applications/service.ts` (express-free I/O)

**Files:**
- Modify/rename: `api/src/applications/service.js` → `api/src/applications/service.ts`
- Test: `tests/features/applications/*.api.spec.ts` (must stay green, untouched)

`findApplications` (existing, 82 lines) stays; convert the JSDoc `@param` block to TS params. All
moved bodies come **verbatim** from `router.js`/`proxy.js` with `req` reads replaced by explicit
params. Define the shared write context near the top:

```ts
import { type SessionState, type SessionStateAuthenticated } from '@data-fair/lib-express'
import { type LogContext } from '../misc/utils/req-context.ts'
import type { Application, AppConfig } from '#types'

export type ApplicationWriteContext = {
  sessionState: SessionStateAuthenticated
  logCtx: LogContext
}
```

`logCtx` replaces every `{ req, account }` in `eventsLog.*`; `sessionState` replaces
`reqSessionAuthenticated(req)` / `await session.req(req)` (the two `session.req(req)` call sites in
PUT/PATCH/DELETE/owner/keys resolve the same authenticated session — pass `ctx.sessionState`).
`eventsQueue.pushEvent(event, sessionState)` → `eventsQueue.pushEvent(event, ctx.sessionState)`.

- [ ] **Step 1: Move the helpers** (verbatim):
  - `curateApplication(application: Application)` — `router.js:56-76`.
  - `syncDatasets(newApp, oldApp = {})` — `router.js:79-85`.
  - `initNewApplication(body, owner, user, id?)` — from `initNew` `router.js:99-110`. Substitutions:
    `application.owner = usersUtils.owner(req)` → `application.owner = owner`;
    `const user = reqUserAuthenticated(req)` removed (passed in); `const application = { ...req.body }`
    → `const application = { ...body }`. Calls `curateApplication`. Returns the application object.
    Validation (`returnValid`) stays in the **router** (boundary), which passes the validated body.

- [ ] **Step 2: Move the CRUD/config/keys/error I/O** as service functions (one per route handler
  body, verbatim with the `req`→param substitutions above):

  | Service fn | Source range | Notes |
  |---|---|---|
  | `createApplication(ctx, application)` | `router.js:118-166` | id gen, `initFrom` copy, slug+insert loop, eventsLog/journal/sendResourceEvent; returns the inserted `application`. `permissions.*` imported in service (already a dependency). |
  | `tryInsertApplication(ctx, newApplication): Promise<boolean>` | `router.js:240-255` | the insert-or-fall-through from `attemptInsert`; returns `true` if inserted (was `req.isNewApplication = true`), `false` on 11000 conflict. The `permissions.canDoForOwner` gate stays at the **caller** in the middleware (Task 2/4) — only the insert+journal+event move here. |
  | `replaceApplication(ctx, existingApplication, newApplication, isNew)` | `router.js:259-286` | preserves readonly keys, updatedAt/By, `created=true`, conditional eventsLog+eventsQueue when `!isNew`, `replaceOne`. Returns `newApplication`. |
  | `patchApplication(ctx, application, patch)` | `router.js:297-350` | curate, `publicationSites.applyPatch`, `findOneAndUpdate` (+dupSlug 400), eventsLog/eventsQueue, `syncDatasets`. Returns patched app. The `patch.image` publicBaseUrl strip (302-305) and `returnValid` stay in the **router** (it reads `req.publicBaseUrl` and validates the body). |
  | `changeApplicationOwner(ctx, application, newOwner)` | `router.js:357-420` | full owner-transfer state machine incl. the `applications-keys` owner sync (399-400) and the two eventsQueue pushes; returns patched app. The `canDoForOwner` 403 gate stays in the router. |
  | `deleteApplication(ctx, application)` | `router.js:426-456` | deletes app/journal/keys docs, capture file, dir, eventsLog/eventsQueue, `syncDatasets`. |
  | `writeApplicationConfig(ctx, application, appConfig)` | `router.js:471-500` | `$unset`+`$set`, eventsLog, journal, `syncDatasets({ configuration: … })`. The `returnValid` stays in router. |
  | `writeConfigDraft(ctx, application, appConfig)` | `router.js:514-538` | `$unset errorMessageDraft` + `$set`, eventsLog, journal. |
  | `deleteConfigDraft(ctx, application)` | `router.js:539-563` | `$unset` draft fields, status reset, eventsLog, journal. |
  | `getApplicationJournal(application)` | `router.js:580-589` | findOne journal, reverse events; returns array. |
  | `declareApplicationError(application, message, draftMode)` | `router.js:601-608` | the draft vs non-draft branch (updateOne + wsEmitter.emit / updateOne + journal). The `message` (sanitizeHtml) + `draftMode` (referer parse) computation stays in the router; the empty-message 400 stays in the router. |
  | `getApplicationKeys(applicationId)` | `router.js:621-622` | findOne `applications-keys`, return `keys || []`. |
  | `writeApplicationKeys(ctx, application, keys)` | `router.js:628-645` | nanoid fill, `replaceOne` upsert, eventsLog, eventsQueue. `validateKeys(req.body)` (ajv) stays in the router boundary. |

- [ ] **Step 3: Move the proxy I/O helpers** into `service.ts` (verbatim, `req`→params):
  - `matchApplicationKey(application, applicationKeyId, ownerFilter): Promise<boolean>` — from
    `proxy.js:55-72`. Returns `true` when the key matches the app directly or via a parent app
    (the two branches that set `req.matchingApplicationKey`). **Security-critical — move the two
    queries and the `ownerFilter` exactly.**
  - `getManifestBaseApp(url)` — `proxy.js:86` (`findOne({ url }, { projection: { id: 1, meta: 1 } })`).
  - `getProxyBaseAppAndLimits(application, applicationUrl, accessFilter)` — the `Promise.all` from
    `proxy.js:222-225` (limits + base-app with `$or: accessFilter`).
  - `fetchHTML(cleanApplicationUrl, targetUrl)` — `proxy.js:133-164` verbatim (module-level
    `htmlCache` object moves with it; keep it module-private in `service.ts`).

- [ ] **Step 4: Run the api specs** — `npx playwright test tests/features/applications` → PASS
  (service is not yet wired into the routers; this only verifies the rename/compile didn't break the
  existing `findApplications` consumer path via `router.js`'s import, which Task 4 repoints).
  If dev infra is down locally, rely on husky at push and proceed; record that here.
- [ ] **Step 5: Lint + ratchet** — `npx eslint api/src/applications/service.ts` clean;
  `npm run check-types-ratchet` not-worse.
- [ ] **Step 6: Split if needed** — if `service.ts` exceeds ~500 lines, split per conventions §1 into
  `service.ts` (find + CRUD + config + keys + error + owner) and `service/proxy.ts`
  (`matchApplicationKey`, `getManifestBaseApp`, `getProxyBaseAppAndLimits`, `fetchHTML`, `htmlCache`),
  re-exported or imported directly by `proxy.ts`. Decide at implementation time; note the outcome.
- [ ] **Step 7: Commit** — `refactor(applications): express-free service layer`

---

## Task 4 — `applications/router.ts` (thin adapters)

**Files:**
- Rename: `api/src/applications/router.js` → `api/src/applications/router.ts`
- Modify: `api/src/app.js:145` (`./applications/router.js` → `./applications/router.ts`)
- Test: `tests/features/applications/applications.api.spec.ts`, `publication-sites*.api.spec.ts`

- [ ] **Step 1: Rewrite handlers as thin adapters.** Each route keeps its **exact path, method, and
  middleware-chain order** (load-management + permission gates depend on it). Replace inline bodies
  with: input validation/narrowing (`returnValid`, the §2 path-param idiom), build
  `ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }`, call the
  matching `service.*`, `res.send(...)`. Representative shape (PATCH):

```ts
import { reqEventLogContext } from '../misc/utils/req-context.ts'
import { reqSessionAuthenticated } from '@data-fair/lib-express'
import { readApplication, readBaseApp, reqApplication, reqBaseApp, setReqIsNewApplication, reqIsNewApplication } from './middlewares.ts'
import * as service from './service.ts'
import type { Request } from '#types'
// …
router.patch('/:applicationId', readApplication, permissions.middleware('writeDescription', 'write'),
  (req, res, next) => req.body.publications ? permissionsWritePublications(req, res, next) : next(),
  async (req, res) => {
    const application = reqApplication(req)
    const { body: patch } = (await import('#doc/applications/patch-req/index.js')).returnValid(req)
    if (patch.image?.startsWith((req as Request).publicBaseUrl)) patch.image = patch.image.slice((req as Request).publicBaseUrl.length)
    const ctx = { sessionState: reqSessionAuthenticated(req), logCtx: reqEventLogContext(req) }
    const patched = await service.patchApplication(ctx, application, patch)
    res.status(200).json(clean(patched, (req as Request).publicBaseUrl, reqPublicationSite(req)))
  })
```

  Per-route mapping (all keep their chains verbatim; only the handler body becomes a service call):
  - top `router.use` setting `req.resourceType='applications'` (`router.js:43-47`) →
    `router.use((req, res, next) => { setReqResourceType(req, 'applications'); next() })`.
  - `GET ''` (88-97) → `findApplications(...)` (unchanged call; reads `reqPublicationSite`,
    `req.publicBaseUrl`).
  - `POST ''` (113-168) → validate+`usersUtils.owner(req)`+`reqUserAuthenticated(req)` →
    `service.initNewApplication(body, owner, user)` then `service.createApplication(ctx, app)`;
    the `permissions.canDoForOwner` 403 gate stays in the handler. `clean(...)` stays.
  - `permissions` sub-router mount (220-223) → unchanged (uses `readApplication`,
    `reqSessionAuthenticated`).
  - `GET /:applicationId` (226-229) → set `userPermissions`, `clean`. `reqApplication(req)`.
  - `attemptInsert` (232-257) → middleware in `middlewares.ts` (move in this task): calls
    `permissions.canDoForOwner` then `service.tryInsertApplication`; on insert sets
    `setReqIsNewApplication(req, true)` + does the journal/event (those are in
    `service.tryInsertApplication`). On not-inserted → `next()`.
  - `PUT /:applicationId` (258-287) → `service.replaceApplication(ctx, reqApplication(req), req.body, !!reqIsNewApplication(req))`.
  - `PATCH` (292-352) → as shown above.
  - `PUT /:applicationId/owner` (355-421) → `canDoForOwner` 403 gate stays; `service.changeApplicationOwner(ctx, app, req.body)`.
  - `DELETE` (424-457) → `service.deleteApplication(ctx, app)`; `res.sendStatus(204)`.
  - `getConfig` (460-463) → unchanged (calls `refreshConfigDatasetsRefs(req, …)` — stays req-coupled).
  - `writeConfig` (469-503) → validate → `service.writeApplicationConfig(ctx, app, appConfig)`.
  - draft GET/PUT/DELETE (506-563) → `service.writeConfigDraft` / `service.deleteConfigDraft`; GET stays
    (calls `refreshConfigDatasetsRefs`).
  - `GET /base-application` (565-567) → `readBaseApp` middleware + `cleanBaseApp(req.publicBaseUrl, reqBaseApp(req), …)`.
  - `GET /api-docs.json` (569-573) → keep inline settings findOne + `applicationAPIDocs` (small, app-doc shaping; reads `reqApplication(req).owner`).
  - `GET /status` (575-577), `GET /journal` (579-590 → `service.getApplicationJournal`), `POST /error`
    (593-610 → sanitize+draftMode in handler, `service.declareApplicationError`), capture/print
    (612-617 unchanged), keys GET/POST (620-648 → `service.getApplicationKeys`/`writeApplicationKeys`,
    `validateKeys` stays), attachments POST/GET/DELETE (651-669 → `updateStorage`/`downloadFileFromStorage`
    stay as today, just `reqApplication(req)`), thumbnail (671-674).

  Delete the now-duplicate `readApplication`/`readBaseApp`/`setUniqueRefs`/`curateApplication`/
  `syncDatasets`/`initNew` definitions from the router (they live in middlewares/service/operations).
  Remove all 14 `@ts-ignore`s. Keep `validateKeys = ajv.compile(applicationKeys)` in the router
  (boundary validation).

- [ ] **Step 2: Repoint the mount** — `api/src/app.js:145` import to `./applications/router.ts`.
  Mount order and `apiKey('applications')` prefix unchanged.
- [ ] **Step 3: Run** — `npx playwright test tests/features/applications` → PASS.
- [ ] **Step 4: Lint + ratchet** — clean; `npm run check-types-ratchet` improved.
- [ ] **Step 5: Commit** — `refactor(applications): thin router adapters, js→ts`

---

## Task 5 — `applications/proxy.ts` (thin adapters + response shaping)

**Files:**
- Rename: `api/src/applications/proxy.js` → `api/src/applications/proxy.ts`
- Modify: `api/src/app.js:172` (`./applications/proxy.js` → `./applications/proxy.ts`)
- Test: `tests/features/applications/applications.api.spec.ts` (the `/app/...` cases, lines ~171-214),
  e2e application specs.

- [ ] **Step 1: Move `setResource` to a proxy-specific middleware** (keep it in `proxy.ts` — it is
  proxy-only — or in `middlewares.ts`; choose `middlewares.ts` so both files share the accessors,
  exporting `setProxyResource`). Body from `proxy.js:32-80` verbatim with substitutions:
  `req.publicationSite`/`req.mainPublicationSite` → `reqPublicationSite`/`reqMainPublicationSite`;
  `req.publicBaseUrl` read directly; the key-matching block (55-72) →
  `if (applicationKeyId && await service.matchApplicationKey(application, applicationKeyId, ownerFilter)) setReqMatchingApplicationKey(req, applicationKeyId)`
  — **verify** this preserves the exact two-branch logic (direct match + parent match); the trailing
  `req.resourceType`/`req.application = req.resource = application` → the three setters (§0).
  `findUtils.setResourceLinks(...)` stays.

- [ ] **Step 2: Convert the handlers**:
  - `GET /:applicationId/manifest.json` (82-111) → permission/`reqMatchingApplicationKey` gate stays;
    `const baseApp = await service.getManifestBaseApp(reqApplication(req).url)`; 404; set header;
    `res.send(buildManifest(reqApplication(req), baseApp, (req as Request).publicBaseUrl))`.
  - `GET /:applicationId/login` (116-130) → `res.send(buildLoginHtml(loginHtml, { siteUrl: reqSiteUrl(req), application: reqApplication(req), applicationId: req.params.applicationId, error: req.query.error }))`.
    `loginHtml` const + `Content-Type` header stay. Narrow `req.params.applicationId` per §2.
  - `GET /_htmlcache` (166-170) → unchanged (admin guard). `htmlCache` now lives in `service.ts`;
    export a `getHtmlCache()` accessor or keep this debug route in `service.ts`'s file scope — simplest:
    export `htmlCache` (or a getter) from service and `res.send(service.getHtmlCache())`.
  - `router.all(['/:applicationId/*extraPath','/:applicationId'], setProxyResource, …)` (191-384) — the
    proxy gate + HTML assembly. **Keep the parse5 DOM manipulation in this handler** (intrinsic
    response shaping). Substitutions only:
    - the gate (194-196): `permissions.can(...) && !req.matchingApplicationKey` →
      `… && !reqMatchingApplicationKey(req)`; redirect uses `req.publicBaseUrl` directly.
    - `req.application` reads → `reqApplication(req)` (assign to a local `const application` once at
      the top to minimize churn; the handler mutates `application.apiUrl`/`.wsUrl`/`.configuration`
      etc. — those are object mutations, fine). `req.publicWsBaseUrl` read directly (typed in Task 6).
    - the `Promise.all` (222-225) → `const [limits, baseApp] = await service.getProxyBaseAppAndLimits(application, applicationUrl, accessFilter)`.
    - `fetchHTML(...)` → `service.fetchHTML(...)`.
    - `req.resourceType`/`req.resource` in the `x-resource`/`x-owner` headers (242-246) →
      `reqResourceType(req)` (import from permissions.ts) / `reqResource(req)`, or simply reuse the
      local `application` for owner/id/title since `resource === application` here. Preserve the header
      JSON shape **exactly** (proxy cache + downstream depend on it).
    - `refreshConfigDatasetsRefs(req, application, draft)` stays (req-coupled).
  - `deprecatedProxy(cleanApplicationUrl, targetUrl, req, res)` (386-431) → **stays in `proxy.ts`**
    (streams `appRes` into `res`, reads `req.application.exposedUrl` → `reqApplication(req).exposedUrl`).
    It is HTTP response plumbing, not extractable to an express-free service. Move verbatim with the
    one `req.application` → `reqApplication(req)` substitution.

- [ ] **Step 3: Repoint the mount** — `api/src/app.js:172` → `./applications/proxy.ts`. Order unchanged.
- [ ] **Step 4: Run** — `npx playwright test tests/features/applications` (the `/app/...` cases) → PASS.
  Run an e2e app spec too if infra is up.
- [ ] **Step 5: Lint + ratchet** — clean; `npm run check-types-ratchet` improved.
- [ ] **Step 6: Commit** — `refactor(applications): thin proxy adapters, js→ts`

---

## Task 6 — type enrichment for `publicWsBaseUrl`

**Files:**
- Modify: `api/types/index.ts:18`

- [ ] **Step 1:** Change `export type Request = ExpressRequest & { query: Record<string, string> } & { publicBaseUrl: string }`
  to also intersect `& { publicWsBaseUrl: string }`. (Mirrors `publicBaseUrl`; both become accessors
  in Phase 5, at which point these intersections shrink away.)
- [ ] **Step 2: ratchet** — `npm run check-types-ratchet` → not-worse (should drop the single
  `publicWsBaseUrl` TS2339 in proxy).
- [ ] **Step 3: Commit** — `refactor(applications): type publicWsBaseUrl on Request`

---

## Task 7 — drop `legacyProp` dual-write + phase close-out

**Files:**
- Modify: `api/src/applications/middlewares.ts` (drop the 4 `legacyProp` args)
- Modify: `dev/type-errors-baseline.txt` (auto-updated by ratchet)
- Modify: `docs/plans/2026-06-10-code-quality-refactor.md` (record + parking-lot)

- [ ] **Step 1: Verify the four module-local props are fully migrated** — all three greps empty for
  each of `application`, `baseApp`, `isNewApplication`, `matchingApplicationKey`:

```bash
for p in application baseApp isNewApplication matchingApplicationKey; do
  echo "== $p =="
  grep -rnE "req\.$p *= [^=]" api/src
  grep -rn "(req as any)" api/src | grep "$p"
done
# readers: ensure no `req.<prop>` outside the accessor definitions
grep -rnE "\breq\.(application|baseApp|isNewApplication|matchingApplicationKey)\b" api/src
```

  Expect empty (the only `req.application.*` left should be **object-field** access through a local
  `const application = reqApplication(req)`, not `req.application`). If any remain, fix that call site
  first. **Do not** touch `resource`/`resourceType`/`publicationSite`/`publicBaseUrl` legacyProps —
  other modules still mutate them.

- [ ] **Step 2: Drop `legacyProp`** — remove the 2nd argument from the four `defineReqContext(...)`
  calls in `applications/middlewares.ts`. The `application`/`baseApp`/`isNewApplication`/
  `matchingApplicationKey` members are **not** in `RequestWithResource`/`Request` (they were ad-hoc),
  so no `api/types/index.ts` edit is needed for them.
- [ ] **Step 3: Full suite + ratchet** — `npx playwright test tests/features/applications` → PASS;
  `npm run lint` clean; `npm run check-types-ratchet` improved, `dev/type-errors-baseline.txt` updated.
- [ ] **Step 4: Update the master plan** — in `docs/plans/2026-06-10-code-quality-refactor.md`: append a
  "Phase 4 execution record" (commits, baseline delta, suppressions removed, LOC), and add any
  suspected bug found while moving to §9 parking lot (preserved bit-for-bit). **Candidates already
  spotted — verify, preserve verbatim, do NOT fix here:**
  - `router.js:262` `patchKeys.includes([key])` — `.includes` of an **array** literal always returns
    `false`, so the readonly-key preservation loop in PUT may copy keys it shouldn't (or vice-versa).
  - `router.js:498` `syncDatasets({ configuration: req.body })` in `writeConfig` passes the **raw body**
    not the validated `appConfig`, and omits the `oldApp` arg (stale dataset refs not re-synced).
  - `proxy.js:428` registers `cacheAppReq.on('error', …)` **twice** (lines 425 & 428) — harmless dup.
- [ ] **Step 5: Commit** — `refactor(applications): drop legacy req dual-write; phase 4 close-out`
- [ ] **Step 6:** Push (husky runs full `npm run quality`). Open the PR.

---

## Definition of done (per master plan §10)

- [ ] API/e2e specs untouched & green; new unit spec for `operations.ts` (Task 1).
- [ ] `npm run check-types-ratchet` improved; `dev/type-errors-baseline.txt` committed.
- [ ] 0 suppressions in `applications/` (was 21); no new `as any`/`@ts-ignore` outside the accessor
      module (`middlewares.ts` accessors are the sanctioned casts).
- [ ] Express imports / `req` access only in `router.ts` / `proxy.ts` / `middlewares.ts`. `service.ts`
      + `operations.ts` are express-free; no `req` mutation anywhere (accessors only).
- [ ] No cross-module import of any `router.ts` / `middlewares.ts` (verify `utils.ts` `attachmentsDir`
      export preserved for `metadata-attachments.ts`).
- [ ] `router.js` + `proxy.js` + `service.js` converted to `.ts`; `utils.ts` unchanged.
- [ ] Mount order in `app.js` (base-applications → applications → … → proxy) and every middleware chain
      preserved exactly.
- [ ] Parking lot updated with the three suspected bugs above (preserved bit-for-bit).
- [ ] Record actual size/effort in this doc + the master plan.
