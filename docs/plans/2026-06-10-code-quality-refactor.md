# Large-Scale Code Quality Refactor — Master Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **This is a master plan.** Phases 0 and 1 are fully specified here and executable as-is. Phases 2–7 are sub-plan briefs: the first task of each phase is to expand the brief into a detailed plan document (same template as Phase 1) inside that phase's own worktree.

**Goal:** Move the data-fair API codebase to the house style of `@data-fair/lib-express`: thin Express adapters, express-free service layers, pure `operations.ts` modules, symbol-keyed typed request context instead of ad-hoc `req` mutation, and a monotonic typing ratchet — without any behavior change and without touching the API/e2e test contract.

**Architecture:** Per module: `router.ts` (only file touching req/res) → `service.ts` (I/O orchestration, express-free, explicit typed params) → `operations.ts` (pure functions, the unit-test surface). The ~35 ad-hoc `req.*` mutated properties are replaced progressively by symbol-keyed accessors with a transitional legacy fallback. A tsc-error baseline ratchet makes "better typing" enforceable per PR.

**Tech Stack:** Node 24, Express 5, TypeScript strict + checkJs (single root tsconfig, noEmit), `@data-fair/lib-express` / `lib-node` / `lib-validation`, df-build-types (JSON schema → types), Playwright test runner (unit + api + e2e), husky pre-push `npm run quality`.

---

## 1. Scope and non-goals

**In scope (this refactor series):**
- Decouple business logic from Express (priority 1)
- Better typing: js→ts conversion, suppression removal, enforceable ratchet (priority 2)
- Better modularity: dependency direction rules, dissolve the `misc/utils` junk drawer, kill cross-module imports of router internals (priority 3)

**Out of scope — explicitly deferred (see §9 Parking lot):**
- Test-suite speed work (compaction, parallelization, e2e→api→unit rebalancing). Tests stay **identical or additions-only** during this series, except superficial unit-test changes (import paths when a tested file moves).
- Simplifications / optimizations beyond mechanical moves. Anything that smells like a behavior change — including suspected bugs found along the way — goes to the parking lot, never silently "fixed" inside a move.

## 2. Current state (survey summary, 2026-06-10)

- `api/src`: 176 files, 103 `.ts` / 73 `.js` (58.5% TS). Fully-TS modules already: workers, settings, limits, files-storage, base-applications, stats.
- `npm run check-types` (api tsc): **1807 errors**. Top files: `datasets/router.js` 337, `applications/router.js` 122, `applications/proxy.js` 79, `datasets/es/commons.js` 73. Top error codes: TS7006 implicit-any params (702), TS2339 missing property (551).
- Suppressions: ~130 `@ts-ignore`/`@ts-expect-error` across api/src (datasets 32, applications 21, admin 17, workers 15).
- **~35 distinct properties are mutated onto `req`** across 10+ files (`req.dataset`, `req.resource`, `req.application`, `req.owner`, `req.bypassPermissions`, `req.publicationSite`, `req.publicBaseUrl`, `req.noCache`, …). This is the main express-coupling vector: any function reading them needs a real (or mocked) Express request.
- Good patterns already exist in-repo and are the model: `remote-services/operations.ts`, `base-applications/operations.ts`, `files-storage/*`, `workers/*` (fully express-free), `misc/utils/find.js` (pure query builder).
- Known violation to fix early: `misc/utils/api-key.ts:10` imports domain type-guards **from `settings/router.ts`**.
- Test contract: 56 API specs + 22 e2e specs interact over HTTP only (no imports from api/src) → internals can move freely. 30 unit specs import **specific named exports from 19 exact file paths** (§4.2) → those paths/exports must stay stable or the spec's import line is updated in the same PR (superficial change, allowed).
- Husky pre-push runs `npm run quality` = lint + build-types + ui check-types + ui build + parquet build + full test suite + audit. Note: api tsc is **not** in `quality` today (broken baseline) — Phase 0 adds a ratchet instead.

## 3. Target conventions (the pattern book)

These rules go verbatim into `docs/architecture/code-conventions.md` (created in Phase 0) and govern every phase.

### 3.1 Module file roles & dependency direction

Each domain module (`datasets`, `applications`, `settings`, …) converges on:

```
<module>/
  router.ts        # ONLY place req/res appear. Route decls, middleware chains,
                   # input extraction, service calls, res.send. No business logic.
  middlewares.ts   # thin adapters: parse req → call operations/service → set req context
                   # via symbol accessors. Each middleware's decision logic is an
                   # exported plain function so it is callable without Express.
  service.ts       # express-free orchestration: mongo/ES/files/events. Explicit typed
                   # params (never req). Throws httpError. Callable from workers/tests.
  operations.ts    # pure functions, no I/O at all. The unit-test surface.
  types.ts         # module-local types (optional)
```

**Dependency direction (enforced by review, candidate for a lint rule later):**
- `router → middlewares → service → operations`. `operations.ts` imports nothing that does I/O. `service.ts` never imports express.
- Cross-module imports target only another module's `service.ts` / `operations.ts` / `types.ts` — **never** its `router.ts` or `middlewares.ts`.
- `misc/utils` is reserved for genuinely generic utilities (find.js, ajv, bytes…). Domain logic currently living there (permissions, api-key, application-key, publication-sites…) keeps its path for now but follows the same router/service/operations split internally; relocation is a Phase 5 decision.

### 3.2 Request context: symbol accessors replace `req` mutation

The lib-express `session.ts` / `site.ts` pattern: a Symbol key, typed `set`/`get` accessors, casts contained inside one module, `get` throws when the middleware was not applied. Plus, transitional: `get` falls back to the legacy mutated property so setters and readers can migrate independently.

```ts
// api/src/misc/utils/req-context.ts  (full code in Phase 0)
const defineReqContext = <T>(name: string, legacyProp?: string) => {
  const key = Symbol(name)
  return {
    set: (req: IncomingMessage, value: T) => { (req as any)[key] = value },
    get: (req: IncomingMessage): T => {
      const value = (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
      if (value === undefined) throw new Error(`req context "${name}" was not set (middleware missing?)`)
      return value
    },
    getOptional: (req: IncomingMessage): T | undefined =>
      (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
  }
}
```

- All accessors are defined **topically, at migration time** — `misc/utils/req-context.ts` hosts only the factory and req-free helpers (revised after Task 0.1: the nine pre-defined cross-cutting accessor groups were dead exports and were removed; see the placement table in `docs/architecture/code-conventions.md` §2).
- Module-specific properties get accessors next to the middleware that sets them: e.g. `setReqDataset/reqDataset` in `datasets/middlewares.*`, `setReqSettingsParams/reqSettingsParams` in `settings/middlewares.ts`.
- Cross-cutting properties (read by permissions, cache-headers, …) get accessors in their semantic owner when their phase lands: `resource`, `resourceType`, `bypassPermissions`, `publicOperation` in `misc/utils/permissions.ts`; `noCache` with cache-headers; `publicationSite`/`mainPublicationSite` in `misc/utils/publication-sites.ts`; `publicBaseUrl`/`publicWsBaseUrl` in a small dedicated module when `app.js` migrates.
- Migration mechanics per property: (1) the migrating phase ships the accessor with legacy fallback, and `set*` **dual-writes** the legacy property while `legacyProp` is configured — so readers and setters can migrate in **any order** (adopted during Task 0.1 review to remove ordering risk); (2) each module phase converts its readers and setters to the accessors; (3) once `grep -rnE "req\.<prop> *= [^=]" api/src` and the reader grep are empty, remove the `legacyProp` argument (ending the dual-write) and the corresponding member of `RequestWithResource`/ad-hoc types in `api/types/index.ts`.
- Final state: `api/types/index.ts` `Request`/`RequestWithResource` intersections shrink away; `@ts-ignore`s on req access disappear.

### 3.3 Express-free services: explicit context instead of `req`

Service functions receive plain data. Recurring shapes:

```ts
// what routers extract once and pass down (define per module, keep minimal)
type OwnerContext = { owner: AccountKeys, ownerFilter: Record<string, any> }

// for audit logging without req — produces the same EventLog output as passing { req }
// (eventsLog accepts user/account/ip/host directly; helper defined in Phase 0)
const logCtx = reqEventLogContext(req) // { user, account, ip, host }
```

- `eventsLog.*` calls inside services take `{ ...logCtx, account }` instead of `{ req, account }`.
- Helpers that intrinsically need the HTTP layer (e.g. `notifications.subscribe` forwards the auth cookie) are **router-layer helpers**: they stay called from `router.ts`, with any pure payload-building extracted to `operations.ts`.
- Validation at the boundary: routers validate/narrow input (`assertValid`/`returnValid` from generated validators, house style), services receive typed values.

### 3.4 Typing rules

- Every file touched by a phase is converted `.js → .ts` in that phase (moving logic is the natural moment; JSDoc coverage is too thin to be a bridge).
- No new `@ts-ignore`/`@ts-expect-error`/`as any` outside accessor modules; each phase reduces its module's count, target 0.
- Domain types come from JSON schemas via `df-build-types` (`api/types/*`); TS2339 errors are usually fixed by **enriching the schema**, not by casting.
- The tsc error count only goes down: ratchet script (§4.3) enforces it on every PR.

## 4. Guardrails

### 4.1 Test contract
- API + e2e specs are never modified in this series. They pin the HTTP contract (routes, status codes, payloads, permissions) and are the primary regression net.
- Unit specs: assertions never change; import paths may be updated in the same PR when a tested file moves; **new** unit specs for newly extracted `operations.ts` functions are encouraged (additions only).
- Every phase runs its module's specs during work (`npx playwright test tests/features/<area>`) and relies on husky `npm run quality` (full suite) at push.

### 4.2 Unit-test-imported paths (keep exports stable or update imports in same PR)

```
api/src/admin/elasticsearch-diagnose.ts        api/src/datasets/es/diagnose-warnings.ts
api/src/datasets/es/index-name.ts              api/src/datasets/es/operations.ts (4 specs)
api/src/datasets/threads/results2sheet.js      api/src/datasets/utils/compute-modified.ts
api/src/datasets/utils/csv-jit.ts              api/src/datasets/utils/operations.ts
api/src/api-compat/ods/*.peg.js (6 files)      api/src/files-storage/s3-retry.ts
api/src/misc/utils/compute-budget.ts           api/src/misc/utils/dcat/{normalize,validate}.js
api/src/misc/utils/query-advice.ts             api/src/misc/utils/xlsx.ts
api/src/settings/api-keys-expiration-milestones.ts
api/src/workers/concurrency.ts                 shared/expr-eval.js
@data-fair/data-fair-shared/ajv.js
```

### 4.3 Ratchet metrics & baselines (recorded 2026-06-10)

| Metric | Baseline | Command |
|---|---|---|
| api tsc errors | 1807 | `npx tsc 2>&1 \| grep -c 'error TS'` |
| suppressions in api/src | ~130 | `grep -rE '@ts-ignore\|@ts-expect-error' api/src --include='*.ts' --include='*.js' \| wc -l` |
| `.js` files in api/src | 73 | `find api/src -name '*.js' \| wc -l` |
| legacy req-mutation sites | ~35 props | census in §2 / conventions doc |

Phase 0 ships `dev/check-types-ratchet.sh` + committed baseline file; each PR must keep the error count ≤ baseline and updates the baseline when it improves.

### 4.4 Risk rules
- One phase = one worktree = one PR (datasets sliced further, §8.6). Target ≤ ~800 changed LOC per PR where feasible.
- Mechanical moves only: function bodies move verbatim; signature changes limited to replacing `req` with explicit params. Resist drive-by cleanups — parking lot instead.
- Suspected bugs found while moving code (there is already one: §9 item 1) are **preserved bit-for-bit** in the move and recorded; they get their own later PR with a test.
- Order routes/middleware identically; middleware chains keep their exact order (load-management depends on it, cf. rate-limiter-after-api-key history).

## 5. Phase sequence overview

| # | Worktree | Scope | Size | Risk | Expected tsc delta |
|---|---|---|---|---|---|
| 0 | `refactor-foundations` | req-context accessors, log-context helper, ratchet script, conventions doc | S | minimal | 0 (no regression allowed) |
| 1 | `refactor-settings` | **Pilot**: settings module to full pattern; fix api-key→router import | M | low | −19 |
| 2 | `refactor-tiny-modules` | catalog, identities, activity: js→ts + pattern | S | low | −73 |
| 3 | `refactor-remote-services-admin` | remote-services router.js→ts + admin leftover | M | low-med | −140 |
| 4 | `refactor-applications` | applications router.js + proxy.js: split, ts, req-context | L | med | −216 |
| 5 | `refactor-misc-utils` | junk-drawer triage; convert remaining misc .js; permissions/cache-headers readers → accessors | L | med | −235 |
| 6a | `refactor-datasets-es` | datasets/es js→ts, consolidate into es/operations.ts | L | med | −274 |
| 6b | `refactor-datasets-utils` | datasets/utils js→ts + decouple rest.ts from req | L | med-high | −283 |
| 6c | `refactor-datasets-service` | service.js→ts, middlewares.js→ts, readDataset context | M | med | part of −386 |
| 6d | `refactor-datasets-router` | router.js → thin adapters split by sub-resource | XL | high | rest of −386 |
| 7 | `refactor-api-compat` | ods/index.ts: extract query building to operations | M | med | −56 |

Order rationale: prove the pattern on small, already-typed modules; convert the cross-cutting *readers* (permissions, cache-headers, in Phase 5) before the biggest *setters* (datasets, Phase 6); datasets last, when accessors and conventions are battle-tested; 6d (the 1553-line router) only after everything it calls is typed and express-free.

Phases 2+3, and later 6a/6b, are pairwise independent and can run in parallel worktrees if desired. 4 and 5 should not run concurrently (both touch permissions call-sites).

---

## 6. Phase 0 — Foundations (fully specified)

**Files:**
- Create: `api/src/misc/utils/req-context.ts`
- Create: `tests/features/infra/req-context.unit.spec.ts`
- Create: `dev/check-types-ratchet.sh`, `dev/type-errors-baseline.txt`
- Create: `docs/architecture/code-conventions.md`
- Modify: `package.json` (scripts), `AGENTS.md` (doc pointer)

### Task 0.1: req-context accessor module

- [ ] **Step 1: Write the failing unit test**

```ts
// tests/features/infra/req-context.unit.spec.ts
import { test } from '@playwright/test'
import assert from 'node:assert/strict'
import { defineReqContext } from '../../../api/src/misc/utils/req-context.ts'

// symbol-keyed typed request context (lib-express session.ts pattern),
// with transitional fallback to the legacy req-mutation property
test.describe('defineReqContext', () => {
  test('set then get returns the value', () => {
    const ctx = defineReqContext<{ id: string }>('thing')
    const req: any = {}
    ctx.set(req, { id: 'a' })
    assert.deepEqual(ctx.get(req), { id: 'a' })
  })

  test('get throws when never set and no legacy prop', () => {
    const ctx = defineReqContext<string>('thing')
    assert.throws(() => ctx.get({} as any), /was not set/)
  })

  test('getOptional returns undefined when never set', () => {
    const ctx = defineReqContext<string>('thing')
    assert.equal(ctx.getOptional({} as any), undefined)
  })

  test('falls back to the legacy mutated property during transition', () => {
    const ctx = defineReqContext<string>('thing', 'thing')
    const req: any = { thing: 'legacy' }
    assert.equal(ctx.get(req), 'legacy')
    ctx.set(req, 'modern')
    assert.equal(ctx.get(req), 'modern') // symbol wins over legacy
  })

  test('two contexts with the same name do not collide', () => {
    const a = defineReqContext<string>('x')
    const b = defineReqContext<string>('x')
    const req: any = {}
    a.set(req, '1')
    assert.equal(b.getOptional(req), undefined)
  })
})
```

- [ ] **Step 2: Run it, verify it fails** — `npx playwright test tests/features/infra/req-context.unit.spec.ts` → FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// api/src/misc/utils/req-context.ts
// Typed request-scoped context, replacing ad-hoc mutation of req properties.
// Pattern follows @data-fair/lib-express session.ts / site.ts: symbol keys,
// typed accessors, casts contained in this module, get() throws when the
// middleware that sets the value was not applied.
import type { IncomingMessage } from 'node:http'
import type { Request } from 'express'
import { reqSession, type User, type Account } from '@data-fair/lib-express'
import type { Resource, ResourceType, BypassPermissions } from '#types'

export type ReqContext<T> = {
  set: (req: IncomingMessage, value: T) => void
  get: (req: IncomingMessage) => T
  getOptional: (req: IncomingMessage) => T | undefined
}

// legacyProp: name of the legacy mutated req property to fall back to while
// setters are migrated module by module. Remove the argument (and the legacy
// member in api/types) once `grep -rn "req.<prop> *=" api/src` is empty.
export const defineReqContext = <T>(name: string, legacyProp?: string): ReqContext<T> => {
  const key = Symbol(name)
  return {
    set: (req, value) => { (req as any)[key] = value },
    get: (req) => {
      const value = (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
      if (value === undefined) throw new Error(`req context "${name}" was not set (middleware missing?)`)
      return value
    },
    getOptional: (req) => (req as any)[key] ?? (legacyProp ? (req as any)[legacyProp] : undefined)
  }
}

// ---- cross-cutting contexts (read by permissions, cache-headers, find, …) ----
// Setters stay where they are today (app.js, module middlewares) until the
// owning module's phase switches them from mutation to set*().

const resource = defineReqContext<Resource>('resource', 'resource')
export const setReqResource = resource.set
export const reqResource = resource.get
export const reqResourceOptional = resource.getOptional

const resourceType = defineReqContext<ResourceType>('resourceType', 'resourceType')
export const setReqResourceType = resourceType.set
export const reqResourceType = resourceType.get

const bypassPermissions = defineReqContext<BypassPermissions>('bypassPermissions', 'bypassPermissions')
export const setReqBypassPermissions = bypassPermissions.set
export const reqBypassPermissions = bypassPermissions.getOptional

const publicOperation = defineReqContext<boolean>('publicOperation', 'publicOperation')
export const setReqPublicOperation = publicOperation.set
export const reqPublicOperation = publicOperation.getOptional

const noCache = defineReqContext<boolean>('noCache', 'noCache')
export const setReqNoCache = noCache.set
export const reqNoCache = noCache.getOptional

const publicBaseUrl = defineReqContext<string>('publicBaseUrl', 'publicBaseUrl')
export const setReqPublicBaseUrl = publicBaseUrl.set
export const reqPublicBaseUrl = publicBaseUrl.get

const publicWsBaseUrl = defineReqContext<string>('publicWsBaseUrl', 'publicWsBaseUrl')
export const setReqPublicWsBaseUrl = publicWsBaseUrl.set
export const reqPublicWsBaseUrl = publicWsBaseUrl.get

// publicationSite / mainPublicationSite are loose shapes today; typed any until
// a PublicationSite-with-owner type is extracted in Phase 5
const publicationSite = defineReqContext<any>('publicationSite', 'publicationSite')
export const setReqPublicationSite = publicationSite.set
export const reqPublicationSite = publicationSite.getOptional

const mainPublicationSite = defineReqContext<any>('mainPublicationSite', 'mainPublicationSite')
export const setReqMainPublicationSite = mainPublicationSite.set
export const reqMainPublicationSite = mainPublicationSite.getOptional

// ---- audit-log context without req (same EventLog output as passing { req }) ----
export type LogContext = { user?: User, account?: Account, ip?: string, host?: string }
export const reqEventLogContext = (req: Request): LogContext => {
  const session = reqSession(req)
  return {
    user: session.user,
    account: session.account,
    ip: req.get('X-Client-IP'),
    host: req.get('Host')
  }
}
```

- [ ] **Step 4: Run test, verify pass** — `npx playwright test tests/features/infra/req-context.unit.spec.ts` → PASS.
  Note: if `Account`/`User` import names differ in the installed `@data-fair/lib-express` version, check `node_modules/@data-fair/lib-express/index.d.ts` and adjust the import line only.

- [ ] **Step 5: Lint** — `npx eslint api/src/misc/utils/req-context.ts tests/features/infra/req-context.unit.spec.ts` → clean.

- [ ] **Step 6: Commit** — `git add -A && git commit -m "feat(api): typed symbol-keyed request context accessors"`

### Task 0.2: type-error ratchet

- [ ] **Step 1: Record the baseline**

```bash
npx tsc 2>&1 | grep -c 'error TS' > dev/type-errors-baseline.txt
cat dev/type-errors-baseline.txt   # expect ~1807 (+0/−1 drift ok, it is the recorded truth)
```

- [ ] **Step 2: Write the ratchet script**

```bash
#!/usr/bin/env bash
# dev/check-types-ratchet.sh — api tsc errors must never increase.
# check-types is not yet gating (1800+ legacy errors): this ratchet is the
# enforceable substitute until the count reaches 0, then check-types replaces it.
set -e
cd "$(dirname "$0")/.."
count=$(npx tsc 2>&1 | grep -c 'error TS' || true)
baseline=$(cat dev/type-errors-baseline.txt)
echo "api tsc errors: $count (baseline: $baseline)"
if [ "$count" -gt "$baseline" ]; then
  echo "FAIL: type errors increased ($baseline -> $count)"
  npx tsc 2>&1 | grep 'error TS' | head -30
  exit 1
fi
if [ "$count" -lt "$baseline" ]; then
  echo "$count" > dev/type-errors-baseline.txt
  echo "Baseline improved ($baseline -> $count): dev/type-errors-baseline.txt updated, commit it."
fi
```

- [ ] **Step 3: Wire it** — in root `package.json`:
  - add script `"check-types-ratchet": "bash dev/check-types-ratchet.sh"`
  - in `"quality"`, insert `npm run check-types-ratchet && ` right after `npm run lint && ` (adds ~30–60s to pre-push; this is the enforcement point — flag to the user if unacceptable).

- [ ] **Step 4: Verify** — `chmod +x dev/check-types-ratchet.sh && npm run check-types-ratchet` → prints count, exits 0.

- [ ] **Step 5: Commit** — `git commit -am "chore: tsc error-count ratchet gating quality"`

### Task 0.3: conventions doc

- [ ] **Step 1:** Create `docs/architecture/code-conventions.md` containing §3 of this plan verbatim (file roles, dependency direction, req-context pattern + per-property migration mechanics and the property census table from §2, service context shapes, typing rules, ratchet usage), plus a link back to this plan.
- [ ] **Step 2:** Add to the Architecture Documentation list in `AGENTS.md`:
  `- [Code conventions](docs/architecture/code-conventions.md) — module file roles (router/service/operations), request-context accessors, typing ratchet. **Read before refactoring or adding API code.**`
- [ ] **Step 3: Commit** — `git commit -am "docs: code conventions for the express-decoupling refactor"`

---

## 7. Phase 1 — Pilot: settings module (fully specified)

Why settings: already 100% TS (the diff is *pure restructuring*, no type-fixing noise), self-contained, covered by `tests/features/settings/` (2 API specs + 1 unit spec), and it exhibits three target smells: param data mutated onto `req` (`owner`/`department`/`ownerFilter`), all CRUD inline in the router, and another module importing from its router (`misc/utils/api-key.ts:10`).

Convention note for executors: steps below that move code give exact source ranges (from `api/src/settings/router.ts` @ branch point) and the new signatures. **Function bodies move verbatim** except for the explicitly listed substitutions — do not transcribe from this document, move from the source file.

**Files:**
- Create: `api/src/settings/operations.ts`, `api/src/settings/service.ts`, `api/src/settings/middlewares.ts`
- Create: `tests/features/settings/settings-operations.unit.spec.ts`
- Modify: `api/src/settings/router.ts` (shrinks to ~150 lines), `api/src/misc/utils/api-key.ts:10`
- Tests that must stay green untouched: `tests/features/settings/*.api.spec.ts`

### Task 1.1: extract pure functions to `settings/operations.ts`

- [ ] **Step 1:** Create `api/src/settings/operations.ts`; move from `router.ts`, bodies verbatim:
  - `validate` (router.ts:31-37)
  - `isMainSettings`, `isUserSettings`, `isDepartmentSettings` (44-52) — keep `export`
  - `cleanSettings` (98-109)
  - `fillSettings` (120-138)
  - `cleanDatasetsMetadata` (287-293)
  - new pure function `parseOwnerParams` extracted from the param middleware body (55-70):

```ts
export type SettingsParams = { owner: AccountKeys, department?: string, ownerFilter: Record<string, any> }

export const parseOwnerParams = (type: 'user' | 'organization', idParam: string): SettingsParams => {
  const [id, department] = idParam.split(':')
  const owner: AccountKeys = { type, id }
  const params: SettingsParams = { owner, ownerFilter: {} }
  if (department) {
    params.department = department
    if (department !== '*') owner.department = department
  }
  params.ownerFilter = { ...owner }
  if (!department) params.ownerFilter.department = { $exists: false }
  return params
}
```

  Imports needed: `httpError` is NOT needed here; bring `type Settings`, `type DepartmentSettings`, both `assertValid` validators, `type AccountKeys`, `type User`, `slug`.
- [ ] **Step 2:** In `router.ts`, replace the moved declarations with imports from `./operations.ts`. Run `npx playwright test tests/features/settings` → PASS.
- [ ] **Step 3:** Add `tests/features/settings/settings-operations.unit.spec.ts` (additions-only) covering `parseOwnerParams` (org root / department / `*` / user) and `cleanSettings` (strips `key`, `notifiedJ3At`, `notifiedJAt`, `_id`). Style: `@playwright/test` + `node:assert/strict` as in `tests/features/infra/compute-budget.unit.spec.ts`. Run → PASS.
- [ ] **Step 4: Commit** — `refactor(settings): extract pure operations module`

### Task 1.2: `settings/middlewares.ts` with req-context accessor

- [ ] **Step 1:** Create `api/src/settings/middlewares.ts`:

```ts
import { type RequestHandler } from 'express'
import { reqSessionAuthenticated } from '@data-fair/lib-express'
import eventsLog from '@data-fair/lib-express/events-log.js'
import { defineReqContext } from '../misc/utils/req-context.ts'
import * as permissions from '../misc/utils/permissions.ts'
import { parseOwnerParams, type SettingsParams } from './operations.ts'

const settingsParams = defineReqContext<SettingsParams>('settings-params')
export const setReqSettingsParams = settingsParams.set
export const reqSettingsParams = settingsParams.get

export const settingsParamsMiddleware: RequestHandler = (req, res, next) => {
  if (req.params.type !== 'user' && req.params.type !== 'organization') {
    res.status(400).type('text/plain').send('Invalid type, it must be one of the following : user, organization')
    return
  }
  setReqSettingsParams(req, parseOwnerParams(req.params.type, req.params.id))
  next()
}

export const isOwnerAdmin: RequestHandler = (req, res, next) => {
  const { owner } = reqSettingsParams(req)
  const sessionState = reqSessionAuthenticated(req)
  if (!sessionState.user.adminMode && permissions.getOwnerRole(owner, sessionState) !== 'admin') {
    eventsLog.alert('df.apikeys.permission', 'a user attempted to overwrite settings from another account', { req, account: owner })
    res.sendStatus(403)
    return
  }
  next()
}

export const isOwnerMember: RequestHandler = (req, res, next) => {
  const { owner } = reqSettingsParams(req)
  const sessionState = reqSessionAuthenticated(req)
  // do not check belonging to department, some settings are shared from top org to its departments
  if (!sessionState.user.adminMode && !permissions.getOwnerRole(owner, sessionState, true)) {
    res.sendStatus(403)
    return
  }
  next()
}
```

  (Behavior preserved from router.ts:55-96 including the 400 message — the wording `Array.from(allowedTypes).join(', ')` resolves to exactly `user, organization`.)
- [ ] **Step 2:** In `router.ts`: delete the inline `router.use('/:type/:id', …)` block, `isOwnerAdmin`, `isOwnerMember`, `SettingsRequest`, `assertSettingsRequest`; mount `router.use('/:type/:id', settingsParamsMiddleware)`; replace every `assertSettingsRequest(req)` + `req.owner`/`req.ownerFilter`/`req.department` read with `const { owner, ownerFilter, department } = reqSettingsParams(req)`. The two `@ts-ignore`s at router.ts:54 and :106 disappear.
- [ ] **Step 3:** `npx playwright test tests/features/settings` → PASS; `npm run check-types-ratchet` → improved. Commit — `refactor(settings): typed request context for owner params`

### Task 1.3: extract I/O orchestration to `settings/service.ts`

- [ ] **Step 1:** Create `api/src/settings/service.ts` with an explicit context replacing `req` (mongo/event/topic imports follow the moved bodies):

```ts
import { type SessionStateAuthenticated } from '@data-fair/lib-express'
import { type LogContext } from '../misc/utils/req-context.ts'
import { type SettingsParams } from './operations.ts'

export type SettingsWriteContext = SettingsParams & {
  sessionState: SessionStateAuthenticated
  host: string          // was reqHost(req) at router.ts:199
  logCtx: LogContext    // was { req } in eventsLog calls
}
```

  Move, bodies verbatim with the listed substitutions:
  - `writeSettings` (router.ts:140-285) → `export const writeSettings = async (ctx: SettingsWriteContext, existingSettings: Settings | DepartmentSettings | null, settings: any)`. Substitutions: `req.owner` → `ctx.owner`; `req.ownerFilter` → `ctx.ownerFilter`; `sessionState` param → `ctx.sessionState`; `reqHost(req)` → `ctx.host`; every `{ req, account: req.owner }` in `eventsLog.*` → `{ ...ctx.logCtx, account: ctx.owner }`.
  - `updateDatasetsMetadata` (295-307) → unchanged signature (already req-free).
  - New thin reads, one per GET route, e.g. `getSettings(ownerFilter)` (from 112-118), `getTopics(ownerFilter)` (329-338), `getLicenses(ownerFilter)` (341-356), `getDatasetsMetadata(ownerFilter)` (359-364), `getAgentChat(ownerFilter)` (367-371), `getPublicationSites(params: SettingsParams)` (374-396).
  - `upsertPublicationSite(ctx, body)` (from 398-440) returns `{ created: boolean, site }` — the `notifications.subscribe` calls (418-433) **stay in the router** (they forward the request cookie), executed when `created` is true; payload-building for the two subscriptions moves to `operations.ts` as `buildPublicationSiteSubscriptions(owner, body, publicUrl)` returning the two subscription objects.
  - `deletePublicationSite(ctx, siteType, siteId)` (from 442-458).
- [ ] **Step 2:** Rewrite the route handlers in `router.ts` as thin adapters. Representative shape (PUT, from router.ts:310-317):

```ts
router.put('/:type/:id', isOwnerAdmin, async (req, res) => {
  const params = reqSettingsParams(req)
  const sessionState = reqSessionAuthenticated(req)
  const ctx = { ...params, sessionState, host: reqHost(req), logCtx: reqEventLogContext(req) }
  const existingSettings = await mongo.settings.findOne(params.ownerFilter)
  res.status(200).send(await service.writeSettings(ctx, existingSettings, req.body))
})
```

- [ ] **Step 3:** `npx playwright test tests/features/settings tests/features/auth` → PASS (auth specs cover api-keys created via settings). Commit — `refactor(settings): express-free service layer`

### Task 1.4: fix the cross-module router import

- [ ] **Step 1:** `api/src/misc/utils/api-key.ts:10` → `import { isDepartmentSettings, isUserSettings } from '../../settings/operations.ts'`. Keep re-exports in `router.ts` only if anything else imports them (`grep -rn "settings/router" api/src` — currently only app.js mount remains).
- [ ] **Step 2:** Run `npx playwright test tests/features/auth tests/features/settings` → PASS. Commit — `refactor(settings): no more imports from router internals`

### Task 1.5: phase close-out

- [ ] `npm run lint && npm run check-types-ratchet` → clean, baseline improved (expect roughly −19).
- [ ] `grep -rn "req\.owner\|req\.ownerFilter\|req\.department" api/src/settings api/src/misc` → empty (the three legacy props are fully migrated; they had no readers outside settings).
- [ ] Definition-of-done checklist (§10). Push (husky runs full quality). PR. Record actual effort/LOC — it calibrates estimates for phases 2–7.

---

### Phase 0+1 execution record (2026-06-10, this worktree)

Executed subagent-driven in one session: 14 commits (`2fec1e378..9d3d3de02`), 17 files, +1121/−426. Per-task implementer + spec review + quality review + fix loops. Results: ratchet 1807 → **1800**; settings router 460 → **84 lines** across 4 files (router/middlewares/service/operations); 3 req-props fully migrated (owner/ownerFilter/department, no legacy fallback needed — atomic flip); 2 new unit spec files (13 + 6 tests); 0 suppressions added (settings has 1 pre-existing); API/e2e specs untouched; app.js untouched. Reviews upgraded the design in 4 places now codified in code-conventions.md: dual-write in `set*`, `ResourceType` union fix, service signature rule (Params/WriteContext), ctx builders in middlewares.ts. Calibration: the pilot (smallest module, already 100% TS) consumed a full session with ~25 subagent dispatches — budget phases 4-6 accordingly (bigger modules, plus js→ts conversion the pilot didn't need).

Post-pilot revision (2026-06-11): the nine pre-defined cross-cutting accessor groups in `req-context.ts` were removed before any consumer existed — accessors are now defined topically at migration time per the placement table in `code-conventions.md` §2. The Task 0.1 listing above predates this revision; `req-context.ts` now hosts only `defineReqContext` and `reqEventLogContext`.

## 8. Phases 2–7 — sub-plan briefs

First task of every phase: expand this brief into `docs/plans/<date>-refactor-<module>.md` (committed, alongside this plan) using Phase 1 as the template (move-mapping tables with line ranges, verbatim-move rule, per-task test runs). All phases follow §3 conventions and §4 guardrails; all convert touched `.js` files to `.ts`.

### 8.1 Phase 2 — tiny modules (catalog 166 LOC, identities 156, activity 36; all 0% TS, ~73 tsc errors)
Convert to `.ts`; extract what little logic exists (identities: GDPR collection updates → `identities/service.ts`; catalog mostly delegates to datasets service — verify it imports service, not router). Low value alone, but cheap, and finishes 3 modules to 100%.

### 8.2 Phase 3 — remote-services + admin (router.js 58 errors; admin 1 js file left, 10 errors)
remote-services already has `operations.ts`; move the router's inline orchestration (find/CRUD, `req.remoteService` loading at router.js:100) into `service.ts`, add `setReqRemoteService/reqRemoteService` accessor in new `middlewares.ts`. Admin: convert leftover `.js`; `elasticsearch-diagnose.ts` exports are unit-tested — path stays.

### 8.3 Phase 4 — applications (router.js 674 LOC/122 err + proxy.js 431 LOC/79 err)
- Extract `initNew`, `curateApplication`, `syncDatasets` and the POST state machine into `operations.ts`/`service.ts`.
- proxy.js is the heart: split into (a) `middlewares.ts` — load application + matching application-key, set req context (`setReqApplication`, `setReqMatchingApplicationKey`); (b) `service.ts` — pure-ish config assembly currently interleaved with req mutation; (c) thin proxy router. Read `docs/architecture/application-keys.md` first — proxy is one of the two enforcement points.
- Migrates req props: `application`, `baseApp`, `baseAppDraft`, `isNewApplication`, `matchingApplicationKey` (+ `resource`/`resourceType` setters on this module's paths).

### 8.4 Phase 5 — misc/utils triage (28 js files, 235 errors)
- Convert the cross-cutting **readers** to symbol accessors, defining each accessor in its topical home per the conventions-doc placement table (whichever phase touches a context first creates its accessor): `permissions.ts` (reads `resource`, `resourceType`, `bypassPermissions`; sets `publicOperation` → `setReqPublicOperation`; hosts those four accessor groups), `cache-headers.js` → `.ts` (reads `noCache`, `resource`, `publicOperation`; hosts `noCache`), `capture.ts`, `application-key.ts` (sets `bypassPermissions`, `matchingApplicationKey`), `api-key.ts` (sets `bypassPermissions`).
- app.js: switch `publicBaseUrl`/`publicWsBaseUrl`/`publicationSite`/`mainPublicationSite` setters to accessors; convert their readers repo-wide (mostly URL building — mechanical).
- Classify each remaining util: generic (stays) vs domain-in-disguise (`publication-sites.ts`, `journals.ts`, `notifications.ts` … — record target module, move only if cheap; bulk moves can be a later phase).
- After this phase the legacy fallbacks for `resource`, `resourceType`, `bypassPermissions`, `publicOperation`, `publicBaseUrl` can likely be dropped (grep-verify).

### 8.5 Phase 6 — datasets (the bulk: ~950 tsc errors, 32 suppressions)
- **6a es/**: convert `commons.js` (744 LOC, 73 err), `values-agg.js` (69 err) etc. to `.ts`; consolidate pure query-building into the existing unit-tested `es/operations.ts` (4 specs import it — exports stable). Mechanical split only; deeper simplification → parking lot.
- **6b utils/ + rest.ts**: `data-streams.js` (60 err) and friends → `.ts`. `rest.ts` (1383 LOC) is REST-lines domain logic using `req._fixedFormBody`/`req._rawBody`/`req._uploadedAttachmentPath`/`req.linesOwner` — introduce a `RestLinesContext` carrying these; handlers in router pass it explicitly.
- **6c service + middlewares**: `service.js` → `.ts`; `middlewares.js` → `.ts` with `setReqDataset/reqDataset/reqDatasetFull` accessors (the most-read context in the codebase — readers across query-advice, rate-limiting, cache-headers must already be accessor-based from Phase 5 ordering; verify). **Important (from Task 1.2 review): datasets contexts MUST use `legacyProp` dual-write — readers/setters span multiple sub-PRs. Settings skipped `legacyProp` only because its flip was atomic in one commit; do not copy that by analogy.**
- **6d router.js** (1553 LOC, 337 err): split into `datasets/routes/{metadata,lines,files,master-data,own-lines}.ts` thin adapters composed in `datasets/router.ts` (mount order preserved exactly); every inline handler body becomes a service call. This is the only phase allowed >1 PR by default: one PR per routes file.

### 8.6 Phase 7 — api-compat/ods (index.ts 709 LOC, 57 err)
Extract query translation (ODS params → ES queries) into `ods/operations.ts` with unit tests; index.ts keeps routing + response shaping. The 6 generated `.peg.js` parsers are untouched (unit-test imports + `build-parsers` pipeline).

---

## 9. Parking lot (deferred — revisit after the series, or as isolated PRs)

**Resolved in passing (recorded for transparency):**
0. Phase 0 (commit c5c8aa541): expanding `ResourceType` with `'remote-services'` forced exhaustive entries in the `api-docs.ts` records; side effect: `GET /api/v1/remote-services?facets=...` no longer 500s (previously a guaranteed TypeError in `permissions.filter` → `classByOperation['remote-services']`). Un-crashing only; no working response altered. No test covered it; consider adding one later.

0b. Phase 1 / Task 1.3 (commit fb97fe8b8): two recorded deltas. (i) A publication-sites POST that fails validation (400) or on the Mongo write no longer fires the two fire-and-forget event subscriptions first (old code subscribed before validating — junk subscriptions on failed writes; safe direction). (ii) `reqWriteContext` calls `reqHost(req)` eagerly, so a hypothetical INTERNAL (no x-forwarded-host) settings write would now 500 — real callers (portals sync) always come through the reverse proxy; revisit if an internal caller ever appears.

**Suspected bugs (verify with a failing test first, fix in dedicated PR):**
1. `settings/router.ts:295-307` (`updateDatasetsMetadata`, moves to service.ts in Phase 1 — preserve bit-for-bit): the `$unset` key interpolates the object `oldMeta` instead of `oldMeta.key` (produces `customMetadata.[object Object]`), and the surrounding `if (newDatasetsMetadata.custom?.some(nc => nc.key === oldMeta.key))` condition looks inverted (cleans up when the key *still exists* rather than when it was removed).
2. `datasets/middlewares.js:79` TODO: tests bypass the memoize cache (`NODE_ENV !== 'development'` guard) — coverage gap on the cache path.
2b. settings POST publication-sites (found in Task 1.2, preserved bit-for-bit): `mongo.settings.replaceOne(owner, settings, { upsert: true })` filters on `owner` (no `department: { $exists: false }` clause) while PUT/PATCH/DELETE use `ownerFilter` — for an org with department settings docs, the POST could match/replace the wrong settings document. Verify with a failing test (org-root site sync while department settings exist), fix in dedicated PR.

**Simplification / optimization candidates (not in this series):**
3. `remote-services/operations.ts:22` — `computeActions` marked "hard to understand, simplify?".
4. `datasets/es/commons.js` — beyond the mechanical 6a split, the query-building deserves a redesign pass.
5. applications/proxy.js config assembly — post-Phase-4 split, the templating/CSP logic can likely reuse `lib-express` serve-spa helpers.
6. Sequential independent awaits in middleware chains (e.g. dataset fetch + api-key settings lookup) — measured negligible; only worth touching if a latency budget ever demands it.
7. Remaining `.then()` chains → async/await sweep.
7a. Cross-cutting typings to pre-stage before Phase 6 (from Task 1.2 review): (i) eventsLog `account` expects lib-express `Account` (with `name`) but call sites pass `AccountKeys` — fix once (lib-express or a local adapter), ~12 occurrences in settings alone; (ii) Express 5 `req.params.x` is `string | string[]` — blessed narrowing idiom: `if (typeof req.params.x !== 'string') throw httpError(400, ...)` (no casts); add to conventions doc.
7b. `settings/operations.ts` typing polish (from Task 1.1 review): `fillSettings(… settings: any)`; the verbatim-moved `@ts-ignore` on `delete settings._id` (type the param `& { _id?: unknown }`); `fillSettings`'s plain `Error('base org ref in user')` → `httpError` decision (a pinning test now guards against silent change); optional test pinning `cleanDatasetsMetadata` slugify config.

**Test-suite speed step (the user's explicit next step after this series):**
8. Current shape: Playwright `workers: 1`, `fullyParallel: false`, full suite on every push. Levers, in likely order of value: parallelize API specs with per-spec resource prefixes (the nanoid `$text`-search pitfall is documented in project memory); rebalance e2e→api→unit now that operations.ts surfaces exist (this refactor is the enabler); compact redundant API specs. Keep identical until this series lands.

## 10. Definition of done — per-phase checklist template

- [ ] API/e2e specs untouched and green; unit specs: import-path edits only (+ new specs for new operations exports)
- [ ] `npm run check-types-ratchet` improved; `dev/type-errors-baseline.txt` updated and committed
- [ ] Zero suppressions added; module suppression count reduced (target 0)
- [ ] In the module: express imports only in `router.ts`/`middlewares.ts`/proxy; no `req` mutation (accessors only); no cross-module import of any `router.ts`/`middlewares.ts`
- [ ] Touched `.js` files converted to `.ts`
- [ ] Mount order and middleware chain order preserved exactly
- [ ] Parking lot updated with anything suspicious found (never fixed inline)
- [ ] `npm run quality` passes locally (husky will enforce on push)
- [ ] Record actual size/effort in the phase plan doc (calibrates the next phase)
